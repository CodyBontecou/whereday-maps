import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { App } from 'obsidian';
import { isGeoJSONCollection, parseGeoJSON } from '../src/geojson-parser';
import { loadExport, loadExports, DataLoadError } from '../src/data-loader';
import { collectDays, DEFAULT_FILTER, filterData } from '../src/render/controls';
import { computeStats, formatLabel } from '../src/render/stats-bar';

const raw = readFileSync('examples/synthetic-whereday.geojson', 'utf8');
const fixture = () => JSON.parse(raw);
function vault(files: Record<string, string>): App {
  return { vault: { adapter: {
    read: async (path: string) => { if (!(path in files)) throw new Error('missing'); return files[path]; },
    stat: async (path: string) => path in files ? { type: 'file' } : path === 'exports' ? { type: 'folder' } : null,
    list: async () => ({ files: Object.keys(files), folders: [] }),
  } } } as unknown as App;
}

test('native GeoJSON maps lon/lat order, visit metadata, optional altitude, and outliers', () => {
  const data = parseGeoJSON(fixture());
  assert.equal(data.visits?.length, 1);
  assert.equal(data.visits![0].latitude, 10);
  assert.equal(data.visits![0].longitude, 20);
  assert.equal(data.visits![0].durationMinutes, 30);
  assert.equal(data.visits![0].locationName, 'Synthetic Park');
  assert.equal(data.points?.length, 3);
  assert.equal(data.points![0].altitude, 12);
  assert.equal(data.points![1].altitude, null);
  assert.equal(data.points![2].isOutlier, true);
  assert.equal(data.exportDate, '2026-05-04T12:00:00Z');
  assert.equal(formatLabel(data.detectedFormat), 'GeoJSON');
});

test('invalid features, unrelated geometry, and unknown kinds are skipped without inventing tracks', () => {
  const base = fixture().features[1];
  const bad = [null, {},
    { ...base, geometry: null },
    { ...base, geometry: { type: 'LineString', coordinates: [[20, 10], [21, 11]] } },
    { ...base, geometry: { type: 'Point', coordinates: [20, 91] } },
    { ...base, geometry: { type: 'Point', coordinates: [181, 10] } },
    { ...base, geometry: { type: 'Point', coordinates: ['20', 10] } },
    { ...base, geometry: { type: 'Point', coordinates: [20, Infinity] } },
    { ...base, properties: { kind: 'point', timestamp: 'invalid' } },
    { ...base, properties: { kind: 'unrelated', timestamp: base.properties.timestamp } },
  ];
  const data = parseGeoJSON({ type: 'FeatureCollection', features: [...bad, base] });
  assert.equal(data.points?.length, 1);
  assert.equal(data.visits?.length, 0);
});

test('optional fields and three-dimensional geometry work without inferred speed or outlier flags', () => {
  const feature = fixture().features[1];
  feature.properties = { kind: 'point', timestamp: feature.properties.timestamp, speed: '100', isOutlier: 'true' };
  const data = parseGeoJSON({ type: 'FeatureCollection', features: [feature] });
  assert.equal(data.points![0].altitude, 12);
  assert.equal(data.points![0].speed, null);
  assert.equal(data.points![0].isOutlier, false);
});

test('invalid collection roots are rejected; empty FeatureCollection is valid', () => {
  for (const value of [null, [], {}, { type: 'FeatureCollection' }, { type: 'FeatureCollection', features: {} }]) {
    assert.equal(isGeoJSONCollection(value), false);
    assert.throws(() => parseGeoJSON(value), /FeatureCollection/);
  }
  assert.deepEqual(parseGeoJSON({ type: 'FeatureCollection', features: [] }).points, []);
});

test('loader accepts native GeoJSON in both .json and .geojson files', async () => {
  const app = vault({ 'exports/day.geojson': raw, 'exports/day.json': raw });
  for (const path of ['exports/day.geojson', 'exports/day.json']) {
    const data = await loadExport(app, path);
    assert.equal(data.detectedFormat, 'geojson');
    assert.equal(data.points?.length, 3);
  }
});

test('folder/glob/date-keyword source discovery includes .geojson and deduplicates paths', async () => {
  const today = new Date();
  const date = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const app = vault({ [`exports/${date}.geojson`]: raw });
  for (const exportFilenamePattern of ['*{date}*', '{date}.geojson']) {
    for (const sources of [['exports/'], ['exports/*.geojson'], ['today'], ['exports/', 'exports/*.geojson']]) {
      const data = await loadExports(app, sources, { exportsFolder: 'exports', exportFilenamePattern });
      assert.equal(data.visits?.length, 1);
      assert.equal(data.points?.length, 3);
      assert.equal(data.detectedFormat, 'geojson');
    }
  }
});

test('loader reports malformed JSON and malformed GeoJSON with source path', async () => {
  for (const content of ['{', '{"type":"FeatureCollection","features":null}']) {
    await assert.rejects(loadExport(vault({ 'bad.geojson': content }), 'bad.geojson'), (error: unknown) => {
      assert.ok(error instanceof DataLoadError);
      assert.equal(error.source, 'bad.geojson');
      return true;
    });
  }
});

test('GeoJSON reuses day/time filtering and stats exclude GPS glitches', () => {
  const data = parseGeoJSON(fixture());
  const days = collectDays(data);
  assert.equal(days.length, 1);
  const filtered = filterData(data, { ...DEFAULT_FILTER, day: days[0] });
  assert.equal(filtered.points?.length, 3);
  const empty = filterData(data, { ...DEFAULT_FILTER, day: '2000-01-01' });
  assert.equal(empty.points?.length, 0);
  const stats = computeStats(data);
  assert.equal(stats.visitCount, 1);
  assert.equal(stats.averageSpeedKmh, 9);
  assert.ok(stats.totalDistanceKm > 0.1 && stats.totalDistanceKm < 0.2);
});
