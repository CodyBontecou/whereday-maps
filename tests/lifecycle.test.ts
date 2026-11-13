import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { App, MarkdownPostProcessorContext } from 'obsidian';
import { MapRenderChild } from '../src/render/map-block';
import { DEFAULT_SETTINGS } from '../src/settings';
import { Element } from './host/element';
import { maps, tileRequests } from './host/leaflet';

const exportJSON = JSON.stringify({ visits: [{ latitude: 10, longitude: 20, arrivedAt: '2026-05-04T08:00:00Z' }] });
function vault(read: () => Promise<string>): App {
  return { vault: { adapter: { read, stat: async () => ({ type: 'file' }) } } } as unknown as App;
}
const settle = () => new Promise<void>(resolve => setImmediate(resolve));
function child(parent: Element, read: () => Promise<string>) {
  return new MapRenderChild(parent as unknown as HTMLElement, vault(read), DEFAULT_SETTINGS, { source: 'synthetic.json', tile_provider: 'esri-world-imagery' }, {} as MarkdownPostProcessorContext);
}

test('unload while a successful export read is pending cannot create maps, tiles, or DOM afterward', async () => {
  let finish!: (raw: string) => void;
  const pending = new Promise<string>(resolve => { finish = resolve; });
  const parent = new Element('div');
  maps.length = 0; tileRequests.length = 0;
  const renderer = child(parent, () => pending);
  renderer.onload();
  await settle();
  renderer.onunload();
  finish(exportJSON);
  await settle();
  assert.equal(maps.length, 0);
  assert.equal(tileRequests.length, 0);
  assert.equal(parent.children.length, 0);
});

test('unload while a failed export read is pending cannot append an error afterward', async () => {
  let fail!: (error: Error) => void;
  const pending = new Promise<string>((_resolve, reject) => { fail = reject; });
  const parent = new Element('div');
  const renderer = child(parent, () => pending);
  renderer.onload();
  await settle();
  renderer.onunload();
  fail(new Error('synthetic read failure'));
  await settle();
  assert.equal(parent.children.length, 0);
});

test('a stale read from before reload cannot overwrite the current render', async () => {
  let finish!: (raw: string) => void;
  const pending = new Promise<string>(resolve => { finish = resolve; });
  let reads = 0;
  const parent = new Element('div');
  const renderer = child(parent, () => ++reads === 1 ? pending : Promise.resolve('{'));
  renderer.onload();
  await settle();
  renderer.onunload();
  renderer.onload();
  await settle();
  assert.equal(parent.children.length, 1);
  assert.equal(parent.children[0].cls, 'iso-me-error');
  const currentError = parent.children[0];
  finish(exportJSON);
  await settle();
  assert.equal(parent.children.length, 1);
  assert.equal(parent.children[0], currentError);
  renderer.onunload();
});

test('completed map unload removes map and scheduled layout work', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  let next = 1;
  const timers = new Set<number>();
  const frames = new Set<number>();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    requestAnimationFrame: () => { const id = next++; frames.add(id); return id; },
    cancelAnimationFrame: (id: number) => frames.delete(id),
    setTimeout: () => { const id = next++; timers.add(id); return id; },
    clearTimeout: (id: number) => timers.delete(id),
  } });
  const parent = new Element('div');
  const renderer = child(parent, async () => exportJSON);
  maps.length = 0; tileRequests.length = 0;
  try {
    renderer.onload();
    await settle();
    assert.equal(maps.length, 1);
    assert.equal(tileRequests.length, 1);
    assert.equal(timers.size, 5);
    assert.equal(frames.size, 1);
    renderer.onunload();
    assert.equal(maps[0].removed, true);
    assert.equal(timers.size, 0);
    assert.equal(frames.size, 0);
    assert.equal(parent.children.length, 0);
    renderer.onunload(); // idempotent cleanup
  } finally {
    renderer.onunload();
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
