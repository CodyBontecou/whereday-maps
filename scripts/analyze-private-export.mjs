// Usage: node scripts/analyze-private-export.mjs /absolute/path/to/export.json
// Keeps real records out of the repository and prints aggregates only.
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const inputPath = process.argv[2];
if (!inputPath) throw new Error('Supply a private JSON export path.');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temp = await mkdtemp(join(tmpdir(), 'whereday-private-analysis-'));
try {
  const outfile = join(temp, 'analysis.mjs');
  await build({
    stdin: { contents: `
      import { readFile } from 'node:fs/promises';
      import assert from 'node:assert/strict';
      import { loadExport, loadExports } from './src/data-loader';
      import { sortedVisits, playbackPoints, tripSummary, densityCells, placeTarget } from './src/atlas';
      export async function analyze(path) {
        const raw = await readFile(path, 'utf8'), input = JSON.parse(raw);
        const app = { vault: { adapter: { read: async () => raw, stat: async () => ({type:'file'}) } } };
        const data = await loadExport(app, 'private.json');
        assert.equal(data.visits?.length ?? 0, input.visits?.length ?? 0);
        assert.equal(data.points?.length ?? 0, input.points?.length ?? 0);
        for (let i=0; i<(input.visits?.length ?? 0); i++) for (const key of Object.keys(input.visits[i])) assert.deepEqual(data.visits[i][key],input.visits[i][key]);
        const merged = await loadExports(app,['private.json','duplicate.json']);
        const visits = sortedVisits(data.visits ?? []), points = playbackPoints(data.points ?? []);
        const names = visits.map(v => v.locationName?.trim()).filter(Boolean);
        const trip = tripSummary(data), density = densityCells(data);
        const counts = values => Object.fromEntries([...new Set(values)].map(v => [v, values.filter(x => x === v).length]));
        return {
          exportDate: data.exportDate,
          deduplicatedVisits: merged.visits?.length ?? 0,
          deduplicatedPoints: merged.points?.length ?? 0,
          deduplicatedPlaybackPoints: playbackPoints(merged.points ?? []).length,
          duplicateSnapshotDetected: !!merged.receipt?.sources[1].duplicateOf,
          loadedVisits: data.visits?.length ?? 0, timelineVisits: visits.length,
          loadedPoints: data.points?.length ?? 0, playbackPoints: points.length,
          excludedPlaybackPoints: (data.points?.length ?? 0) - points.length,
          newestPoint: points.at(-1)?.timestamp,
          loadedDays: trip.days, dashboardPlaces: trip.places,
          namedVisits: names.length, unnamedVisits: visits.length - names.length,
          uniqueNamedPlaces: new Set(names.map(n => n.toLocaleLowerCase())).size,
          placeLinkTargets: new Set(names.map(n => placeTarget(n))).size,
          visitsUnderOneMinute: visits.filter(v => v.durationMinutes != null && v.durationMinutes < 1).length,
          visitsOver24Hours: visits.filter(v => v.durationMinutes > 1440).length,
          sourceCounts: counts(visits.map(v => v.source ?? 'absent')),
          confirmationCounts: counts(visits.map(v => v.confirmationStatus ?? 'absent')),
          outings: trip.outings, trackKm: Math.round(trip.trackMeters / 100) / 10,
          densityCells: density.cells.length,
          rawVisitFieldsNotPreserved: [...new Set((input.visits ?? []).flatMap(v => Object.keys(v)))].filter(k => !(data.visits ?? []).some(v => k in v)).sort()
        };
      }
    `, resolveDir: root, loader: 'ts' },
    outfile, bundle: true, platform: 'node', format: 'esm',
    plugins: [{ name: 'obsidian-host', setup(build) {
      build.onResolve({ filter: /^obsidian$/ }, () => ({ path: join(root, 'tests/host/obsidian.ts') }));
    } }],
  });
  const { analyze } = await import(pathToFileURL(outfile).href);
  console.log(JSON.stringify(await analyze(resolve(inputPath)), null, 2));
} catch {
  console.error('Private analysis failed; file contents and exception details suppressed.');
  process.exitCode = 1;
} finally {
  await rm(temp, { recursive: true, force: true });
}
