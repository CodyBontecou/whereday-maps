import { localDay, parseDay, sortedVisits, distanceMeters, playbackPoints } from "./atlas";
import { ExportShape, Visit } from "./types";

export interface PlacePassport { id: string; title: string; aliases: string[]; visitKeys: string[]; path: string }
export interface LocalReview { note: string; reviewedAt: string }
export interface JournalState { version: 1; places: PlacePassport[]; reviews: Record<string, LocalReview> }
export const emptyJournalState = (): JournalState => ({ version: 1, places: [], reviews: {} });

/** Export IDs win. Legacy identity uses arrival plus original position, not a mutable name. */
export function visitKey(v: Visit): string {
	return v.id ? `id:${v.id}` : `legacy:${v.arrivedAt}:${v.originalLatitude ?? v.latitude}:${v.originalLongitude ?? v.longitude}`;
}
export function durationLabel(minutes: number | null | undefined): string {
	if (minutes == null || !Number.isFinite(minutes) || minutes < 0) return "Duration unavailable";
	if (minutes < 1) return "<1 min";
	const rounded = Math.round(minutes);
	if (rounded < 60) return `${rounded} min`;
	const days = Math.floor(rounded / 1440), hours = Math.floor(rounded % 1440 / 60), mins = rounded % 60;
	return [days ? `${days}d` : "", hours ? `${hours}h` : "", mins ? `${mins}m` : ""].filter(Boolean).join(" ");
}
export function visitEnd(v: Visit, snapshot?: string): number {
	const start = Date.parse(v.arrivedAt), departed = Date.parse(v.departedAt ?? "");
	if (Number.isFinite(departed)) return Math.max(start, departed);
	// Open visits end at the export snapshot, never at a future wall clock.
	const exported = Date.parse(snapshot ?? "");
	if (Number.isFinite(exported)) return Math.max(start, exported);
	return start;
}
export function dayWindow(day: string): [number, number] {
	const date = parseDay(day);
	if (!date) throw new Error("Choose a valid YYYY-MM-DD date.");
	date.setHours(0,0,0,0); const start = date.getTime(); date.setDate(date.getDate() + 1);
	return [start, date.getTime()];
}
export function dayVisits(data: ExportShape, day: string): Visit[] {
	const [start,end] = dayWindow(day);
	return sortedVisits(data.visits ?? []).filter(v => Date.parse(v.arrivedAt) < end && (visitEnd(v, data.exportDate) > start || Date.parse(v.arrivedAt) === start));
}
export interface DialStay { visit: Visit; start: number; end: number; lane: number; color: number }
export function placeInk(v: Visit, places: PlacePassport[] = []): number {
	const identity = places.find(p => p.visitKeys.includes(visitKey(v)))?.id ?? `${v.latitude.toFixed(3)},${v.longitude.toFixed(3)}`;
	let hash = 0; for (let i = 0; i < identity.length; i++) hash = (hash * 31 + identity.charCodeAt(i)) | 0;
	return (hash >>> 0) % 4;
}
/** Fractions use wall-clock hours so the dial remains a 24h clock on DST days. */
export function dialStays(data: ExportShape, day: string, places: PlacePassport[] = []): DialStay[] {
	const [start,end] = dayWindow(day), laneEnds: number[] = [];
	return dayVisits(data, day).map(visit => {
		const a = Math.max(start, Date.parse(visit.arrivedAt)), b = Math.min(end, visitEnd(visit, data.exportDate));
		let lane = laneEnds.findIndex(value => value <= a); if (lane < 0) lane = laneEnds.length;
		laneEnds[lane] = b;
		const fraction = (t: number) => { const d = new Date(t); return (d.getHours() * 60 + d.getMinutes() + d.getSeconds()/60) / 1440; };
		return { visit, start: a === start ? 0 : fraction(a), end: b === end ? 1 : fraction(b), lane, color: placeInk(visit, places) };
	});
}
export function reviewedPlace(v: Visit, state: JournalState): PlacePassport | undefined {
	return state.places.find(p => p.visitKeys.includes(visitKey(v)));
}
export function nearbyVisits(seed: Visit, visits: Visit[], radius = 100): Visit[] {
	return sortedVisits(visits).filter(v => distanceMeters([seed.latitude,seed.longitude], [v.latitude,v.longitude]) <= radius);
}
export function reviewReasons(v: Visit): string[] {
	const reasons: string[] = [];
	if (!v.locationName?.trim()) reasons.push("Unnamed stop");
	if (!v.confirmationStatus || v.confirmationStatus === "unconfirmed") reasons.push("Unconfirmed in app");
	if (v.confirmationStatus === "corrected") reasons.push("Corrected in app");
	if (v.durationMinutes != null && v.durationMinutes < 1) reasons.push("Under one minute");
	if ((v.durationMinutes ?? 0) > 1440) reasons.push("Longer than one day");
	if (!v.departedAt) reasons.push("Open at export");
	return reasons;
}
export interface RecallQuery { text: string; status: string; minimum: number; revisit: boolean; from: string; until: string }
export const defaultQuery = (): RecallQuery => ({ text: "", status: "any", minimum: 0, revisit: false, from: "", until: "" });
export function recallVisits(data: ExportShape, query: RecallQuery, state: JournalState): Visit[] {
	if (query.from) dayWindow(query.from); if (query.until) dayWindow(query.until);
	if (query.from && query.until && query.from > query.until) throw new Error("From must be on or before Until.");
	const counts = new Map<string, number>();
	for (const v of data.visits ?? []) { const p = reviewedPlace(v,state); if (p) counts.set(p.id, (counts.get(p.id) ?? 0) + 1); }
	return sortedVisits(data.visits ?? []).filter(v => {
		const p = reviewedPlace(v,state), day = localDay(new Date(v.arrivedAt));
		const text = [v.locationName,v.address,v.notes,p?.title,...(p?.aliases ?? [])].filter(Boolean).join(" ").toLocaleLowerCase();
		return (!query.text || text.includes(query.text.toLocaleLowerCase())) &&
			(query.status === "any" || v.confirmationStatus === query.status) &&
			(query.minimum <= 0 || (v.durationMinutes ?? -1) >= query.minimum) &&
			(!query.from || day >= query.from) && (!query.until || day <= query.until) &&
			(!query.revisit || (!!p && (counts.get(p.id) ?? 0) > 1));
	});
}
export interface TripChapter { day: string; visits: Visit[]; gaps: number; points: number }
export function tripChapters(data: ExportShape, from: string, until: string): TripChapter[] {
	const [start] = dayWindow(from), [,end] = dayWindow(until);
	if (from > until) throw new Error("From must be on or before Until.");
	if (end - start > 366 * 86400000 + 3600000) throw new Error("Choose a trip of at most 366 days.");
	const points = playbackPoints(data.points ?? []), chapters: TripChapter[] = [];
	const date = new Date(start);
	while (date.getTime() < end) {
		const day = localDay(date), samples = points.filter(p => localDay(new Date(p.timestamp)) === day);
		let gaps = 0; for (let i = 1; i < samples.length; i++) if (Date.parse(samples[i].timestamp) - Date.parse(samples[i-1].timestamp) > 30*60000) gaps++;
		chapters.push({ day, visits: dayVisits(data,day), gaps, points: samples.length });
		date.setDate(date.getDate()+1);
	}
	return chapters;
}
/** Escape data embedded in Markdown so place names cannot create links or HTML. */
export function markdownText(value: string): string {
	return value.replace(/[\r\n]+/g," ").replace(/[\\`*_{}\[\]()<>#+!|~]/g, "\\$&");
}
export function wikiLink(path: string, label?: string): string {
	if (/[\[\]|#^\r\n]/.test(path)) throw new Error("Invalid note link.");
	return `[[${path}${label ? `|${markdownText(label)}` : ""}]]`;
}
export function dayStayMinutes(v: Visit, day: string, snapshot?: string): number | null {
	if (!v.departedAt && !Number.isFinite(Date.parse(snapshot ?? ""))) return null;
	const [start,end] = dayWindow(day);
	return Math.max(0, Math.min(end,visitEnd(v,snapshot))-Math.max(start,Date.parse(v.arrivedAt))) / 60000;
}
export function dayArrival(v: Visit, day: string): string {
	return new Date(Math.max(dayWindow(day)[0],Date.parse(v.arrivedAt))).toISOString();
}
export function visitLine(v: Visit, state: JournalState, redact = false, day?: string, snapshot?: string): string {
	const place = reviewedPlace(v,state), arrival = day ? dayArrival(v,day) : v.arrivedAt;
	const time = `${day ? "" : localDay(new Date(arrival)) + " "}${new Date(arrival).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
	const duration = day ? `${durationLabel(dayStayMinutes(v,day,snapshot))} in this day` : durationLabel(v.durationMinutes);
	const name = redact ? "Stop (location omitted)" : place ? wikiLink(place.path,place.title) : markdownText(v.locationName?.trim() || "Unnamed stop");
	return `- ${time} · ${name} · ${duration} · ${markdownText(v.confirmationStatus ?? "Status unavailable")}${!v.departedAt ? " · open at export" : ""}`;
}
export function fieldNotes(data: ExportShape, day: string, state: JournalState, minimum = 1, dailyPath?: (day: string) => string): string {
	const visits = dayVisits(data,day), shown = visits.filter(v => dayStayMinutes(v,day,data.exportDate) == null || dayStayMinutes(v,day,data.exportDate)! >= minimum);
	return [`## Field Notes · ${day}`, "", `Observed stops: ${visits.length}. ${visits.length-shown.length} short stops hidden (under ${minimum} min). Times use this computer's timezone.`,
		`Snapshot: ${data.exportDate ?? "unavailable"}. Open visits are clipped to the snapshot; gaps do not establish continuous coverage.`, "",
		...shown.map(v => `${visitLine(v,state,false,day,data.exportDate)}${localDay(new Date(v.arrivedAt)) !== day ? " · continued from an earlier day" : ""}`),
		...(!shown.length ? ["No stops meet these filters."] : []), "", ...(dailyPath ? [`Daily note: ${wikiLink(dailyPath(day))}`, ""] : []),
		"### Reflection prompts", "", "- What made this day memorable?", "- What would you like to remember about these places?", "", "Write your reflections outside the managed section so future refreshes preserve them."].join("\n");
}

/** Shared route segmentation prevents a displayed line from crossing recording gaps. */
export function trackSegments(points: NonNullable<ExportShape["points"]>): NonNullable<ExportShape["points"]>[] {
	const clean = playbackPoints(points), segments: typeof clean[] = [];
	for (const point of clean) {
		const segment = segments[segments.length-1], previous = segment?.[segment.length-1];
		const gap = previous ? Date.parse(point.timestamp)-Date.parse(previous.timestamp) : Infinity;
		if (!previous || gap <= 0 || gap > 30*60000 || localDay(new Date(previous.timestamp)) !== localDay(new Date(point.timestamp))) segments.push([point]);
		else segment.push(point);
	}
	return segments;
}
export function rangeData(data: ExportShape, from?: string, until?: string): ExportShape {
	const start = from ? dayWindow(from)[0] : -Infinity, end = until ? dayWindow(until)[1] : Infinity;
	if (start >= end) throw new Error("From must be on or before Until.");
	return {
		...data,
		visits: data.visits?.filter(v => Date.parse(v.arrivedAt) < end && (visitEnd(v,data.exportDate) > start || Date.parse(v.arrivedAt) === start)) ?? null,
		points: data.points?.filter(p => Date.parse(p.timestamp) >= start && Date.parse(p.timestamp) < end) ?? null,
		outings: data.outings?.filter(o => Date.parse(o.startedAt) < end && Date.parse(o.effectiveEndAt) >= start),
	};
}
