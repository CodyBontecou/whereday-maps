import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import type { App } from 'obsidian';
import type { LayerGroup } from 'leaflet';
import { parseOutings } from '../src/outing-parser';
import { loadExport, loadExports } from '../src/data-loader';
import { parseBlockConfig } from '../src/parser';
import { collectDays, filterData, DEFAULT_FILTER } from '../src/render/controls';
import { computeStats, formatLabel } from '../src/render/stats-bar';
import { outingEndpoints, outingEndpointPopup, outingMetrics, renderOutingEndpoints, renderOutingSummaries } from '../src/render/outings';
import { markers, routeCalls } from './host/leaflet';
import { Element } from './host/element';

const raw = readFileSync('examples/synthetic-outings.json', 'utf8');
const fixture = () => JSON.parse(raw);
const outings = () => parseOutings(fixture().outings);
const app = { vault: { adapter: { read: async () => raw, stat: async () => ({ type: 'file' }) } } } as unknown as App;

test('native outing JSON loads summaries without synthesizing visits or track points', async () => {
  const data = await loadExport(app, 'outings.json');
  assert.equal(data.outings?.length, 3);
  assert.equal(data.visits, null);
  assert.equal(data.points, null);
  assert.equal(formatLabel(data.detectedFormat), 'Outings');
  assert.deepEqual(data.outings![0].start, [10, 20]);
  assert.equal(data.outings![0].durationSeconds, 1800);
  assert.equal(data.outings![1].start, null);
  assert.equal(data.outings![1].distanceMeters, 0);
  assert.equal(data.outings![2].isActive, true);
  const merged = await loadExports(app, ['outings.json', 'outings.json']);
  assert.equal(merged.outings?.length, 3, 'repeated source path loaded once');
});

test('malformed outing rows are skipped, invalid coordinates retain useful summaries', () => {
  const row = fixture().outings[0];
  assert.deepEqual(parseOutings([null, {}, [], { ...row, id: '' }, { ...row, startedAt: 'invalid' }, { ...row, effectiveEndAt: '2000-01-01T00:00:00Z' }]), []);
  const [outing] = parseOutings([{ ...row, startLatitude: 91, endLongitude: '20', durationSeconds: -1, distanceMeters: Infinity, pointCount: 0.5 }]);
  assert.equal(outing.start, null);
  assert.equal(outing.end, null);
  assert.equal(outing.durationSeconds, null);
  assert.equal(outing.distanceMeters, null);
  assert.equal(outing.pointCount, null);
});

test('filters use outing start day/time, preserve data and do not report counts as real tracks', () => {
  const data = { visits: null, points: null, outings: outings() };
  const days = collectDays(data);
  assert.ok(days.length >= 2);
  const local = new Date(data.outings[0].startedAt);
  const day = `${local.getFullYear()}-${String(local.getMonth()+1).padStart(2,'0')}-${String(local.getDate()).padStart(2,'0')}`;
  assert.equal(filterData(data, { ...DEFAULT_FILTER, day }).outings?.length, 1);
  const afterStart = local.getHours() * 60 + local.getMinutes() + 1;
  assert.equal(filterData(data, { ...DEFAULT_FILTER, day, timeStartMin: afterStart }).outings?.length, 0);
  assert.equal(filterData(data, { ...DEFAULT_FILTER, day: '2000-01-01' }).outings?.length, 0);
  const stats = computeStats(data);
  assert.equal(stats.outingCount, 3);
  assert.equal(stats.pointCount, 0);
  assert.equal(stats.totalDistanceKm, 0, 'summary distance is not a computed route');
  assert.equal(stats.dateRange?.latest.toISOString(), '2026-05-05T12:00:00.000Z');
});

test('endpoints collapse coincident locations, label active snapshots, and never create polylines', () => {
  const [outing, missing, active] = outings();
  assert.deepEqual(outingEndpoints(missing), []);
  assert.equal(outingEndpoints(active)[1].label, 'Latest exported point');
  assert.equal(outingEndpoints({ ...outing, end: outing.start }).length, 1);
  markers.length = 0;
  routeCalls.length = 0;
  const bounds = renderOutingEndpoints({} as LayerGroup, outings(), '#123456');
  assert.equal(bounds.length, 4);
  assert.equal(markers.length, 4);
  assert.deepEqual(routeCalls, []);
  assert.equal(outingMetrics(outing), '30 min · 1.5 km recorded');
});

test('popup text is escaped and summary text stays in text nodes', () => {
  const outing = { ...outings()[0], title: '<img src=x onerror=alert(1)>', notes: '<script>synthetic</script>' };
  const popup = outingEndpointPopup(outing, outingEndpoints(outing)[0]);
  assert.ok(popup.includes('&lt;img'));
  assert.ok(!popup.includes('<img'));
  const parent = new Element('div');
  renderOutingSummaries(parent as unknown as HTMLElement, [outing], () => {});
  assert.equal(parent.all().find(el => el.cls === 'iso-me-outing-title')?.textContent, outing.title);
  assert.equal(parent.all().find(el => el.cls === 'iso-me-outing-notes')?.textContent, outing.notes);
});

test('summary focus actions preserve outing identity; missing endpoints and empty filters explain their state', () => {
  const parent = new Element('div');
  const rows = outings();
  let focused = '';
  renderOutingSummaries(parent as unknown as HTMLElement, rows, o => { focused = o.id; });
  assert.equal(parent.all().filter(el => el.tag === 'details').length, 3);
  const buttons = parent.all().filter(el => el.tag === 'button');
  assert.equal(buttons.length, 2);
  buttons[1].dispatch('click');
  assert.equal(focused, rows[2].id);
  assert.ok(parent.all().some(el => el.textContent.includes('No endpoint coordinates')));
  assert.ok(parent.all().some(el => el.textContent.includes('Active at export')));
  renderOutingSummaries(parent as unknown as HTMLElement, [], () => {});
  assert.equal(parent.children.length, 1);
  assert.equal(parent.children[0].textContent, 'No outings match these filters.');
});

test('show_outings accepts the usual boolean block syntax', () => {
  assert.equal(parseBlockConfig('source: outings.json\nshow_outings: false').show_outings, false);
  assert.equal(parseBlockConfig('show_outings: yes').show_outings, true);
});
