import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { App, PluginManifest } from 'obsidian';
import WheredayPlugin from '../src/main';
import { LEGACY_OSM_TILE_URL } from '../src/settings';
import { MapRenderChild } from '../src/render/map-block';
import { processors, setPluginData, savedData } from './host/obsidian';
import { Element } from './host/element';

function plugin() {
  return new WheredayPlugin({} as App, { id: 'iso-me-maps' } as PluginManifest);
}

test('both code fence aliases register the same renderer and preserve block settings', async () => {
  setPluginData(null);
  const instance = plugin();
  await instance.onload();
  assert.deepEqual([...processors.keys()], ['whereday', 'iso-me']);
  const children: MapRenderChild[] = [];
  for (const language of ['whereday', 'iso-me']) {
    processors.get(language)!('source: synthetic.json\ntile_provider: none\nshow_outings: false', new Element('div'), { addChild: (child: MapRenderChild) => children.push(child) });
  }
  assert.equal(children.length, 2);
  for (const child of children) {
    assert.ok(child instanceof MapRenderChild);
    assert.deepEqual((child as unknown as { cfg: unknown }).cfg, { source: 'synthetic.json', tile_provider: 'none', show_outings: false });
  }
});

test('settings loading cannot overwrite explicit None preference with a stale legacy URL', async () => {
  setPluginData({ tileProvider: 'none', tileUrl: LEGACY_OSM_TILE_URL, exportsFolder: 'exports', markerColor: '#123456' });
  const instance = plugin();
  await instance.loadSettings();
  assert.equal(instance.settings.tileProvider, 'none');
  assert.equal(instance.settings.tileUrl, LEGACY_OSM_TILE_URL);
  assert.equal(instance.settings.exportsFolder, 'exports');
  assert.equal(instance.settings.markerColor, '#123456');
  await instance.saveSettings();
  assert.equal((savedData[savedData.length - 1] as typeof instance.settings).tileProvider, 'none');
});

test('legacy online installs retain saved URLs and custom URL inference', async () => {
  setPluginData({ tileUrl: LEGACY_OSM_TILE_URL });
  const legacy = plugin();
  await legacy.loadSettings();
  assert.equal(legacy.settings.tileUrl, LEGACY_OSM_TILE_URL);
  assert.equal(legacy.settings.tileProvider, 'osm');
  setPluginData({ tileUrl: 'https://example.invalid/{z}/{x}/{y}', tileAttribution: 'Synthetic provider' });
  const custom = plugin();
  await custom.loadSettings();
  assert.equal(custom.settings.tileProvider, 'custom');
  assert.equal(custom.settings.tileAttribution, 'Synthetic provider');
});
