import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Builds the Azure App Service deployment package for Spin the Bottle.
//
// `vinext build` emits dist/client and dist/server, and the only working
// production entrypoint is `vinext start` — there is no self-contained server
// bundle. vinext is a devDependency of the workspace, so a package that only
// carries dist/ cannot start. This script pins vinext as a real dependency of
// the deployed package and drops the workspace deps, which the build inlines.

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const appRoot = join(repoRoot, 'games', 'spin-the-bottle');
const distDir = join(appRoot, 'dist');
const outDir = join(repoRoot, 'artifacts', 'spin-the-bottle');

if (!existsSync(join(distDir, 'server')) || !existsSync(join(distDir, 'client'))) {
  console.error('Missing dist/client or dist/server. Run "npm run build:spin-the-bottle" first.');
  process.exit(1);
}

const source = JSON.parse(await readFile(join(appRoot, 'package.json'), 'utf8'));
const vinextVersion = source.devDependencies?.vinext;
if (!vinextVersion) {
  console.error('Could not read the vinext version from games/spin-the-bottle/package.json.');
  process.exit(1);
}

try {
  await rm(outDir, { recursive: true, force: true });
} catch (error) {
  // Windows keeps a directory handle open while a previous `npm start` from
  // this package is still running, which surfaces as EBUSY rather than EACCES.
  if (error.code === 'EBUSY' || error.code === 'EPERM') {
    console.error(`Could not clear ${outDir}: a process is still using it. Stop any "vinext start" running from that directory and retry.`);
    process.exit(1);
  }
  throw error;
}
await mkdir(outDir, { recursive: true });
await cp(distDir, join(outDir, 'dist'), { recursive: true });

// App Service reads PORT from the environment; vinext start already honours it.
await writeFile(
  join(outDir, 'package.json'),
  `${JSON.stringify(
    {
      name: 'spin-the-bottle-appservice',
      version: source.version,
      private: true,
      type: 'module',
      engines: source.engines,
      scripts: { start: 'vinext start' },
      dependencies: { vinext: vinextVersion },
    },
    null,
    2,
  )}\n`,
);

console.log(`Spin the Bottle App Service package written to artifacts/spin-the-bottle (vinext ${vinextVersion}).`);
