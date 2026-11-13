import { renderVisualization } from "./visualizations";
import { journalRepository, JournalRepository } from "../journal-repository";
import { dayVisits, placeInk, rangeData, dayStayMinutes } from "../journal";
import { renderJournal, renderReceipt } from "./journal";
import * as L from "leaflet";
import { App, MarkdownPostProcessorContext, MarkdownRenderChild } from "obsidian";
import { DataLoadError, loadExports, resolveExportPaths } from "../data-loader";
import { IsoMeSettings, resolveTileLayer } from "../settings";
import { BlockConfig, ExportShape, Visit } from "../types";
import { anchorDate, localDay, noteSources, parseDay } from "../atlas";
import { SourceRefresh } from "../source-refresh";
import { insertPlaceLinks } from "../place-links";
import { renderAtlasPanels } from "./atlas-panels";
import { renderHeatmap } from "./heatmap";
import {
	buildControls,
	collectDays,
	DEFAULT_FILTER,
	filterData,
	FilterState,
} from "./controls";
import { addBasemap } from "./basemap";
import { renderOutlierMarkers } from "./outliers";
import { outingEndpoints, renderOutingEndpoints, renderOutingSummaries } from "./outings";
import { renderRoutePolyline } from "./routes";
import { computeStats, renderStatsBar } from "./stats-bar";
import { renderVisitMarkers, buildVisitPopup } from "./visits";

export class MapRenderChild extends MarkdownRenderChild {
	private map: L.Map | null = null;
	private widgetDispose: (() => void) | null = null;
	private dynamicLayers: L.LayerGroup | null = null;
	private fullData: ExportShape | null = null;
	private archiveData: ExportShape | null = null;
	private outingPanel: HTMLElement | null = null;
	private filter: FilterState = { ...DEFAULT_FILTER };
	private hasFitInitial = false;
	private resizeObserver: ResizeObserver | null = null;
	private intersectionObserver: IntersectionObserver | null = null;
	private layoutRefreshRaf: number | null = null;
	private layoutRefreshTimers: number[] = [];
	private renderVersion = 0;
	private atlasPanel: HTMLElement | null = null;
	private journalPanel: HTMLElement | null = null;
	private receiptPanel: HTMLElement | null = null;
	private journalStore: JournalRepository | null = null;
	private selectedDay: string | null = null;
	private loadError: HTMLElement | null = null;
	private focusLayer: L.LayerGroup | null = null;
	private stopPlayback: (() => void) | null = null;
	private watcher: SourceRefresh | null = null;
	private referenceDate = new Date();

	constructor(
		containerEl: HTMLElement,
		private app: App,
		private settings: IsoMeSettings,
		private cfg: BlockConfig,
		private ctx: MarkdownPostProcessorContext,
	) {
		super(containerEl);
	}

	onload(): void {
		this.containerEl.addClass("iso-me-block");
		if (typeof window !== "undefined") this.registerDomEvent(window, "resize", () => this.queueLayoutRefresh());
		if (this.cfg.auto_refresh) {
			this.watcher = new SourceRefresh(
				() => resolveExportPaths(this.app, this.sources(), this.settings),
				() => { void this.render(++this.renderVersion); },
			);
			this.registerEvent(this.app.vault.on("modify", file => this.watcher?.changed(file.path, "modify")));
			this.registerEvent(this.app.vault.on("create", file => this.watcher?.changed(file.path, "create")));
			this.registerEvent(this.app.vault.on("delete", file => this.watcher?.changed(file.path, "delete")));
			this.registerEvent(this.app.vault.on("rename", (file, oldPath) => this.watcher?.changed(file.path, "rename", oldPath)));
		}
		void this.render(++this.renderVersion);
	}

	onunload(): void {
		// Invalidate pending file reads before removing DOM/map resources.
		this.renderVersion++;
		this.watcher?.dispose();
		this.watcher = null;
		this.clearView();
	}

	private sources(): string[] {
		const sources = [...(this.cfg.source ? [this.cfg.source] : []), ...(this.cfg.sources ?? [])];
		return noteSources(sources, this.ctx.sourcePath ?? "", this.cfg.date);
	}

	private clearView(): void {
		this.widgetDispose?.(); this.widgetDispose = null;
		this.stopPlayback?.(); this.stopPlayback = null;
		this.disconnectLayoutWatchers();
		if (this.map) {
			this.map.remove();
			this.map = null;
		}
		this.dynamicLayers = null;
		this.fullData = null;
		this.archiveData = null;
		this.outingPanel = null;
		this.atlasPanel = null;
		this.journalPanel = null;
		this.receiptPanel = null;
		this.loadError = null;
		this.focusLayer = null;
		this.hasFitInitial = false;
		this.containerEl.empty();
	}

	private async render(version: number): Promise<void> {
		const previous = this.archiveData ?? undefined;
		if (!this.cfg.source && !this.cfg.sources?.length) {
			this.renderError(
				"Missing required `source:` (or `sources:`) key. Point it at a Whereday export file (.json, .geojson, .csv, .md, or .gpx).",
			);
			return;
		}

		let data: ExportShape;
		try {
			this.referenceDate = anchorDate(this.ctx.sourcePath ?? "", this.cfg.date);
			data = await loadExports(this.app, this.sources(), this.settings);
			data = rangeData(data,this.cfg.from,this.cfg.until);
			if (!this.cfg.view && (this.cfg.journal || this.cfg.show_review || this.cfg.show_passports || this.cfg.show_chapters || this.cfg.show_recall)) {
				this.journalStore = journalRepository(this.app);
				await this.journalStore.load();
			}
		} catch (e) {
			if (version !== this.renderVersion) return;
			const msg =
				e instanceof DataLoadError
					? e.message
					: e instanceof Error
						? e.message
						: String(e);
			if (previous && (this.map || this.widgetDispose)) {
				this.loadError?.remove();
				this.loadError = this.containerEl.createEl("p", { text: `Refresh failed · showing last successful snapshot. ${msg}`, cls: "iso-me-error" });
				this.loadError.setAttribute("role", "alert");
				this.receiptPanel?.prepend(this.loadError);
			} else this.renderError(msg);
			return;
		}

		if (version !== this.renderVersion) return;

		this.clearView();
		if (this.cfg.journal || this.cfg.appearance === "whereday") this.containerEl.addClass("wd-appearance");
		if (this.cfg.appearance === "native") this.containerEl.removeClass("wd-appearance");
		if (this.cfg.title && !this.cfg.view) this.containerEl.createEl("h4", { text: this.cfg.title, cls: "iso-me-title" });
		if (!this.selectedDay) this.selectedDay = localDay(this.referenceDate);
		this.watcher?.track(data.sourcePaths ?? []);
		if (this.cfg.view ? this.cfg.show_receipt === true : (this.cfg.show_receipt ?? this.cfg.journal)) {
			this.receiptPanel = this.containerEl.createDiv({ cls: "wd-receipt" });
			renderReceipt(this.receiptPanel, data, () => { void this.render(++this.renderVersion); }, previous);
		}

		if (this.cfg.view) {
			this.archiveData = data; this.fullData = data;
			this.widgetDispose = renderVisualization(this.containerEl, data, this.cfg, parseDay(this.selectedDay!) ?? this.referenceDate, this.settings, day => { this.selectedDay = day; });
			return;
		}

		if ((data.visits?.length ?? 0) === 0 && (data.points?.length ?? 0) === 0 && (data.outings?.length ?? 0) === 0) {
			this.renderEmpty("Export contains no visits, location points, or outing summaries.");
			return;
		}

		this.archiveData = data;
		const daily = [this.cfg.source ?? "", ...(this.cfg.sources ?? [])].some(source => source.trim().toLowerCase() === "note-date");
		if (daily) {
			data = filterData(data, { ...DEFAULT_FILTER, day: localDay(this.referenceDate) });
			this.containerEl.createEl("p", { text: `Daily note · ${localDay(this.referenceDate)} · local timestamp date`, cls: "whereday-caption" });
		}
		this.fullData = data;

		if (this.cfg.interactive && !this.cfg.journal) {
			const days = collectDays(data);
			buildControls(this.containerEl, days, this.filter, (state) => {
				this.filter = state;
				this.applyFilter();
			}, data.detectedFormat);
		}

		if (this.cfg.show_stats ?? false) {
			// Render stats bar above the map (non-critical — swallow errors gracefully)
			try {
				const stats = computeStats(data);
				renderStatsBar(this.containerEl, stats);
			} catch {
				// Stats bar is best-effort; never block the map.
			}
		}

		if (data.outings?.length && this.cfg.show_outings !== false) {
			this.outingPanel = this.containerEl.createDiv({ cls: "iso-me-outings" });
		}

		if (this.cfg.show_timeline || this.cfg.on_this_day || this.cfg.place_links || this.cfg.playback || this.cfg.show_dashboard || this.cfg.heatmap) {
			this.atlasPanel = this.containerEl.createDiv({ cls: "whereday-atlas-panels" });
		}
		if (this.journalStore && (this.cfg.journal || this.cfg.show_review || this.cfg.show_passports || this.cfg.show_chapters || this.cfg.show_recall)) {
			this.journalPanel = this.containerEl.createDiv({ cls: "wd-journal" });
		}
		const mapEl = this.containerEl.createDiv({ cls: "iso-me-map" });
		mapEl.style.height = `${this.cfg.height ?? this.settings.defaultHeight}px`;

		const map = L.map(mapEl, {
			zoomControl: true,
			attributionControl: true,
			scrollWheelZoom: false,
		});
		this.map = map;

		const tileLayer = resolveTileLayer(this.settings, {
			tile_provider: this.cfg.tile_provider,
			tile_url: this.cfg.tile_url,
			tile_attribution: this.cfg.tile_attribution,
		});
		if (!addBasemap(map, tileLayer)) {
			mapEl.addClass("iso-me-map-offline");
			const notice = this.containerEl.createDiv({
				cls: "iso-me-basemap-notice",
				text: "Basemap off · No map tile requests. Visits and routes remain visible.",
			});
			notice.setAttribute("role", "note");
			mapEl.before(notice);
		}

		this.dynamicLayers = L.layerGroup().addTo(map);
		this.focusLayer = L.layerGroup().addTo(map);

		this.applyFilter();

		this.installLayoutWatchers(mapEl);
		this.scheduleInitialLayoutRefresh();
	}

	private installLayoutWatchers(mapEl: HTMLElement): void {
		this.disconnectLayoutWatchers();

		if (typeof ResizeObserver !== "undefined") {
			this.resizeObserver = new ResizeObserver(() => {
				this.queueLayoutRefresh();
			});
			this.resizeObserver.observe(mapEl);
			this.resizeObserver.observe(this.containerEl);
		}

		if (typeof IntersectionObserver !== "undefined") {
			this.intersectionObserver = new IntersectionObserver((entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					this.queueLayoutRefresh();
				}
			});
			this.intersectionObserver.observe(mapEl);
		}

	}

	private scheduleInitialLayoutRefresh(): void {
		// Obsidian reading mode can finish code-block post-processing before the
		// preview pane has reached its final width/visibility. Leaflet caches that
		// early size, leaving only the top-left tiles painted until a later edit-mode
		// toggle forces a reflow. Re-check for a short window so maps recover once
		// the note, scroll container, and any surrounding callouts/layout settle.
		this.queueLayoutRefresh();
		for (const delay of [50, 150, 300, 600, 1000]) {
			const timer = window.setTimeout(() => {
				this.queueLayoutRefresh();
			}, delay);
			this.layoutRefreshTimers.push(timer);
		}
	}

	private queueLayoutRefresh(): void {
		if (!this.map || this.layoutRefreshRaf !== null) return;

		this.layoutRefreshRaf = window.requestAnimationFrame(() => {
			this.layoutRefreshRaf = null;
			this.refreshMapLayout();
		});
	}

	private refreshMapLayout(): void {
		const map = this.map;
		if (!map) return;

		if (!this.hasUsableMapSize(map)) return;

		map.invalidateSize({ pan: false, debounceMoveend: true });

		// If the initial bounds fit was attempted while Obsidian had the map in a
		// hidden/zero-sized layout, retry it once the container becomes measurable.
		if (!this.hasFitInitial) {
			this.applyFilter();
		}
	}

	private hasUsableMapSize(map: L.Map): boolean {
		const rect = map.getContainer().getBoundingClientRect();
		return rect.width > 0 && rect.height > 0;
	}

	private disconnectLayoutWatchers(): void {
		if (this.layoutRefreshRaf !== null) {
			window.cancelAnimationFrame(this.layoutRefreshRaf);
			this.layoutRefreshRaf = null;
		}
		for (const timer of this.layoutRefreshTimers) {
			window.clearTimeout(timer);
		}
		this.layoutRefreshTimers = [];

		this.resizeObserver?.disconnect();
		this.resizeObserver = null;
		this.intersectionObserver?.disconnect();
		this.intersectionObserver = null;
	}

	private applyFilter(): void {
		const map = this.map;
		const target = this.dynamicLayers;
		if (!map || !target || !this.fullData) return;

		try {
			this.stopPlayback?.(); this.stopPlayback = null;
			this.focusLayer?.clearLayers();
			target.clearLayers();

			let filtered = filterData(this.fullData, this.filter);
			if (this.cfg.journal && this.selectedDay) {
				filtered = filterData(this.fullData, { ...this.filter, day: this.selectedDay });
				filtered.visits = dayVisits(this.fullData, this.selectedDay).filter(v => {
					const minutes = dayStayMinutes(v,this.selectedDay!,this.fullData!.exportDate);
					return minutes === null || minutes >= (this.cfg.min_stop_minutes ?? 1);
				});
			}
			if (this.journalPanel && this.journalStore) {
				renderJournal(this.journalPanel, this.archiveData ?? this.fullData, this.cfg, this.selectedDay ?? localDay(this.referenceDate), this.journalStore, {
					focus: visit => this.focusVisit(visit),
					minimum: minutes => { this.cfg.min_stop_minutes = minutes; this.applyFilter(); },
					day: day => { this.selectedDay = day; this.hasFitInitial = false; this.applyFilter(); },
					open: async path => { await this.app.workspace.openLinkText(path, this.ctx.sourcePath ?? ""); },
					refresh: () => this.applyFilter(),
				});
			}

			const showVisits = this.cfg.show_visits ?? this.settings.showVisitsByDefault;
			const showRoutes = this.cfg.show_routes ?? this.settings.showRoutesByDefault;
			const showOutliers = this.settings.showOutliersByDefault;

			const visits = showVisits && filtered.visits ? filtered.visits : [];
			const allPoints = filtered.points ?? [];
			const cleanPoints = allPoints.filter((p) => !p.isOutlier);
			const outlierPoints = allPoints.filter((p) => p.isOutlier);

			const bounds: L.LatLngTuple[] = [];
			let densityCaption = "";
			if (this.cfg.heatmap) {
				const density = renderHeatmap(target, filtered);
				bounds.push(...density.bounds); densityCaption = density.caption;
			}
			const outings = this.cfg.show_outings !== false ? filtered.outings ?? [] : [];
			if (this.outingPanel) {
				renderOutingSummaries(this.outingPanel, outings, (outing) => {
					const coordinates = outingEndpoints(outing).map((e) => e.coordinate);
					if (coordinates.length === 1) map.setView(coordinates[0], this.cfg.zoom ?? 14);
					else if (coordinates.length > 1) map.fitBounds(L.latLngBounds(coordinates), { padding: [20, 20] });
				});
			}
			if (outings.length > 0) {
				bounds.push(...renderOutingEndpoints(target, outings, this.settings.routeColor));
			}

			if (visits.length > 0) {
				bounds.push(...renderVisitMarkers(target, visits, this.cfg.journal ? visit => journalColor(placeInk(visit,this.journalStore?.snapshot.places)) : this.settings.markerColor));
			}

			if (showRoutes && cleanPoints.length > 0) {
				bounds.push(
					...renderRoutePolyline(target, cleanPoints, this.cfg.journal ? journalColor(2) : this.settings.routeColor),
				);
			}

			if (showOutliers && outlierPoints.length > 0) {
				bounds.push(
					...renderOutlierMarkers(target, outlierPoints, this.settings.outlierColor),
				);
			}

			if (this.atlasPanel) {
				let cursor: L.CircleMarker | null = null;
				this.stopPlayback = renderAtlasPanels(this.atlasPanel, filtered, this.archiveData ?? this.fullData, this.cfg, this.referenceDate, {
					focus: visit => this.focusVisit(visit),
					insertPlaces: targets => insertPlaceLinks(this.app, this.ctx.sourcePath ?? "", targets),
					openPlace: path => { void this.app.workspace.openLinkText(path, this.ctx.sourcePath ?? "").catch(e => this.renderError(e instanceof Error ? e.message : String(e))); },
					point: point => {
						const coordinate: L.LatLngTuple = [point.latitude, point.longitude];
						if (!cursor) cursor = L.circleMarker(coordinate, { radius: 7, color: "#ffffff", weight: 3, fillColor: "#7c3aed", fillOpacity: 1 }).addTo(target);
						else { cursor.setLatLng(coordinate); map.panTo(coordinate); }
					},
				});
				if (densityCaption) this.atlasPanel.createEl("p", { text: densityCaption, cls: "whereday-caption" });
			}

			if (bounds.length === 0 || this.cfg.auto_fit === false) {
				if (!this.hasFitInitial) {
					const center = this.cfg.center ?? this.settings.defaultCenter;
					map.setView(center, this.cfg.zoom ?? this.settings.defaultZoom);
					this.hasFitInitial = true;
				}
				return;
			}

			if (!this.hasUsableMapSize(map)) {
				// Leaflet needs a real container size to calculate a bounds-based zoom.
				// Obsidian can render post-processors before the pane is visible, so leave
				// the initial fit pending for the layout watcher instead of falling back to
				// the configured/default home center.
				return;
			}

			if (bounds.length === 1) {
				map.setView(bounds[0], this.cfg.zoom ?? 14);
			} else {
				map.fitBounds(L.latLngBounds(bounds), { padding: [20, 20] });
			}
			this.hasFitInitial = true;
		} catch {
			// Layer rendering is best-effort; show at least the basemap.
			if (!this.hasFitInitial) {
				map.setView(
					this.cfg.center ?? this.settings.defaultCenter,
					this.cfg.zoom ?? this.settings.defaultZoom,
				);
				this.hasFitInitial = true;
			}
		}
	}

	private focusVisit(visit: Visit): void {
		if (!this.map || !this.focusLayer) return;
		this.focusLayer.clearLayers();
		const coordinate: L.LatLngTuple = [visit.latitude, visit.longitude];
		this.map.setView(coordinate, this.cfg.zoom ?? 14);
		L.circleMarker(coordinate, { radius: 12, color: this.settings.markerColor, weight: 3, fillOpacity: 0.6 })
			.bindPopup(buildVisitPopup(visit)).addTo(this.focusLayer).openPopup();
		this.map.getContainer().scrollIntoView({ block: "nearest" });
	}

	private renderError(message: string): void {
		this.containerEl.createDiv({
			cls: "iso-me-error",
			text: `Whereday: ${message}`,
		});
	}

	private renderEmpty(message: string): void {
		this.containerEl.createDiv({
			cls: "iso-me-empty",
			text: message,
		});
	}
}

function journalColor(index: number): string {
	const dark = typeof document !== "undefined" && document.body.classList.contains("theme-dark");
	return (dark ? ["#ECE6D8", "#F0805F", "#E0B565", "#9DC097"] : ["#1E2B45", "#C2462A", "#B7862B", "#5E7F5A"])[index];
}
