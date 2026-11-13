import { ExportShape, ExportReceipt, Visit } from "./types";

/** Stable serialization compares full normalized records, never a lossy hash. */
function canonical(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
	if (value && typeof value === "object") return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(",")}}`;
	return JSON.stringify(value) ?? "null";
}
export function mergeExports(exports: ExportShape[], paths: string[], now = new Date()): ExportShape {
	const receipt: ExportReceipt = { sources: [], duplicateVisits: 0, duplicatePoints: 0, duplicateOutings: 0, revisedVisits: 0, conflictingVisits: 0, loadedAt: now.toISOString() };
	const visits: Visit[] = [], points = new Map<string, NonNullable<ExportShape["points"]>[number]>(), outings = new Map<string, NonNullable<ExportShape["outings"]>[number]>();
	const seenVisits = new Set<string>(), byId = new Map<string, number>(), snapshots = new Map<string, string>();
	for (let i = 0; i < exports.length; i++) {
		const e = exports[i];
		const signature = canonical({ visits: e.visits, points: e.points, outings: e.outings });
		const duplicateOf = snapshots.get(signature);
		if (!duplicateOf) snapshots.set(signature, paths[i]);
		receipt.sources.push({ path: paths[i], exportDate: e.exportDate, visits: e.visits?.length ?? 0, points: e.points?.length ?? 0, outings: e.outings?.length ?? 0, duplicateOf });
		for (const v of e.visits ?? []) {
			const key = canonical(v);
			if (seenVisits.has(key)) { receipt.duplicateVisits++; continue; }
			seenVisits.add(key);
			const index = v.id ? byId.get(v.id) : undefined;
			if (index !== undefined) {
				const previous = visits[index], before = Date.parse(previous.updatedAt ?? ""), after = Date.parse(v.updatedAt ?? "");
				if (Number.isFinite(before) && Number.isFinite(after) && before !== after) {
					if (after > before) visits[index] = v;
					receipt.revisedVisits++;
					continue;
				}
				// Conflicts without a trustworthy revision stay visible for review.
				receipt.conflictingVisits++;
			}
			if (v.id) byId.set(v.id, visits.length);
			visits.push(v);
		}
		for (const p of e.points ?? []) { const key = canonical(p); if (points.has(key)) receipt.duplicatePoints++; else points.set(key, p); }
		for (const o of e.outings ?? []) {
			const old = outings.get(o.id);
			if (old) {
				receipt.duplicateOutings++;
				// An active snapshot can grow; prefer the latest effective endpoint.
				if (Date.parse(o.effectiveEndAt) > Date.parse(old.effectiveEndAt)) outings.set(o.id, o);
			} else outings.set(o.id, o);
		}
	}
	const formats = [...new Set(exports.map(e => e.detectedFormat).filter(Boolean))];
	const dates = exports.map(e => e.exportDate).filter((d): d is string => !!d && Number.isFinite(Date.parse(d))).sort((a,b) => Date.parse(b) - Date.parse(a));
	return {
		visits: visits.length ? visits : null, points: points.size ? [...points.values()] : null,
		outings: outings.size ? [...outings.values()] : undefined, sourcePaths: paths,
		exportDate: dates[0], receipt,
		detectedFormat: formats.includes("iso-me-json") ? "iso-me-json" : formats[0],
	};
}
