import { ExportShape, LocationPoint, Visit } from "./types";

export function localDay(date: Date): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function parseDay(value: string): Date | null {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
	const [y, m, d] = value.split("-").map(Number);
	const date = new Date(0);
	date.setFullYear(y, m - 1, d);
	date.setHours(12, 0, 0, 0); // local noon avoids midnight DST transitions
	return localDay(date) === value ? date : null;
}
export function anchorDate(sourcePath: string, explicit?: string, now = new Date()): Date {
	if (explicit !== undefined) {
		const date = parseDay(explicit);
		if (!date) throw new Error("date must be a valid YYYY-MM-DD calendar date.");
		return date;
	}
	const filename = sourcePath.split("/").pop()?.replace(/\.md$/i, "") ?? "";
	const match = filename.match(/^(\d{4}-\d{2}-\d{2})(?:$|[\s_])/);
	return (match ? parseDay(match[1]) : null) ?? now;
}
export function noteSources(sources: string[], sourcePath: string, explicit?: string): string[] {
	return sources.map((source) => {
		if (source.trim().toLowerCase() !== "note-date") return source;
		const filename = sourcePath.split("/").pop()?.replace(/\.md$/i, "") ?? "";
		const value = explicit ?? filename.match(/^(\d{4}-\d{2}-\d{2})(?:$|[\s_])/)?.[1];
		if (!value || !parseDay(value)) throw new Error("source: note-date needs a YYYY-MM-DD note filename or an explicit date: YYYY-MM-DD.");
		return value;
	});
}
export function validCoordinate(latitude: number, longitude: number): boolean {
	return Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
}
export function sortedVisits(visits: Visit[]): Visit[] {
	return visits.filter(v => Number.isFinite(Date.parse(v.arrivedAt)) && validCoordinate(v.latitude, v.longitude))
		.slice().sort((a, b) => Date.parse(a.arrivedAt) - Date.parse(b.arrivedAt));
}
export function memoryVisits(visits: Visit[], anchor: Date): Visit[] {
	return sortedVisits(visits).filter(v => {
		const d = new Date(v.arrivedAt);
		return d.getFullYear() < anchor.getFullYear() && d.getMonth() === anchor.getMonth() && d.getDate() === anchor.getDate();
	}).reverse();
}
export function playbackPoints(points: LocationPoint[]): LocationPoint[] {
	return points.filter(p => !p.isOutlier && Number.isFinite(Date.parse(p.timestamp)) && validCoordinate(p.latitude, p.longitude))
		.slice().sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}
export function placeTarget(name: string, folder = "Places"): string | null {
	const title = name.replace(/[\\/:#^|\[\]\r\n<>?*"]/g, " ").replace(/\s+/g, " ").trim().replace(/^\.+|\.+$/g, "");
	if (!title) return null;
	const root = folder.replace(/\\/g, "/").split("/").filter(part => part && part !== "." && part !== "..").map(part => part.replace(/[:#^|\[\]\r\n<>?*"]/g, " ").trim()).filter(Boolean).join("/");
	return root ? `${root}/${title}` : title;
}
export function distanceMeters(a: [number, number], b: [number, number]): number {
	const rad = Math.PI / 180;
	const dLat = (b[0] - a[0]) * rad, dLon = (b[1] - a[1]) * rad;
	const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
	return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
export interface DensityCell { latitude: number; longitude: number; count: number }
export function densityCells(data: ExportShape, limit = 1000): { cells: DensityCell[]; kind: string; totalCells: number } {
	const visits = sortedVisits(data.visits ?? []);
	const samples = visits.length ? visits : playbackPoints(data.points ?? []);
	const cells = new Map<string, DensityCell>();
	for (const p of samples) {
		// Fixed 0.001-degree cells: approximate, not a distance-accurate heat surface.
		const key = `${Math.floor(p.latitude * 1000)}:${Math.floor(p.longitude * 1000)}`;
		const cell = cells.get(key) ?? { latitude: 0, longitude: 0, count: 0 };
		cell.latitude += p.latitude; cell.longitude += p.longitude; cell.count++;
		cells.set(key, cell);
	}
	const result = [...cells.values()].map(c => ({ latitude: c.latitude / c.count, longitude: c.longitude / c.count, count: c.count }))
		.sort((a, b) => b.count - a.count || a.latitude - b.latitude || a.longitude - b.longitude);
	return { cells: result.slice(0, Math.max(0, Math.min(1000, limit))), kind: visits.length ? "Visit density" : "GPS sample density", totalCells: result.length };
}
export interface TripSummary {
	days: number; visits: number; places: number; outings: number; trackMeters: number;
	recordedOutingMeters: number; awayVisitDays: number | null; topPlaces: { name: string; count: number }[];
}
export function tripSummary(data: ExportShape, home?: [number, number], radius = 200): TripSummary {
	const visits = sortedVisits(data.visits ?? []), points = playbackPoints(data.points ?? []);
	const days = new Set<string>(), away = new Set<string>(), places = new Set<string>();
	const names = new Map<string, { name: string; count: number }>();
	const validHome = home && validCoordinate(home[0], home[1]);
	for (const v of visits) {
		const day = localDay(new Date(v.arrivedAt)); days.add(day);
		const name = v.locationName?.trim();
		places.add(name ? name.toLocaleLowerCase() : `${v.latitude.toFixed(5)},${v.longitude.toFixed(5)}`);
		if (name) { const key = name.toLocaleLowerCase(); const p = names.get(key) ?? { name, count: 0 }; p.count++; names.set(key, p); }
		if (validHome && distanceMeters(home!, [v.latitude, v.longitude]) > radius) away.add(day);
	}
	let trackMeters = 0;
	for (let i = 0; i < points.length; i++) {
		const p = points[i], day = localDay(new Date(p.timestamp)); days.add(day);
		const prev = points[i - 1];
		// Do not bridge overnight exports or long recording gaps.
		if (prev && localDay(new Date(prev.timestamp)) === day && Date.parse(p.timestamp) > Date.parse(prev.timestamp) && Date.parse(p.timestamp) - Date.parse(prev.timestamp) <= 30 * 60000) {
			trackMeters += distanceMeters([prev.latitude, prev.longitude], [p.latitude, p.longitude]);
		}
	}
	let recordedOutingMeters = 0;
	for (const outing of data.outings ?? []) {
		days.add(localDay(new Date(outing.startedAt)));
		if (outing.distanceMeters !== null) recordedOutingMeters += outing.distanceMeters;
	}
	return { days: days.size, visits: visits.length, places: places.size, outings: data.outings?.length ?? 0, trackMeters, recordedOutingMeters, awayVisitDays: validHome ? away.size : null, topPlaces: [...names.values()].sort((a,b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 5) };
}
