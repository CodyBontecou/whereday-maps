import { Outing } from "./types";

function time(value: unknown): string | null {
	return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}
function nonnegative(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}
function count(value: unknown): number | null {
	const n = nonnegative(value);
	return n !== null && Number.isInteger(n) ? n : null;
}
function coordinates(lat: unknown, lon: unknown): [number, number] | null {
	if (typeof lat !== "number" || typeof lon !== "number" || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
	return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? [lat, lon] : null;
}

/** Mirrors ExportService.ExportableOuting. Missing coordinates do not discard a
 * useful summary. No points or visits are synthesized from summary counts. */
export function parseOutings(rows: unknown[]): Outing[] {
	const outings: Outing[] = [];
	for (const row of rows) {
		if (!row || typeof row !== "object" || Array.isArray(row)) continue;
		const r = row as Record<string, unknown>;
		const startedAt = time(r.startedAt);
		const effectiveEndAt = time(r.effectiveEndAt);
		if (typeof r.id !== "string" || !r.id.trim() || !startedAt || !effectiveEndAt) continue;
		if (Date.parse(effectiveEndAt) < Date.parse(startedAt)) continue;
		outings.push({
			id: r.id,
			title: typeof r.title === "string" && r.title.trim() ? r.title : "Untitled outing",
			startedAt, effectiveEndAt, endedAt: time(r.endedAt),
			durationSeconds: nonnegative(r.durationSeconds),
			distanceMeters: nonnegative(r.distanceMeters),
			pointCount: count(r.pointCount), visitCount: count(r.visitCount),
			isInferred: r.isInferred === true, isActive: r.isActive === true,
			notes: typeof r.notes === "string" ? r.notes : null,
			start: coordinates(r.startLatitude, r.startLongitude),
			end: coordinates(r.endLatitude, r.endLongitude),
		});
	}
	return outings;
}
