import './visualizations.test';
import './journal.test';
import './geojson.test';
import './controls.test';
import './basemap.test';
import './outings.test';
import './lifecycle.test';
import './plugin.test';
import './first-run.test';
import './visit-provenance.test';
import './mixed-exports.test';
import './outing-csv.test';
import './atlas.test';
import './source-refresh.test';
import './atlas-render.test';
import './place-links.test';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseExportMarkdown, MarkdownParseError } from '../src/markdown-parser';
import { parseBlockConfig } from '../src/parser';

// Synthetic data follows ExportService.swift's English Markdown table schema.
const visits = `## Friday, March 14, 2025

| Arrived | Departed | Duration | Lat | Lon | Location | Address | Notes | Source | Status | Visit Metadata |
|------|------|------|------|------|------|------|------|------|------|------|
| 8:12 AM | 8:45 AM | 33m | 10.000000 | 20.000000 | Synthetic Park | - | Invented | manual | confirmed | {} |
`;
const points = `## Friday, March 14, 2025

| Time | Lat | Lon | Altitude | Speed | Accuracy | Outlier |
|------|------|------|------|------|------|------|
| 8:12:05 AM | 10.000000 | 20.000000 | 12 m | 2.5 m/s | 5 m | No |
| 8:13:05 AM | 10.001000 | 20.001000 | - | - | 500 m | Yes |
`;

for (const brand of ['Whereday', 'iso.me']) {
  test(`${brand} visits export`, () => {
    const data = parseExportMarkdown(`# ${brand} Export\n\n${visits}`);
    assert.equal(data.visits?.length, 1);
    assert.equal(data.points, null);
    const visit = data.visits![0];
    assert.equal(visit.locationName, 'Synthetic Park');
    assert.equal(visit.durationMinutes, 33);
    assert.equal(visit.latitude, 10);
    assert.equal(new Date(visit.arrivedAt).getHours(), 8);
    assert.equal(visit.notes, 'Invented');
  });
  test(`${brand} points export`, () => {
    const data = parseExportMarkdown(`# ${brand} Location Points Export\n\n${points}`);
    assert.equal(data.points?.length, 2);
    assert.equal(data.visits, null);
    assert.equal(data.points![1].isOutlier, true);
    assert.equal(data.points![0].speed, 2.5);
  });
  test(`${brand} complete export skips wrapper and merges sections`, () => {
    const data = parseExportMarkdown(`# ${brand} Complete Export\n\n# Visits\n\n${visits}\n# Location Points\n\n${points}`);
    assert.equal(data.visits?.length, 1);
    assert.equal(data.points?.length, 2);
  });
  test(`${brand} bullet visits remain supported`, () => {
    const data = parseExportMarkdown(`# ${brand} Export
## Friday, March 14, 2025
### Synthetic Park
- **Arrived:** 08:12
- **Coordinates:** 10, 20
- **Duration:** 1h 20m
> Invented notes
`);
    assert.equal(data.visits?.[0].durationMinutes, 80);
    assert.equal(data.visits?.[0].notes, 'Invented notes');
  });
}

test('escaped pipes and backslashes do not shift visit columns', () => {
  const escaped = visits.replace('Synthetic Park | - | Invented', String.raw`Synthetic \| Park | Example \\ | Note \| detail`);
  const data = parseExportMarkdown(`# Whereday Export\n\n${escaped}`);
  assert.equal(data.visits?.[0].locationName, 'Synthetic | Park');
  assert.equal(data.visits?.[0].address, 'Example \\');
  assert.equal(data.visits?.[0].notes, 'Note | detail');
});

test('unsupported outing and unrelated headings report errors instead of silent empty maps', () => {
  for (const heading of ['Whereday Outings Export', 'iso.me Outings Export', 'Personal diary']) {
    assert.throws(() => parseExportMarkdown(`# ${heading}\n\n${visits}`), MarkdownParseError);
  }
});

test('map block parameters retain legacy semantics', () => {
  assert.deepEqual(parseBlockConfig('source: exports/day.md\nshow_stats: true\ninteractive: yes\nheight: 500'), {
    source: 'exports/day.md', show_stats: true, interactive: true, height: 500,
  });
});
