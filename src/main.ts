import { Plugin } from "obsidian";
import {
	isExportFolderGranularity,
	normalizeExportFolderPathTemplate,
	normalizeVaultFolder,
} from "./export-layout";
import { parseBlockConfig } from "./parser";
import { MapRenderChild } from "./render/map-block";
import {
	DEFAULT_SETTINGS,
	findProviderByUrl,
	getProvider,
	isTileProviderId,
	IsoMeSettings,
	IsoMeSettingTab,
} from "./settings";

export default class IsoMeMapsPlugin extends Plugin {
	settings: IsoMeSettings = DEFAULT_SETTINGS;

	async onload(): Promise<void> {
		await this.loadSettings();

		// Keep existing vaults working; the plugin ID and saved settings stay stable.
		for (const language of ["whereday", "iso-me"]) {
			this.registerMarkdownCodeBlockProcessor(language, (source, el, ctx) => {
				const cfg = parseBlockConfig(source);
				const child = new MapRenderChild(el, this.app, this.settings, cfg, ctx);
				ctx.addChild(child);
			});
		}

		for (const [view,label] of [["stay-strip","Stay Strip"],["day-dial","Day Dial"],["route-card","Route Card"],["return-calendar","Return Calendar"],["weekly-rhythm","Weekly Rhythm"]]) {
			this.addCommand({
				id: `insert-${view}`, name: `Insert ${label}`,
				editorCallback: editor => editor.replaceSelection(["```whereday", `source: ${JSON.stringify(this.settings.exportsFolder || "exports")}`, `view: ${view}`, ...(view === "route-card" ? ["tile_provider: osm"] : []), "```", ""].join("\n")),
			});
		}
		this.addCommand({
			id: "insert-field-journal",
			name: "Insert Field Journal",
			editorCallback: editor => editor.replaceSelection([
				"```whereday", `source: ${JSON.stringify(this.settings.exportsFolder || "exports")}`,
				"journal: true", "show_receipt: true", "auto_refresh: true", "tile_provider: none", "```", ""
			].join("\n")),
		});
		this.addSettingTab(new IsoMeSettingTab(this.app, this));
	}

	async loadSettings(): Promise<void> {
		const data = (await this.loadData()) as Partial<IsoMeSettings> | null;
		this.settings = { ...DEFAULT_SETTINGS, ...(data ?? {}) };
		let dirty = false;
		const hasSavedUrl = typeof data?.tileUrl === "string" && data.tileUrl.trim().length > 0;
		// Fresh installs stay local. Older installs without a provider retain the
		// provider implied by their URL, including OSM on mobile and custom hosts.
		// Do not replace a user's network/privacy choice with the new default.
		if (!isTileProviderId(data?.tileProvider)) {
			const match = hasSavedUrl ? findProviderByUrl(this.settings.tileUrl) : undefined;
			this.settings.tileProvider = match ? match.id : hasSavedUrl ? "custom" : "none";
			dirty = true;
		}
		// Some saved settings name a preset without storing its URL. Restore that
		// preset, not the empty URL of the new local-only default.
		if (this.settings.tileProvider !== "none" && this.settings.tileProvider !== "custom" && !hasSavedUrl) {
			const preset = getProvider(this.settings.tileProvider);
			this.settings.tileUrl = preset.url;
			this.settings.tileAttribution = data?.tileAttribution ?? preset.attribution;
			dirty = true;
		}
		if (!isExportFolderGranularity(this.settings.exportFolderGranularity)) {
			this.settings.exportFolderGranularity =
				DEFAULT_SETTINGS.exportFolderGranularity;
			dirty = true;
		}
		const normalizedExportsFolder = normalizeVaultFolder(this.settings.exportsFolder);
		if (normalizedExportsFolder !== this.settings.exportsFolder) {
			this.settings.exportsFolder = normalizedExportsFolder;
			dirty = true;
		}
		const normalizedFolderTemplate = normalizeExportFolderPathTemplate(
			this.settings.exportFolderCustomPathTemplate,
		);
		if (normalizedFolderTemplate !== this.settings.exportFolderCustomPathTemplate) {
			this.settings.exportFolderCustomPathTemplate = normalizedFolderTemplate;
			dirty = true;
		}
		if (dirty) await this.saveSettings();
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
