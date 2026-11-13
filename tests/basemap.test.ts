import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Map } from 'leaflet';
import { DEFAULT_SETTINGS, LEGACY_OSM_TILE_URL, resolveTileLayer, findProviderByUrl, getProvider } from '../src/settings';
import { addBasemap } from '../src/render/basemap';
import { tileRequests } from './host/leaflet';

const map = {} as Map;
const online = { ...DEFAULT_SETTINGS, tileProvider: 'carto-voyager' as const, tileUrl: getProvider('carto-voyager').url, tileAttribution: getProvider('carto-voyager').attribution };

test('per-map none disables tile creation even with an explicit URL', () => {
  tileRequests.length = 0;
  const config = resolveTileLayer(online, {
    tile_provider: 'none', tile_url: 'https://example.invalid/{z}/{x}/{y}.png',
  });
  assert.equal(config.enabled, false);
  assert.equal(addBasemap(map, config), null);
  assert.equal(tileRequests.length, 0);
});

test('saved none remains offline with stale legacy URLs and invalid overrides', () => {
  for (const overrides of [{}, { tile_url: 'https://example.invalid/tile' }, { tile_provider: 'typo' }]) {
    tileRequests.length = 0;
    const config = resolveTileLayer({ ...DEFAULT_SETTINGS, tileProvider: 'none', tileUrl: LEGACY_OSM_TILE_URL }, overrides);
    assert.deepEqual(config, { enabled: false, url: '', attribution: '' });
    addBasemap(map, config);
    assert.equal(tileRequests.length, 0);
  }
});

test('an explicit online provider can override a saved none default', () => {
  tileRequests.length = 0;
  const config = resolveTileLayer({ ...DEFAULT_SETTINGS, tileProvider: 'none' }, { tile_provider: 'esri-world-imagery' });
  assert.equal(config.enabled, true);
  assert.ok(config.url.includes('arcgisonline.com'));
  assert.ok(addBasemap(map, config));
  assert.equal(tileRequests.length, 1);
  assert.equal(tileRequests[0].url, config.url);
  assert.equal(tileRequests[0].map, map);
});

test('online defaults, per-map URLs, attribution and provider overrides retain their behavior', () => {
  assert.equal(resolveTileLayer(online).url, online.tileUrl);
  assert.equal(findProviderByUrl(''), undefined, 'None must be an explicit choice, not inferred from an old empty URL');
  const config = resolveTileLayer(DEFAULT_SETTINGS, {
    tile_provider: 'opentopomap', tile_url: 'https://example.invalid/{z}/{x}/{y}', tile_attribution: 'Synthetic tiles',
  });
  assert.deepEqual(config, { enabled: true, url: 'https://example.invalid/{z}/{x}/{y}', attribution: 'Synthetic tiles' });
  assert.ok(resolveTileLayer(DEFAULT_SETTINGS, { tile_provider: 'opentopomap' }).attribution.includes('OpenTopoMap'));
});

test('tile boundary honors disabled flag independently of URL contents', () => {
  tileRequests.length = 0;
  addBasemap(map, { enabled: false, url: online.tileUrl, attribution: 'stale' });
  assert.equal(tileRequests.length, 0);
});
