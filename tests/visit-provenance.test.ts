import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { App } from 'obsidian';
import { loadExport } from '../src/data-loader';
import { buildVisitPopup } from '../src/render/visits';

const base = { latitude: 10, longitude: 20, arrivedAt: '2026-05-04T08:00:00Z' };
const json = JSON.stringify({ visits: [{ ...base, source: 'imported', confirmationStatus: 'confirmed' }] });
const geojson = JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [20, 10] }, properties: { kind: 'visit', arrivedAt: base.arrivedAt, source: 'imported', confirmationStatus: 'confirmed' } }] });
const csv = 'arrived_at,latitude,longitude,source,confirmation_status\n2026-05-04T08:00:00Z,10,20,imported,confirmed\n';
const md = '# Whereday Export\n\n## Monday, May 4, 2026\n\n| Arrived | Lat | Lon | Source | Status |\n|---|---|---|---|---|\n| 8:00 AM | 10 | 20 | imported | confirmed |\n';

for (const [path, raw] of [['day.json', json], ['day.geojson', geojson], ['day.csv', csv], ['day.md', md]]) {
  test(`visit provenance survives ${path} load and reaches escaped popup`, async () => {
    const app = { vault: { adapter: { read: async () => raw } } } as unknown as App;
    const data = await loadExport(app, path);
    assert.equal(data.visits?.length, 1);
    const visit = data.visits![0];
    assert.equal(visit.source, 'imported');
    assert.equal(visit.confirmationStatus, 'confirmed');
    const popup = buildVisitPopup(visit);
    assert.ok(popup.includes('Source: Imported · Status: Confirmed'));
  });
}

test('legacy visits never acquire inferred source or confirmation labels', async () => {
  const app = { vault: { adapter: { read: async () => JSON.stringify({ visits: [base] }) } } } as unknown as App;
  const data = await loadExport(app, 'legacy.json');
  assert.equal(data.visits![0].source, null);
  assert.equal(data.visits![0].confirmationStatus, null);
  assert.ok(!buildVisitPopup(data.visits![0]).includes('iso-me-popup-provenance'));
});

test('native known values are labeled, unknown values remain text, not trusted HTML', () => {
  assert.ok(buildVisitPopup({ ...base, source: 'manual', confirmationStatus: 'corrected' }).includes('Source: Manual · Status: Corrected'));
  assert.ok(buildVisitPopup({ ...base, source: 'automatic', confirmationStatus: 'unconfirmed' }).includes('Source: Automatic · Status: Unconfirmed'));
  const popup = buildVisitPopup({ ...base, source: '<img src=x onerror=alert(1)>', confirmationStatus: '<script>synthetic</script>' });
  assert.ok(popup.includes('&lt;img'));
  assert.ok(popup.includes('&lt;script&gt;'));
  assert.ok(!popup.includes('<img'));
  assert.ok(!popup.includes('<script>'));
  assert.ok(buildVisitPopup({ ...base, source: '__proto__', confirmationStatus: 'constructor' }).includes('Source: __proto__ · Status: constructor'));
});
