import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import { watch } from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import { prepareIcons } from './icons';

const watching = process.argv.includes('--watch');
const feasibility = process.argv.includes('--feasibility');
let child: ChildProcess | undefined;
let building = false;
let queued = false;

async function compile() {
  if (building) { queued = true; return; }
  building = true;
  try {
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = new Promise<void>(resolve => child!.once('exit', () => resolve()));
      child.kill('SIGTERM');
      await exited;
    }
    await mkdir('dist', { recursive: true });
    const common = { bundle: true, sourcemap: true, logLevel: 'info' as const };
    if (feasibility) {
      await build({ ...common, entryPoints: ['scripts/feasibility.ts'], outfile: 'dist/feasibility.cjs', platform: 'node', format: 'cjs', external: ['electron'] });
    } else {
      await prepareIcons();
      await Promise.all([
        build({ ...common, entryPoints: ['src/main.ts'], outfile: 'dist/main.cjs', platform: 'node', format: 'cjs', external: ['electron'] }),
        build({ ...common, entryPoints: ['src/preload.ts'], outfile: 'dist/preload.cjs', platform: 'node', format: 'cjs', external: ['electron'] }),
        build({ ...common, entryPoints: ['src/renderer/index.ts'], outfile: 'dist/renderer/index.js', platform: 'browser', format: 'iife', target: 'chrome140' }),
      ]);
      await Promise.all([
        cp('src/renderer/index.html', 'dist/renderer/index.html'),
        cp('src/renderer/style.css', 'dist/renderer/style.css'),
        rm('dist/assets', { recursive: true, force: true }).then(() => cp('assets', 'dist/assets', { recursive: true })),
      ]);
    }
    if (watching || feasibility) {
      const { default: electron } = await import('electron');
      child = spawn(electron as unknown as string, [feasibility ? 'dist/feasibility.cjs' : '.'], { stdio: 'inherit' });
      child.on('error', error => console.error('Unable to launch Electron:', error));
      child.once('exit', () => { if (feasibility) process.exit(0); });
    }
  } catch (error) {
    console.error(error);
    if (!watching) process.exitCode = 1;
  } finally {
    building = false;
    if (queued) { queued = false; void compile(); }
  }
}

await compile();
if (watching) {
  let timer: ReturnType<typeof setTimeout>;
  for (const directory of ['src', 'assets']) watch(directory, { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => void compile(), 150);
  });
  process.on('SIGINT', () => { child?.kill(); process.exit(); });
  process.on('SIGTERM', () => { child?.kill(); process.exit(); });
}
