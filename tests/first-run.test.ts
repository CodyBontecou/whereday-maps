import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { App, PluginManifest } from 'obsidian';
import WheredayPlugin from '../src/main';
import { DEFAULT_SETTINGS, getProvider, resolveTileLayer, TILE_PROVIDERS } from '../src/settings';
import { addBasemap } from '../src/render/basemap';
import type { Map } from 'leaflet';
import { tileRequests } from './host/leaflet';
import { setPluginData } from './host/obsidian';

const plugin = () => new WheredayPlugin({} as App, { id: 'iso-me-maps' } as PluginManifest);

test('fresh and empty installs default to local overlays, with no tile factory calls', async () => {
  for (const data of [null, {}]) {
    setPluginData(data);
    const instance = plugin();
    await instance.loadSettings();
    assert.equal(instance.settings.tileProvider, 'none');
    assert.equal(instance.settings.tileUrl, '');
    tileRequests.length = 0;
    const config = resolveTileLayer(instance.settings);
    assert.equal(config.enabled, false);
    addBasemap({} as Map, config);
    assert.equal(tileRequests.length, 0);
  }
  assert.equal(DEFAULT_SETTINGS.tileProvider, 'none');
});

test('all explicitly saved presets and URLs survive new local-only defaults', async () => {
  for (const preset of TILE_PROVIDERS.filter(p => p.id !== 'custom')) {
    setPluginData({ tileProvider: preset.id, tileUrl: preset.url, tileAttribution: preset.attribution, exportsFolder: 'exports' });
    const instance = plugin();
    await instance.loadSettings();
    assert.equal(instance.settings.tileProvider, preset.id);
    assert.equal(instance.settings.tileUrl, preset.url);
    assert.equal(instance.settings.tileAttribution, preset.attribution);
    assert.equal(instance.settings.exportsFolder, 'exports');
  }
});

test('a saved online preset without URL receives that preset rather than the empty default', async () => {
  setPluginData({ tileProvider: 'esri-world-imagery' });
  const instance = plugin();
  await instance.loadSettings();
  assert.equal(instance.settings.tileUrl, getProvider('esri-world-imagery').url);
  assert.equal(resolveTileLayer(instance.settings).enabled, true);
});

test('pre-dropdown Carto installs retain their URL and attribution', async () => {
  const carto = getProvider('carto-voyager');
  setPluginData({ tileUrl: carto.url, tileAttribution: carto.attribution });
  const instance = plugin();
  await instance.loadSettings();
  assert.equal(instance.settings.tileProvider, 'carto-voyager');
  assert.equal(instance.settings.tileUrl, carto.url);
  assert.equal(instance.settings.tileAttribution, carto.attribution);
});

test('empty custom configuration stays tile-free, while explicit custom URL overrides work', () => {
  assert.equal(resolveTileLayer({ ...DEFAULT_SETTINGS, tileProvider: 'custom' }).enabled, false);
  const config = resolveTileLayer(DEFAULT_SETTINGS, { tile_provider: 'custom', tile_url: 'https://example.invalid/{z}/{x}/{y}', tile_attribution: 'Synthetic provider' });
  assert.equal(config.enabled, true);
  assert.equal(config.url, 'https://example.invalid/{z}/{x}/{y}');
});
