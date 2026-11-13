import { visitEvidence } from "./provenance";
import { ExportShape, LocationPoint, Visit } from "./types";

type RecordValue = Record<string, unknown>;
function record(value: unknown): RecordValue | null {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? value as RecordValue : null;
}
function number(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function text(value: unknown): string | null {
	return typeof value === "string" ? value : null;
}
function timestamp(value: unknown): string | null {
	const s = text(value);
	return s && Number.isFinite(Date.parse(s)) ? s : null;
}

export function isGeoJSONCollection(value: unknown): boolean {
	const root = record(value);
	return root?.type === "FeatureCollection" && Array.isArray(root.features);
}

/** Whereday exports Point features tagged kind=visit or kind=point.
 * Unknown geometry/kinds are skipped, never joined into invented tracks.
 */
export function parseGeoJSON(value: unknown): ExportShape {
	if (!isGeoJSONCollection(value)) {
		throw new Error("Expected a GeoJSON FeatureCollection with a features array.");
	}
	const root = value as RecordValue;
	const visits: Visit[] = [];
	const points: LocationPoint[] = [];
	for (const raw of root.features as unknown[]) {
		const feature = record(raw);
		const geometry = record(feature?.geometry);
		const props = record(feature?.properties);
		if (feature?.type !== "Feature" || geometry?.type !== "Point" || !props) continue;
		const coords = geometry.coordinates;
		if (!Array.isArray(coords) || coords.length < 2) continue;
		// GeoJSON is longitude first, unlike Leaflet.
		const longitude = number(coords[0]);
		const latitude = number(coords[1]);
		if (latitude === null || longitude === null || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) continue;
		if (props.kind === "visit") {
			const arrivedAt = timestamp(props.arrivedAt);
			if (!arrivedAt) continue;
			visits.push({
				...visitEvidence(props),
				latitude, longitude, arrivedAt,
				departedAt: timestamp(props.departedAt),
				durationMinutes: number(props.durationMinutes),
				locationName: text(props.locationName),
				address: text(props.address),
				notes: text(props.notes),
				source: text(props.source),
				confirmationStatus: text(props.confirmationStatus),
			});
		} else if (props.kind === "point") {
			const time = timestamp(props.timestamp);
			if (!time) continue;
			points.push({
				latitude, longitude, timestamp: time,
				timestampUnix: number(props.timestampUnix) ?? undefined,
				altitude: number(props.altitude) ?? number(coords[2]),
				speed: number(props.speed),
				horizontalAccuracy: number(props.horizontalAccuracy),
				isOutlier: props.isOutlier === true,
			});
		}
	}
	return { visits, points, exportDate: text(root.exportDate) ?? undefined, detectedFormat: "geojson" };
}
