import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const dir = await mkdtemp(join(tmpdir(), 'whereday-maps-tests-'));
try {
  const outfile = join(dir, 'tests.cjs');
  await build({
    entryPoints: ['tests/compatibility.test.ts'], outfile, bundle: true, platform: 'node', format: 'cjs',
    // Lightweight host boundaries, not a browser/layout or network simulator.
    plugins: [{ name: 'test-host', setup(build) {
      build.onResolve({ filter: /^(obsidian|leaflet)$/ }, args => ({
        path: resolve(`tests/host/${args.path}.ts`),
      }));
    } }],
  });
  const result = spawnSync(process.execPath, ['--test', outfile], { stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
} finally {
  await rm(dir, { recursive: true, force: true });
}
