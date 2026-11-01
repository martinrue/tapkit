import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import electron from 'electron';

await mkdir('.artifacts', { recursive: true });
await Promise.all([
  build({ entryPoints: ['test/audio-check-renderer.ts'], outfile: '.artifacts/audio-check-renderer.js', bundle: true, platform: 'browser', format: 'iife' }),
  build({ entryPoints: ['test/audio-check.ts'], outfile: '.artifacts/audio-check.cjs', bundle: true, platform: 'node', format: 'cjs', external: ['electron'] }),
  writeFile('.artifacts/audio-check.html', '<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; connect-src \'self\'"><title>Muted audio checks</title>'),
]);
const child = spawn(electron as unknown as string, ['.artifacts/audio-check.cjs'], { stdio: 'inherit' });
child.on('error', error => { console.error(error); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
