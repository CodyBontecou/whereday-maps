import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SourceRefresh } from '../src/source-refresh';

function clock() {
  let pending: (() => void) | null = null;
  return { schedule: (callback: () => void) => { pending = callback; return () => { if (pending === callback) pending = null; }; }, flush: async () => { const callback = pending; pending = null; callback?.(); await new Promise<void>(resolve => setImmediate(resolve)); }, hasPending: () => pending !== null };
}

test('refresh ignores unrelated modifies and debounces related events without losing a relevant change', async () => {
  const timer = clock(); let reads = 0, refreshes = 0;
  const watcher = new SourceRefresh(async () => { reads++; return ['exports/day.json']; }, () => refreshes++, timer.schedule);
  watcher.track(['exports/day.json']);
  watcher.changed('Private/unrelated.md', 'modify'); assert.equal(timer.hasPending(), false); assert.equal(reads, 0);
  watcher.changed('exports/day.json', 'modify'); watcher.changed('exports/day.json', 'modify');
  watcher.changed('Unrelated/new.json', 'create'); // must not replace the relevant queued change
  await timer.flush(); assert.equal(reads, 1); assert.equal(refreshes, 1);
  watcher.dispose();
});

test('new glob/date files and folder renames refresh only when configured paths match', async () => {
  const timer = clock(); let refreshes = 0;
  const watcher = new SourceRefresh(async () => ['exports/2026-05-04.json'], () => refreshes++, timer.schedule);
  watcher.changed('elsewhere.json', 'create'); await timer.flush(); assert.equal(refreshes, 0);
  watcher.changed('exports/2026-05-04.json', 'create'); await timer.flush(); assert.equal(refreshes, 1);
  watcher.track(['exports/2026-05-04.json']);
  watcher.changed('archive', 'rename', 'exports'); await timer.flush(); assert.equal(refreshes, 2);
  watcher.dispose();
});

test('deleting a known source reloads into an honest error, then creation can recover', async () => {
  const timer = clock(); let missing = true, refreshes = 0;
  const watcher = new SourceRefresh(async () => { if (missing) throw new Error('missing'); return ['exports/day.json']; }, () => refreshes++, timer.schedule);
  watcher.track(['exports/day.json']);
  watcher.changed('exports/day.json', 'delete'); await timer.flush(); assert.equal(refreshes, 1);
  missing = false; watcher.changed('exports/day.json', 'create'); await timer.flush(); assert.equal(refreshes, 2);
});

test('dispose cancels pending work and late asynchronous resolutions cannot refresh detached maps', async () => {
  const timer = clock(); let refreshes = 0, finish!: (paths: string[]) => void;
  const watcher = new SourceRefresh(() => new Promise(resolve => { finish = resolve; }), () => refreshes++, timer.schedule);
  watcher.track(['exports/day.json']); watcher.changed('exports/day.json', 'modify');
  await timer.flush(); watcher.dispose(); finish(['exports/day.json']);
  await new Promise<void>(resolve => setImmediate(resolve)); assert.equal(refreshes, 0);
  watcher.changed('exports/day.json', 'modify'); assert.equal(timer.hasPending(), false);
});

test('newer file events invalidate pending resolution without losing queued matches', async () => {
  const timer = clock(); let refreshes = 0, resolveFirst!: (paths: string[]) => void, calls = 0;
  const watcher = new SourceRefresh(() => ++calls === 1 ? new Promise(resolve => { resolveFirst = resolve; }) : Promise.resolve(['exports/day.json']), () => refreshes++, timer.schedule);
  watcher.track(['exports/day.json']); watcher.changed('exports/day.json', 'modify'); await timer.flush();
  watcher.changed('new-unrelated.json', 'create'); resolveFirst(['exports/day.json']);
  await new Promise<void>(resolve => setImmediate(resolve)); assert.equal(refreshes, 0);
  await timer.flush(); assert.equal(refreshes, 1);
});
