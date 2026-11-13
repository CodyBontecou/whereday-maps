export interface Visit {
	id?: string | null;
	confirmedAt?: string | null;
	updatedAt?: string | null;
	originalLatitude?: number | null;
	originalLongitude?: number | null;
	originalLocationName?: string | null;
	originalAddress?: string | null;
	detectedLatitude?: number | null;
	detectedLongitude?: number | null;
	detectedLocationName?: string | null;
	detectedAddress?: string | null;
	placeSource?: string | null;
	placeDistanceMeters?: number | null;
	latitude: number;
	longitude: number;
	arrivedAt: string;
	departedAt?: string | null;
	durationMinutes?: number | null;
	locationName?: string | null;
	address?: string | null;
	notes?: string | null;
	/** Native visit provenance; absent in older exports. Never inferred. */
	source?: string | null;
	confirmationStatus?: string | null;
}

export interface LocationPoint {
	latitude: number;
	longitude: number;
	timestamp: string;
	timestampUnix?: number;
	altitude?: number | null;
	speed?: number | null;
	course?: number | null;
	horizontalAccuracy?: number | null;
	verticalAccuracy?: number | null;
	isOutlier?: boolean;
}

/** Native outing JSON contains summaries/endpoints, not route tracks. */
export interface Outing {
	id: string;
	title: string;
	startedAt: string;
	endedAt: string | null;
	effectiveEndAt: string;
	durationSeconds: number | null;
	distanceMeters: number | null;
	pointCount: number | null;
	visitCount: number | null;
	isInferred: boolean;
	isActive: boolean;
	notes: string | null;
	start: [number, number] | null;
	end: [number, number] | null;
}

/** The detected format of an export file. */
export type DetectedFormat = "iso-me-json" | "iso-me-csv" | "iso-me-markdown" | "owntracks" | "overland" | "gpx" | "geojson" | "whereday-outings" | "unknown-json";

export interface SourceReceipt {
	path: string;
	exportDate?: string;
	visits: number;
	points: number;
	outings: number;
	duplicateOf?: string;
}

export interface ExportReceipt {
	sources: SourceReceipt[];
	duplicateVisits: number;
	duplicatePoints: number;
	duplicateOutings: number;
	revisedVisits: number;
	conflictingVisits: number;
	loadedAt: string;
}

export interface ExportShape {
	receipt?: ExportReceipt;
	visits: Visit[] | null;
	points: LocationPoint[] | null;
	outings?: Outing[];
	exportDate?: string;
	/** Exact files read, used by opt-in refresh without watching unrelated notes. */
	sourcePaths?: string[];
	/** The detected export format. Used by the UI to show format badges and stats. */
	detectedFormat?: DetectedFormat;
}

export interface BlockConfig {
	view?: import("./visualizations").VisualizationView;
	place?: string;
	journal?: boolean;
	appearance?: "whereday" | "native";
	show_receipt?: boolean;
	show_review?: boolean;
	show_passports?: boolean;
	show_chapters?: boolean;
	show_recall?: boolean;
	min_stop_minutes?: number;
	journal_folder?: string;
	trip_folder?: string;
	query?: string;
	recall_status?: string;
	recall_min_minutes?: number;
	recall_revisit?: boolean;
	from?: string;
	until?: string;
	source?: string;
	sources?: string[];
	zoom?: number;
	center?: [number, number];
	height?: number;
	show_visits?: boolean;
	show_routes?: boolean;
	show_outings?: boolean;
	show_stats?: boolean;
	interactive?: boolean;
	auto_fit?: boolean;
	tile_provider?: string;
	tile_url?: string;
	tile_attribution?: string;
	title?: string;
	date?: string;
	show_timeline?: boolean;
	on_this_day?: boolean;
	place_links?: boolean;
	places_folder?: string;
	playback?: boolean;
	heatmap?: boolean;
	auto_refresh?: boolean;
	show_dashboard?: boolean;
	home?: [number, number];
	home_radius_meters?: number;
}
