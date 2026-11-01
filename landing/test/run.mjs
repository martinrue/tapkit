// Development-only checks. Uses Electron from the parent app's dependencies.
import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import electron from 'electron';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';

const root = fileURLToPath(new URL('../', import.meta.url));
await mkdir(`${root}/.artifacts`, { recursive: true });
await build({ entryPoints: [`${root}/test/site-check.ts`], outfile: `${root}/.artifacts/site-check.cjs`, platform: 'node', format: 'cjs', bundle: true, external: ['electron'] });
const child = spawn(electron, [`${root}/.artifacts/site-check.cjs`], { cwd: root, stdio: 'inherit' });
child.on('error', error => { console.error(error); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
