import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { App } from 'obsidian';
import { parseExportCSV, CSVParseError } from '../src/csv-parser';
import { parseOutings } from '../src/outing-parser';
import { loadExport } from '../src/data-loader';
import { computeStats } from '../src/render/stats-bar';

const csv = readFileSync('examples/synthetic-outings.csv', 'utf8');
const json = JSON.parse(readFileSync('examples/synthetic-outings.json', 'utf8'));
const header = csv.split('\n')[0];

test('native outing CSV and JSON normalize to identical summaries and endpoints', () => {
  const data = parseExportCSV(csv);
  assert.deepEqual(data.outings, parseOutings(json.outings));
  assert.equal(data.visits, null);
  assert.equal(data.points, null);
  const stats = computeStats(data);
  assert.equal(stats.outingCount, 3);
  assert.equal(stats.pointCount, 0);
  assert.equal(stats.totalDistanceKm, 0);
});

test('quoted outing titles and multiline notes survive CSV escaping and CRLF', () => {
  const title = 'Invented, "quoted" walk';
  const text = csv.replace('Invented morning walk', '"Invented, ""quoted"" walk"')
    .replace('Synthetic fixture only. This summary contains no track geometry.', '"Synthetic, line one\nLine ""two"""')
    .replace(/\n/g, '\r\n');
  const [outing] = parseExportCSV('\uFEFF' + text).outings!;
  assert.equal(outing.title, title);
  assert.equal(outing.notes, 'Synthetic, line one\r\nLine "two"');
  assert.deepEqual(outing.start, [10, 20]);
});

test('invalid outing CSV identity/time rows skip, while missing/invalid coordinates retain summaries', () => {
  const minimal = 'id,title,started_at,effective_end_at,start_latitude,start_longitude,distance_meters\n';
  const data = parseExportCSV(minimal + [
    'missing-time,Invented,,2026-05-04T09:00:00Z,10,20,10',
    ',Invented,2026-05-04T08:00:00Z,2026-05-04T09:00:00Z,10,20,10',
    'backward,Invented,2026-05-04T09:00:00Z,2026-05-04T08:00:00Z,10,20,10',
    'no-coords,Invented,2026-05-04T08:00:00Z,2026-05-04T09:00:00Z,,,-1',
    'bad-coords,Invented,2026-05-04T08:00:00Z,2026-05-04T09:00:00Z,91,20,5',
  ].join('\n'));
  assert.equal(data.outings?.length, 2);
  assert.equal(data.outings![0].start, null);
  assert.equal(data.outings![0].distanceMeters, null);
  assert.equal(data.outings![1].start, null);
});

test('header-only outing CSV is recognized as an empty export, unrelated CSV still errors', () => {
  assert.deepEqual(parseExportCSV(header + '\n').outings, []);
  assert.throws(() => parseExportCSV('id,title\nsynthetic,Invented\n'), CSVParseError);
});

test('combined sections retain actual visits/points and do not inflate them from outing counts', () => {
  const combined = '# VISITS\narrived_at,latitude,longitude\n2026-05-04T08:00:00Z,10,20\n' +
    '# OUTINGS\n' + csv + '# LOCATION POINTS\ntimestamp,latitude,longitude\n2026-05-04T08:00:00Z,10,20\n';
  const data = parseExportCSV(combined);
  assert.equal(data.outings?.length, 3);
  assert.equal(data.visits?.length, 1);
  assert.equal(data.points?.length, 1);
});

test('public CSV loader carries outing summaries into the existing presentation model', async () => {
  const app = { vault: { adapter: { read: async () => csv } } } as unknown as App;
  const data = await loadExport(app, 'outings.csv');
  assert.equal(data.detectedFormat, 'iso-me-csv');
  assert.equal(data.outings?.length, 3);
  assert.equal(data.outings![1].isInferred, true);
  assert.equal(data.outings![2].isActive, true);
});
