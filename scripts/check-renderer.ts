import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import electron from 'electron';

await mkdir('.artifacts', { recursive: true });
for (const name of ['renderer-check', 'renderer-preload']) await build({ entryPoints: [`test/${name}.ts`], outfile: `.artifacts/${name}.cjs`, bundle: true, platform: 'node', format: 'cjs', external: ['electron'] });
const child = spawn(electron as unknown as string, ['.artifacts/renderer-check.cjs'], { stdio: 'inherit' });
child.on('error', error => { console.error(error); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
