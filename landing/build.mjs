import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import './prepare-thumbnails.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
await build({
  absWorkingDir: root,
  entryPoints: ['src/site.ts'],
  outfile: resolve(root, 'js/site.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['safari16.4', 'chrome110', 'firefox115'],
  minify: true,
  logLevel: 'info',
});
