import * as L from "leaflet";
import type { TileLayerConfig } from "../settings";

/** The only tile-layer creation boundary. Disabled maps never invoke Leaflet's
 * tile factory, even if a stale URL is present in saved settings. */
export function addBasemap(map: L.Map, config: TileLayerConfig): L.TileLayer | null {
	if (!config.enabled) return null;
	return L.tileLayer(config.url, {
		attribution: config.attribution,
		maxZoom: 19,
	}).addTo(map);
}
