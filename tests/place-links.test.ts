import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { App } from 'obsidian';
import { appendPlaceLinks, insertPlaceLinks } from '../src/place-links';
import { renderAtlasPanels } from '../src/render/atlas-panels';
import { Element } from './host/element';

test('real place backlinks append wiki links without changing note body or duplicating links', () => {
  const note = '# Synthetic note\n\n```whereday\nsource: exports/day.json\n```\n';
  const result = appendPlaceLinks(note, ['Places/Invented Park', 'Places/Invented Park', '../escape', 'Bad]]target']);
  assert.ok(result.startsWith(note.trimEnd()));
  assert.ok(result.includes('- [[Places/Invented Park]]'));
  assert.ok(!result.includes('[[../escape]]'));
  assert.equal(appendPlaceLinks(result, ['Places/Invented Park']), result);
  assert.equal(appendPlaceLinks(note, []), note);
});

test('backlink insertion uses atomic processing of only the source Markdown note', async () => {
  let processed = '';
  const app = { vault: {
    getFileByPath: (path: string) => path === 'Daily/2026-05-04.md' ? { path, extension: 'md' } : null,
    process: async (file: { path: string }, update: (text: string) => string) => { processed = file.path; return update('Original synthetic content'); },
  } } as unknown as App;
  await insertPlaceLinks(app, 'Daily/2026-05-04.md', ['Places/Invented Park']);
  assert.equal(processed, 'Daily/2026-05-04.md');
  await assert.rejects(insertPlaceLinks(app, 'missing.md', []), /Cannot find/);
});

test('place link rendering never writes notes until the explicit insert button is activated', async () => {
  const parent = new Element('div'); let writes = 0;
  renderAtlasPanels(parent as unknown as HTMLElement, { visits: [{ latitude: 10, longitude: 20, arrivedAt: '2026-05-04T12:00:00Z', locationName: 'Invented Park' }], points: null }, { visits: null, points: null }, { place_links: true }, new Date(2026, 4, 4), {
    focus() {}, openPlace() {}, point() {}, insertPlaces: async targets => { writes++; assert.deepEqual(targets, ['Places/Invented Park']); },
  });
  assert.equal(writes, 0);
  parent.all().find(e => e.tag === 'button' && e.textContent.startsWith('Insert'))!.dispatch('click');
  await new Promise<void>(resolve => setImmediate(resolve)); assert.equal(writes, 1);
});
