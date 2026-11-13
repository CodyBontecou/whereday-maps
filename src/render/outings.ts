import * as L from "leaflet";
import { Outing } from "../types";
import { escapeHtml } from "./visits";

export interface OutingEndpoint {
	coordinate: [number, number];
	label: string;
}

export function outingEndpoints(outing: Outing): OutingEndpoint[] {
	const endpoints: OutingEndpoint[] = [];
	if (outing.start) endpoints.push({ coordinate: outing.start, label: "Start" });
	if (outing.end) {
		const label = outing.isActive ? "Latest exported point" : "End";
		if (outing.start && outing.start[0] === outing.end[0] && outing.start[1] === outing.end[1]) {
			endpoints[0].label += ` / ${label.toLowerCase()}`;
		} else endpoints.push({ coordinate: outing.end, label });
	}
	return endpoints;
}

export function outingMetrics(outing: Outing): string {
	const minutes = outing.durationSeconds === null ? null : Math.round(outing.durationSeconds / 60);
	const duration = minutes === null ? "Duration unavailable" : minutes < 60
		? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
	const distance = outing.distanceMeters === null ? "Distance unavailable" : outing.distanceMeters < 1000
		? `${Math.round(outing.distanceMeters)} m` : `${(outing.distanceMeters / 1000).toFixed(1)} km`;
	return `${duration} · ${distance} recorded`;
}

export function outingEndpointPopup(outing: Outing, endpoint: OutingEndpoint): string {
	return `<strong>${escapeHtml(outing.title)}</strong><br>${escapeHtml(endpoint.label)}<br>${escapeHtml(outingMetrics(outing))}`;
}

/** Endpoint markers only. Summary exports contain no track geometry, so this
 * deliberately never calls a polyline factory or synthesizes LocationPoints. */
export function renderOutingEndpoints(target: L.LayerGroup, outings: Outing[], color: string): L.LatLngTuple[] {
	const bounds: L.LatLngTuple[] = [];
	for (const outing of outings) {
		for (const endpoint of outingEndpoints(outing)) {
			L.circleMarker(endpoint.coordinate, {
				radius: 7, color, weight: 2, fillColor: color,
				fillOpacity: endpoint.label === "Start" ? 0.25 : 0.8,
			}).bindPopup(outingEndpointPopup(outing, endpoint)).addTo(target);
			bounds.push(endpoint.coordinate);
		}
	}
	return bounds;
}

export function renderOutingSummaries(parent: HTMLElement, outings: Outing[], focus: (outing: Outing) => void): void {
	parent.empty();
	parent.createEl("p", {
		cls: "iso-me-outing-caption",
		text: outings.length ? `${outings.length} ${outings.length === 1 ? "outing" : "outings"} · Summaries and endpoints only; no route tracks in this export.` : "No outings match these filters.",
	});
	for (const outing of outings) {
		const card = parent.createEl("details", { cls: "iso-me-outing-card" });
		const summary = card.createEl("summary");
		summary.createEl("span", { text: outing.title, cls: "iso-me-outing-title" });
		summary.createEl("span", { text: outingMetrics(outing), cls: "iso-me-outing-metrics" });
		const labels = [outing.isActive ? "Active at export" : "Completed", outing.isInferred ? "Inferred" : "Recorded"];
		card.createEl("p", { text: labels.join(" · ") });
		card.createEl("p", { text: `${new Date(outing.startedAt).toLocaleString()} → ${new Date(outing.effectiveEndAt).toLocaleString()}${outing.isActive ? " (snapshot)" : ""}` });
		card.createEl("p", { text: `Recorded points: ${outing.pointCount ?? "—"} · Matched visits: ${outing.visitCount ?? "—"}` });
		if (outing.notes) card.createEl("p", { text: outing.notes, cls: "iso-me-outing-notes" });
		if (outingEndpoints(outing).length) {
			const button = card.createEl("button", { text: "Show endpoints" });
			button.type = "button";
			button.addEventListener("click", () => focus(outing));
		} else card.createEl("p", { text: "No endpoint coordinates in this summary." });
	}
}
