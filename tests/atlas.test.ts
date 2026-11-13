import assert from 'node:assert/strict';
import { test } from 'node:test';
import { anchorDate, noteSources, parseDay, localDay, memoryVisits, sortedVisits, playbackPoints, densityCells, tripSummary, placeTarget } from '../src/atlas';
import { parseBlockConfig } from '../src/parser';
import { loadExports } from '../src/data-loader';
import { renderAtlasPanels } from '../src/render/atlas-panels';
import { renderHeatmap } from '../src/render/heatmap';
import { buildPlayback } from '../src/render/playback';
import type { App } from 'obsidian';
import type { LayerGroup } from 'leaflet';
import { Element } from './host/element';
import { markers, routeCalls } from './host/leaflet';

const visit = (date: string, name = 'Invented Park', latitude = 10) => ({ arrivedAt: date, latitude, longitude: 20, locationName: name, durationMinutes: 30 });
const point = (date: string, latitude = 10, isOutlier = false) => ({ timestamp: date, latitude, longitude: 20, isOutlier });
const localTime = (y: number, m: number, d: number, hour = 12, minute = 0) => new Date(y, m - 1, d, hour, minute).toISOString();

export function fakeScheduler() {
  let id = 0;
  const pending = new Map<number, () => void>();
  return { pending, schedule: (callback: () => void, _delay: number) => { const key = ++id; pending.set(key, callback); return () => { pending.delete(key); }; }, flush: () => { const pair = pending.entries().next().value; if (pair) { pending.delete(pair[0]); pair[1](); } } };
}

test('all atlas flags and numeric/home/date parameters parse without changing defaults', () => {
  assert.deepEqual(parseBlockConfig('source: note-date'), { source: 'note-date' });
  const config = parseBlockConfig('show_timeline: yes\non_this_day: true\nplace_links: on\nplayback: true\nheatmap: true\nauto_refresh: true\nshow_dashboard: true\ndate: 2026-05-04\nhome: [10, 20]\nhome_radius_meters: 300\nplaces_folder: Atlas/Places');
  assert.equal(config.show_timeline, true); assert.equal(config.on_this_day, true); assert.equal(config.place_links, true);
  assert.equal(config.playback, true); assert.equal(config.heatmap, true); assert.equal(config.auto_refresh, true); assert.equal(config.show_dashboard, true);
  assert.deepEqual(config.home, [10, 20]); assert.equal(config.home_radius_meters, 300); assert.equal(config.date, '2026-05-04');
});

test('daily-note sources are pinned to valid note dates, including leap dates, with explicit override', () => {
  assert.deepEqual(noteSources(['note-date', 'archive.json'], 'Daily/2024-02-29.md'), ['2024-02-29', 'archive.json']);
  assert.deepEqual(noteSources(['note-date'], 'Daily/2026-05-04 Monday.md'), ['2026-05-04']);
  assert.deepEqual(noteSources(['note-date'], 'Untitled.md', '2025-06-03'), ['2025-06-03']);
  assert.throws(() => noteSources(['note-date'], '2026-02-29.md'), /needs/);
  assert.throws(() => noteSources(['note-date'], 'Untitled.md'), /needs/);
  assert.equal(parseDay('2026-02-30'), null);
  assert.throws(() => anchorDate('any.md', 'bad'), /valid/);
  assert.equal(localDay(anchorDate('Daily/2024-02-29.md', undefined, new Date(2030, 0, 1))), '2024-02-29');
});

test('note-date lookup loads the dated export rather than using today', async () => {
  const files = { 'exports/2024-02-29.json': JSON.stringify({ visits: [visit(localTime(2024, 2, 29))] }) };
  const app = { vault: { adapter: {
    stat: async (path: string) => path === 'exports' ? { type: 'folder' } : path in files ? { type: 'file' } : null,
    list: async () => ({ files: Object.keys(files), folders: [] }), read: async (path: keyof typeof files) => files[path],
  } } } as unknown as App;
  const data = await loadExports(app, noteSources(['note-date'], 'Daily/2024-02-29.md'), { exportsFolder: 'exports' });
  assert.deepEqual(data.sourcePaths, ['exports/2024-02-29.json']);
  assert.equal(data.visits?.length, 1);
});

test('timeline sorts a copy; memories match prior local years only without shifting leap day', () => {
  const visits = [visit(localTime(2026, 5, 4)), visit(localTime(2024, 5, 4)), visit(localTime(2025, 5, 4)), visit(localTime(2025, 5, 5)), visit('bad')];
  const sorted = sortedVisits(visits); assert.equal(sorted.length, 4); assert.equal(visits[0].arrivedAt, localTime(2026, 5, 4));
  assert.deepEqual(memoryVisits(visits, new Date(2026, 4, 4)).map(v => new Date(v.arrivedAt).getFullYear()), [2025, 2024]);
  const leap = [visit(localTime(2024, 2, 29)), visit(localTime(2023, 2, 28))];
  assert.equal(memoryVisits(leap, new Date(2028, 1, 29)).length, 1);
});

test('place targets stay vault-relative and do not interpret raw wiki/heading syntax', () => {
  assert.equal(placeTarget('Invented Park'), 'Places/Invented Park');
  assert.equal(placeTarget('[[Park]]#section', '../Atlas/Places'), 'Atlas/Places/Park section');
  assert.equal(placeTarget('...'), null);
  assert.equal(placeTarget('Synthetic', ''), 'Synthetic');
});

test('playback excludes outliers/invalid coordinates and replays actual timestamped samples in order', () => {
  const points = [point('2026-05-04T08:01:00Z'), point('2026-05-04T08:00:00Z'), point('2026-05-04T08:02:00Z', 11, true), point('bad'), point('2026-05-04T08:03:00Z', 91)];
  assert.deepEqual(playbackPoints(points).map(p => p.timestamp), ['2026-05-04T08:00:00Z', '2026-05-04T08:01:00Z']);
  const parent = new Element('div'), scheduler = fakeScheduler(), seen: string[] = [];
  const dispose = buildPlayback(parent as unknown as HTMLElement, points, p => seen.push(p.timestamp), scheduler.schedule);
  const play = parent.all().find(e => e.tag === 'button')!, slider = parent.all().find(e => e.type === 'range')!;
  play.dispatch('click'); assert.equal(scheduler.pending.size, 1); scheduler.flush();
  assert.equal(seen.length, 2); assert.equal(play.textContent, 'Play');
  assert.ok(slider.attributes['aria-valuetext'].startsWith('2 / 2'));
  play.dispatch('click'); assert.equal(seen[seen.length - 1], '2026-05-04T08:00:00Z');
  slider.value = '999'; slider.dispatch('input'); assert.equal(slider.value, '1'); assert.equal(scheduler.pending.size, 0);
  play.dispatch('click'); dispose(); assert.equal(scheduler.pending.size, 0);
  const before = seen.length; scheduler.flush(); play.dispatch('click'); assert.equal(seen.length, before);
});

test('playback empty/single-sample states are honest and do not start timers', () => {
  const parent = new Element('div'), scheduler = fakeScheduler();
  buildPlayback(parent as unknown as HTMLElement, [], () => assert.fail(), scheduler.schedule);
  assert.ok(parent.all().some(e => e.textContent.includes('Summary endpoints are not tracks')));
  assert.equal(parent.all().filter(e => e.tag === 'button').length, 0);
});

test('density bins prefer visits, bound cell count and never turn outliers into density', () => {
  const data = { visits: [visit('2026-05-04T08:00:00Z'), visit('2026-05-04T08:30:00Z')], points: [point('2026-05-04T08:00:00Z', 11)] };
  const result = densityCells(data); assert.equal(result.kind, 'Visit density'); assert.equal(result.cells[0].count, 2); assert.equal(result.cells.length, 1);
  assert.equal(densityCells({ visits: null, points: [point('2026-05-04T08:00:00Z', 11, true)] }).cells.length, 0);
  markers.length = 0; routeCalls.length = 0;
  const rendered = renderHeatmap({} as LayerGroup, data); assert.equal(markers.length, 3); assert.equal(rendered.bounds.length, 1); assert.deepEqual(routeCalls, []);
  const many = Array.from({ length: 1100 }, (_, i) => visit('2026-05-04T08:00:00Z', 'Invented', i * 0.002));
  assert.equal(densityCells({ visits: many, points: null }).cells.length, 1000);
});

test('dashboard separates recorded outing distance and excludes long gaps/overnight bridges', () => {
  const points = [point(localTime(2026, 5, 4, 8)), point(localTime(2026, 5, 4, 8, 1), 10.001), point(localTime(2026, 5, 4, 10), 20), point(localTime(2026, 5, 5, 8), 30)];
  const data = { visits: [visit(localTime(2026, 5, 4), 'Home'), visit(localTime(2026, 5, 5), 'Away', 11)], points };
  const summary = tripSummary(data, [10, 20], 200);
  assert.equal(summary.days, 2); assert.equal(summary.awayVisitDays, 1); assert.equal(summary.places, 2);
  assert.ok(summary.trackMeters > 100 && summary.trackMeters < 120);
  assert.equal(tripSummary(data).awayVisitDays, null);
});

test('timeline, memories, place links, dashboard and playback present safe text and explicit actions', () => {
  const parent = new Element('div'), opened: string[] = [], focused: string[] = [];
  const data = { visits: [visit(localTime(2026, 5, 4), '<script>invented</script>'), visit(localTime(2025, 5, 4))], points: [point(localTime(2026, 5, 4))] };
  const dispose = renderAtlasPanels(parent as unknown as HTMLElement, data, data, { show_timeline: true, on_this_day: true, place_links: true, show_dashboard: true, playback: true }, new Date(2026, 4, 4), {
    focus: v => focused.push(v.arrivedAt), openPlace: target => opened.push(target), point: () => {},
  });
  assert.ok(parent.all().some(e => e.textContent.includes('On this day')));
  assert.ok(parent.all().some(e => e.textContent.includes('Trip dashboard')));
  const button = parent.all().find(e => e.cls === 'whereday-visit-focus')!; button.dispatch('click');
  assert.equal(focused.length, 1);
  assert.equal(opened.length, 0, 'no link opens on render');
  parent.all().find(e => e.tag === 'a')!.dispatch('click'); assert.equal(opened.length, 1);
  assert.ok(parent.all().some(e => e.textContent.includes('<script>invented</script>')), 'host text node contains literal text, never innerHTML');
  dispose();
});
