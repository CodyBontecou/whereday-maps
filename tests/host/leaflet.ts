// Records rendering boundaries without starting a browser or network.
export const markers: { coordinate: unknown; popup?: string; target?: unknown }[] = [];
export function circleMarker(coordinate: unknown, _options: unknown) {
  const entry = { coordinate, popup: undefined as string | undefined, target: undefined as unknown };
  markers.push(entry);
  const marker = {
    bindPopup(popup: string) { entry.popup = popup; return marker; },
    addTo(target: unknown) { entry.target = target; return marker; },
    setLatLng(value: unknown) { entry.coordinate = value; return marker; },
    openPopup() { return marker; },
  };
  return marker;
}
export const maps: { removed: boolean; views: unknown[]; container: unknown }[] = [];
export function map(container: unknown, _options: unknown) {
  const state = { removed: false, views: [] as unknown[], container };
  maps.push(state);
  return {
    getContainer: () => container,
    setView: (...args: unknown[]) => { state.views.push(args); },
    fitBounds: (...args: unknown[]) => { state.views.push(args); },
    panTo: (...args: unknown[]) => { state.views.push(args); },
    invalidateSize() {},
    remove() { state.removed = true; },
  };
}
export function layerGroup() {
  const layer = { addTo(_map: unknown) { return layer; }, clearLayers() {} };
  return layer;
}
export function latLngBounds(coordinates: unknown) { return coordinates; }
// Fail loudly if a summary-only rendering path attempts to manufacture tracks.
export const routeCalls: string[] = [];
export function polyline() { routeCalls.push('polyline'); throw new Error('Unexpected track rendering in endpoint/lifecycle test'); }
export function latLng() { routeCalls.push('latLng'); throw new Error('Unexpected track distance calculation in endpoint/lifecycle test'); }
export const tileRequests: { url: string; options: unknown; map?: unknown }[] = [];
export function tileLayer(url: string, options: unknown) {
  const request = { url, options, map: undefined as unknown };
  tileRequests.push(request);
  const layer = { addTo(map: unknown) { request.map = map; return layer; } };
  return layer;
}
