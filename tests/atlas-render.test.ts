import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { App, MarkdownPostProcessorContext } from 'obsidian';
import { MapRenderChild } from '../src/render/map-block';
import { DEFAULT_SETTINGS } from '../src/settings';
import { Element } from './host/element';
import { maps, markers, tileRequests } from './host/leaflet';

const settle = () => new Promise<void>(resolve => setImmediate(resolve));
function windowHost() {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  let id = 0;
  const timers = new Set<number>();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    requestAnimationFrame: () => ++id, cancelAnimationFrame() {},
    setTimeout: () => { const key = ++id; timers.add(key); return key; }, clearTimeout: (key: number) => timers.delete(key),
  } });
  return () => { if (previous) Object.defineProperty(globalThis, 'window', previous); else Reflect.deleteProperty(globalThis, 'window'); };
}
const fixture = JSON.stringify({ visits: [
  { latitude: 10, longitude: 20, arrivedAt: '2026-05-04T12:00:00Z', locationName: 'Invented Park' },
  { latitude: 11, longitude: 20, arrivedAt: '2025-05-04T12:00:00Z', locationName: 'Invented Memory' },
], points: [
  { latitude: 10, longitude: 20, timestamp: '2026-05-04T12:00:00Z' },
  { latitude: 10.001, longitude: 20, timestamp: '2026-05-04T12:01:00Z' },
] });

test('all atlas panels integrate with map focus, safe link opening, density and cursor, with no tile requests', async () => {
  const restore = windowHost(), parent = new Element('div'), opened: string[] = [];
  const app = { vault: { adapter: { stat: async () => ({ type: 'file' }), read: async () => fixture } }, workspace: { openLinkText: async (target: string) => { opened.push(target); } } } as unknown as App;
  const renderer = new MapRenderChild(parent as unknown as HTMLElement, app, DEFAULT_SETTINGS, { source: 'archive.json', date: '2026-05-04', show_routes: false, show_timeline: true, on_this_day: true, place_links: true, show_dashboard: true, playback: true, heatmap: true }, { sourcePath: 'Daily/2026-05-04.md' } as MarkdownPostProcessorContext);
  maps.length = 0; markers.length = 0; tileRequests.length = 0;
  try {
    renderer.onload(); await settle();
    assert.equal(maps.length, 1); assert.equal(tileRequests.length, 0);
    for (const heading of ['Visit timeline', 'On this day', 'Trip dashboard', 'Route playback']) assert.ok(parent.all().some(e => e.textContent.includes(heading)), heading);
    assert.ok(parent.all().some(e => e.textContent.includes('Visit density')));
    assert.equal(opened.length, 0);
    parent.all().find(e => e.tag === 'a')!.dispatch('click'); await settle(); assert.ok(opened[0].startsWith('Places/'));
    parent.all().find(e => e.cls === 'whereday-visit-focus')!.dispatch('click');
    assert.ok(parent.all().some(e => e.scrolled));
    const slider = parent.all().find(e => e.cls === 'whereday-playback-range')!;
    slider.value = '1'; slider.dispatch('input');
    assert.ok(markers.some(m => JSON.stringify(m.coordinate) === '[10.001,20]'));
    renderer.onunload(); assert.equal(maps[0].removed, true); assert.equal(parent.children.length, 0);
  } finally { renderer.onunload(); restore(); }
});

test('opt-in vault subscriptions reload only matched exports and stop after unload', async () => {
  const restore = windowHost(), parent = new Element('div');
  let reads = 0;
  const events = new Map<string, (file: { path: string }, oldPath?: string) => void>();
  const app = { vault: {
    on: (event: string, callback: (file: { path: string }) => void) => { events.set(event, callback); return { event }; },
    adapter: { stat: async () => ({ type: 'file' }), read: async () => { reads++; return fixture; } },
  } } as unknown as App;
  const renderer = new MapRenderChild(parent as unknown as HTMLElement, app, DEFAULT_SETTINGS, { source: 'export.json', auto_refresh: true, show_routes: false }, { sourcePath: 'Preview.md' } as MarkdownPostProcessorContext);
  try {
    renderer.onload(); await settle(); assert.equal(reads, 1); assert.equal(events.size, 4);
    events.get('modify')!({ path: 'Private/unrelated.md' });
    events.get('modify')!({ path: 'export.json' });
    await new Promise(resolve => setTimeout(resolve, 340)); await settle(); assert.equal(reads, 2);
    renderer.onunload(); events.get('modify')!({ path: 'export.json' });
    await new Promise(resolve => setTimeout(resolve, 340)); assert.equal(reads, 2);
  } finally { renderer.onunload(); restore(); }
});
