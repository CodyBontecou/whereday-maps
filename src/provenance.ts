import { Visit } from "./types";

const textKeys = ["id", "confirmedAt", "updatedAt", "originalLocationName", "originalAddress", "detectedLocationName", "detectedAddress", "placeSource"] as const;
const numberKeys = ["originalLatitude", "originalLongitude", "detectedLatitude", "detectedLongitude", "placeDistanceMeters"] as const;
/** Optional native evidence is retained without inventing values in older exports. */
export function visitEvidence(raw: Record<string, unknown>): Partial<Visit> {
	const result: Record<string, string | number | null> = {};
	for (const key of textKeys) if (key in raw) result[key] = typeof raw[key] === "string" ? raw[key] as string : null;
	for (const key of numberKeys) if (key in raw) result[key] = typeof raw[key] === "number" && Number.isFinite(raw[key]) ? raw[key] as number : null;
	return result;
}

export function visitEvidenceJSON(value: string | null | undefined): Partial<Visit> {
	if (!value) return {};
	try { const raw: unknown = JSON.parse(value); if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
		const values = raw as Record<string, unknown>;
		for (const key of numberKeys) if (typeof values[key] === "string" && (values[key] as string).trim() && Number.isFinite(Number(values[key]))) values[key] = Number(values[key]);
		return visitEvidence(values); }
	catch { return {}; }
}
