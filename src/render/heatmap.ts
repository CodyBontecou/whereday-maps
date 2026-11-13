import * as L from "leaflet";
import { ExportShape } from "../types";
import { densityCells } from "../atlas";

/** A local, bounded density overlay. No tile service, canvas export or upload. */
export function renderHeatmap(target: L.LayerGroup, data: ExportShape): { bounds: L.LatLngTuple[]; caption: string } {
	const density = densityCells(data);
	const max = Math.max(1, ...density.cells.map(c => c.count));
	const bounds: L.LatLngTuple[] = [];
	for (const cell of density.cells) {
		const coordinate: L.LatLngTuple = [cell.latitude, cell.longitude];
		const weight = Math.log1p(cell.count) / Math.log1p(max);
		for (const [radius, opacity] of [[24, 0.08], [16, 0.16], [8, 0.35]]) {
			L.circleMarker(coordinate, {
				radius, stroke: false, fillColor: weight > 0.65 ? "#ef4444" : "#f59e0b",
				fillOpacity: opacity * weight, className: "whereday-density-cell",
			}).bindPopup(`${cell.count} ${density.kind === "Visit density" ? "visits" : "GPS samples"} in this approximate cell`).addTo(target);
		}
		bounds.push(coordinate);
	}
	return { bounds, caption: `${density.kind} · ${density.cells.length} / ${density.totalCells} cells. Local 0.001° aggregation; intensity is relative frequency, not time spent. GPS sampling rates affect density. At most 1,000 cells.` };
}
