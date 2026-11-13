import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import type { App } from 'obsidian';
import { loadExports } from '../src/data-loader';
import { computeStats } from '../src/render/stats-bar';

test('mixed visit JSON, native GeoJSON and outing summaries retain their distinct meanings', async () => {
  const paths = ['examples/synthetic-visit-provenance.json', 'examples/synthetic-whereday.geojson', 'examples/synthetic-outings.json'];
  const app = { vault: { adapter: {
    stat: async () => ({ type: 'file' }),
    read: async (path: string) => readFileSync(path, 'utf8'),
  } } } as unknown as App;
  const data = await loadExports(app, paths);
  assert.equal(data.visits?.length, 4);
  assert.equal(data.points?.length, 3);
  assert.equal(data.outings?.length, 3);
  assert.equal(data.visits?.[0].source, 'imported');
  const stats = computeStats(data);
  assert.equal(stats.visitCount, 4);
  assert.equal(stats.pointCount, 3);
  assert.equal(stats.outingCount, 3);
  assert.equal(stats.averageSpeedKmh, 9);
  assert.ok(stats.totalDistanceKm > 0.1 && stats.totalDistanceKm < 0.2, 'recorded outing distance is not added to track distance');
});
