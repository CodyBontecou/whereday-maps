import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildControls, DEFAULT_FILTER, FilterState } from '../src/render/controls';

import { Element } from './host/element';

test('controls have associated day label and named sliders with human-readable values', () => {
  const parent = new Element('div');
  buildControls(parent as unknown as HTMLElement, ['2026-05-04'], DEFAULT_FILTER, () => {});
  const day = parent.all().find(el => el.tag === 'select')!;
  assert.ok(parent.all().some(el => el.tag === 'label' && el.children.includes(day)));
  const ranges = parent.all().filter(el => el.type === 'range');
  assert.deepEqual(ranges.map(el => el.attributes['aria-label']), ['Start time', 'End time']);
  assert.deepEqual(ranges.map(el => el.attributes['aria-valuetext']), ['Start of day', 'End of day']);
});

test('time changes clamp, emit fresh state on commit, and reset accessible values', () => {
  const parent = new Element('div');
  const updates: FilterState[] = [];
  buildControls(parent as unknown as HTMLElement, ['2026-05-04'], DEFAULT_FILTER, state => updates.push(state));
  const [start, end] = parent.all().filter(el => el.type === 'range');
  start.value = '600'; start.dispatch('input'); start.dispatch('change');
  assert.equal(start.attributes['aria-valuetext'], '10:00 AM');
  end.value = '500'; end.dispatch('input'); end.dispatch('change');
  assert.equal(end.value, '600');
  assert.equal(end.attributes['aria-valuetext'], '10:00 AM');
  start.value = '700'; start.dispatch('input'); start.dispatch('change');
  assert.equal(start.value, '600');
  const day = parent.all().find(el => el.tag === 'select')!;
  day.value = '2026-05-04'; day.dispatch('change');
  assert.equal(updates[updates.length - 1].day, '2026-05-04');
  parent.all().find(el => el.tag === 'button')!.dispatch('click');
  assert.deepEqual(updates[updates.length - 1], DEFAULT_FILTER);
  assert.equal(start.attributes['aria-valuetext'], 'Start of day');
  assert.equal(end.attributes['aria-valuetext'], 'End of day');
  assert.equal(updates[0].timeEndMin, 1440, 'earlier snapshots must not mutate');
});
