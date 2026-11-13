import { VISUALIZATION_VIEWS } from "./visualizations";
import { BlockConfig } from "./types";

const BOOL_KEYS = new Set([
	"journal", "show_receipt", "show_review", "show_passports", "show_chapters", "show_recall", "recall_revisit",
	"show_visits",
	"show_routes",
	"show_outings",
	"show_stats",
	"interactive",
	"auto_fit",
	"show_timeline", "on_this_day", "place_links", "playback", "heatmap", "auto_refresh", "show_dashboard",
]);
const NUMBER_KEYS = new Set(["zoom", "height", "home_radius_meters", "min_stop_minutes", "recall_min_minutes"]);

function normalizeKey(key: string): string {
	return key.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase().replace(/-/g, "_");
}

function parseCenter(value: string): [number, number] | undefined {
	const m = value.match(/^\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]$/);
	if (!m) return undefined;
	const lat = Number(m[1]);
	const lon = Number(m[2]);
	if (!Number.isFinite(lat) || !Number.isFinite(lon)) return undefined;
	return [lat, lon];
}

function parseBool(value: string): boolean | undefined {
	const v = value.toLowerCase();
	if (v === "true" || v === "yes" || v === "on" || v === "1") return true;
	if (v === "false" || v === "no" || v === "off" || v === "0") return false;
	return undefined;
}

function unquote(value: string): string {
	if (value.startsWith('"') && value.endsWith('"')) {
		try { const decoded = JSON.parse(value); if (typeof decoded === "string") return decoded; } catch { /* accept legacy quoted strings */ }
	}
	return value.replace(/^["'](.*)["']$/, "$1");
}

function splitListValue(value: string): string[] {
	let inner = value.trim();
	if (inner.startsWith("[") && inner.endsWith("]")) {
		inner = inner.slice(1, -1);
	}
	return inner
		.split(",")
		.map((s) => unquote(s.trim()))
		.filter((s) => s.length > 0);
}

export function parseBlockConfig(source: string): BlockConfig {
	const cfg: BlockConfig = {};
	const lines = source.split(/\r?\n/);
	let i = 0;

	while (i < lines.length) {
		const rawLine = lines[i];
		const line = rawLine.trim();
		i++;

		if (!line || line.startsWith("#")) continue;
		const m = line.match(/^([a-z_-]+)\s*:\s*(.*)$/i);
		if (!m) continue;
		const key = normalizeKey(m[1]);
		const rawValue = m[2].trim();
		const value = unquote(rawValue);

		if (key === "sources") {
			const collected: string[] = [];
			if (rawValue.length > 0) {
				collected.push(...splitListValue(rawValue));
			} else {
				while (i < lines.length) {
					const itemMatch = lines[i].match(/^\s*-\s+(.+?)\s*$/);
					if (!itemMatch) break;
					collected.push(unquote(itemMatch[1]));
					i++;
				}
			}
			if (collected.length > 0) cfg.sources = collected;
			continue;
		}

		if (rawValue.length === 0) continue;

		if (key === "view") {
			if (!(VISUALIZATION_VIEWS as readonly string[]).includes(value)) throw new Error(`Unknown Whereday view: ${value}. Choose ${VISUALIZATION_VIEWS.join(", ")}.`);
			cfg.view = value as BlockConfig["view"];
		} else if (key === "place") {
			cfg.place = value;
		} else if (["journal_folder", "trip_folder", "query", "from", "until", "recall_status"].includes(key)) {
			(cfg as Record<string, unknown>)[key] = value;
		} else if (key === "appearance" && (value === "native" || value === "whereday")) {
			cfg.appearance = value;
		} else if (key === "source") {
			cfg.source = value;
		} else if (key === "date") {
			cfg.date = value;
		} else if (key === "places_folder") {
			cfg.places_folder = value;
		} else if (key === "title") {
			cfg.title = value;
		} else if (key === "tile_provider") {
			cfg.tile_provider = value.toLowerCase();
		} else if (key === "tile_url" || key === "tile_layer_url") {
			cfg.tile_url = value;
		} else if (key === "tile_attribution") {
			cfg.tile_attribution = value;
		} else if (key === "center" || key === "home") {
			const c = parseCenter(value);
			if (c) {
				if (key === "home") cfg.home = c;
				else cfg.center = c;
			}
		} else if (NUMBER_KEYS.has(key)) {
			const n = Number(value);
			if (Number.isFinite(n)) {
				if (key === "recall_min_minutes") cfg.recall_min_minutes = Math.max(0,n);
				else if (key === "min_stop_minutes") cfg.min_stop_minutes = Math.max(0, Math.min(n, 1440));
				else if (key === "zoom") cfg.zoom = n;
				else if (key === "height") cfg.height = n;
				else if (key === "home_radius_meters") cfg.home_radius_meters = Math.max(1, Math.min(n, 100000));
			}
		} else if (BOOL_KEYS.has(key)) {
			const b = parseBool(value);
			if (b !== undefined) {
				if (["journal", "show_receipt", "show_review", "show_passports", "show_chapters", "show_recall", "recall_revisit"].includes(key)) (cfg as Record<string, unknown>)[key] = b;
				else if (key === "show_visits") cfg.show_visits = b;
				else if (key === "show_routes") cfg.show_routes = b;
				else if (key === "show_outings") cfg.show_outings = b;
				else if (key === "show_stats") cfg.show_stats = b;
				else if (key === "interactive") cfg.interactive = b;
				else if (key === "auto_fit") cfg.auto_fit = b;
				else if (key === "show_timeline") cfg.show_timeline = b;
				else if (key === "on_this_day") cfg.on_this_day = b;
				else if (key === "place_links") cfg.place_links = b;
				else if (key === "playback") cfg.playback = b;
				else if (key === "heatmap") cfg.heatmap = b;
				else if (key === "auto_refresh") cfg.auto_refresh = b;
				else if (key === "show_dashboard") cfg.show_dashboard = b;
			}
		}
	}
	return cfg;
}
