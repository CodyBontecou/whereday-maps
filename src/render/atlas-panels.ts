import { durationLabel } from "../journal";
import { BlockConfig, ExportShape, LocationPoint, Visit } from "../types";
import { localDay, memoryVisits, placeTarget, sortedVisits, tripSummary } from "../atlas";
import { buildPlayback } from "./playback";

interface Actions { focus: (visit: Visit) => void; openPlace: (target: string) => void; point: (point: LocationPoint) => void; insertPlaces?: (targets: string[]) => Promise<void> }
const distance = (meters: number) => meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
function placeLink(parent: HTMLElement, name: string, cfg: BlockConfig, actions: Actions): void {
	const target = placeTarget(name, cfg.places_folder);
	if (!target) return;
	const link = parent.createEl("a", { text: name, cls: "internal-link" });
	link.href = "#"; link.setAttribute("data-href", target); link.setAttribute("aria-label", `Open place note: ${target}`);
	link.addEventListener("click", event => { event.preventDefault(); actions.openPlace(target); });
}
function visitList(parent: HTMLElement, title: string, visits: Visit[], cfg: BlockConfig, actions: Actions, empty: string): void {
	const section = parent.createDiv({ cls: "whereday-visit-list" });
	section.createEl("h5", { text: `${title} (${visits.length})` });
	if (!visits.length) { section.createEl("p", { text: empty, cls: "whereday-caption" }); return; }
	const list = section.createEl("ol");
	for (const visit of visits) {
		const row = list.createEl("li");
		const name = visit.locationName?.trim() || "Unnamed stop";
		const focus = row.createEl("button", { text: `${new Date(visit.arrivedAt).toLocaleString()} · ${name}`, cls: "whereday-visit-focus" });
		focus.type = "button";
		focus.setAttribute("aria-label", `Show visit on map: ${name}`);
		focus.addEventListener("click", () => actions.focus(visit));
		if (visit.durationMinutes != null) row.createEl("span", { text: durationLabel(visit.durationMinutes), cls: "whereday-caption" });
		if (cfg.place_links && visit.locationName) placeLink(row, visit.locationName, cfg, actions);
	}
}

/** All displayed content uses DOM text APIs. Links are opened only on a user click. */
export function renderAtlasPanels(parent: HTMLElement, data: ExportShape, archive: ExportShape, cfg: BlockConfig, anchor: Date, actions: Actions): () => void {
	parent.empty();
	if (cfg.show_dashboard) {
		const summary = tripSummary(data, cfg.home, cfg.home_radius_meters);
		const section = parent.createDiv({ cls: "whereday-dashboard" });
		section.createEl("h5", { text: "Trip dashboard · current filters" });
		section.createEl("p", { text: `${summary.days} loaded days · ${summary.visits} stops · ${summary.places} place groups · ${summary.outings} outings` });
		section.createEl("p", { text: `${distance(summary.trackMeters)} clean segmented GPS track · ${distance(summary.recordedOutingMeters)} recorded outing distance (separate)` });
		section.createEl("p", { text: summary.awayVisitDays === null ? "Set home: [latitude, longitude] to count days with visits away from home." : `${summary.awayVisitDays} days with visits outside the home radius. Not a count of full days away.` });
		section.createEl("p", { text: "Loaded data only. GPS distance breaks at local midnight or gaps over 30 minutes; place groups use equal names or rounded coordinates, not reviewed passport identities.", cls: "whereday-caption" });
		if (summary.topPlaces.length) {
			const list = section.createEl("ul");
			for (const place of summary.topPlaces) {
				const row = list.createEl("li"); row.createEl("span", { text: `${place.count} ${place.count === 1 ? "stop" : "stops"} · ` });
				if (cfg.place_links) placeLink(row, place.name, cfg, actions);
				else row.createEl("span", { text: place.name });
			}
		}
	}
	const visits = sortedVisits(data.visits ?? []);
	if (cfg.place_links && !cfg.show_timeline && !cfg.show_dashboard) {
		const section = parent.createDiv(); section.createEl("h5", { text: "Place notes" });
		const names = [...new Set(visits.map(v => v.locationName?.trim()).filter((name): name is string => !!name))];
		if (!names.length) section.createEl("p", { text: "No named places in the current visits." });
		for (const name of names) { const row = section.createEl("p"); placeLink(row, name, cfg, actions); }
	}
	if (cfg.place_links && actions.insertPlaces) {
		const candidates = [...visits, ...(cfg.on_this_day ? memoryVisits(archive.visits ?? [], anchor) : [])];
		const targets = [...new Set(candidates.map(v => v.locationName ? placeTarget(v.locationName, cfg.places_folder) : null).filter((p): p is string => !!p))].slice(0, 250);
		if (targets.length) {
			const section = parent.createDiv({ cls: "whereday-backlink-action" });
			const button = section.createEl("button", { text: `Insert ${targets.length} place links into this note` }); button.type = "button";
			section.createEl("p", { text: "Writes real wiki links at the end of this note so Obsidian can index backlinks. Only on click; up to 250 places. Existing text is preserved.", cls: "whereday-caption" });
			const status = section.createEl("p"); status.setAttribute("role", "status");
			button.addEventListener("click", () => {
				button.disabled = true;
				void actions.insertPlaces!(targets).then(() => { status.textContent = "Place links inserted; existing links kept."; }).catch(error => { status.textContent = error instanceof Error ? error.message : String(error); }).finally(() => { button.disabled = false; });
			});
		}
	}
	if (cfg.show_timeline) visitList(parent, "Visit timeline", visits, cfg, actions, "No visits match these filters.");
	if (cfg.on_this_day) {
		visitList(parent, `On this day · ${localDay(anchor)} · earlier years`, memoryVisits(archive.visits ?? [], anchor), cfg, actions, "No earlier-year visits on this month/day in the loaded sources.");
		parent.createEl("p", { text: "Memories use loaded sources, not your entire vault, and ignore the map's day/time filters.", cls: "whereday-caption" });
	}
	return cfg.playback ? buildPlayback(parent, data.points ?? [], actions.point) : () => {};
}
