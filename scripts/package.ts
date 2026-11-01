import { Arch, build, Platform } from 'electron-builder';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const { version, repository } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as {
  version: string;
  repository: { url: string };
};
const releaseUrl = `${repository.url.replace(/\.git$/, '')}/releases/latest/download/tapkit.dmg`;
const landing = join(root, 'landing');
const indexPath = join(landing, 'index.html');
const downloads = join(landing, 'downloads');
const temporary = join(downloads, 'tapkit.dmg.tmp');
const destination = join(downloads, 'tapkit.dmg');

// A failed build keeps the previous landing download and metadata.
const artifacts = await build({
  projectDir: root,
  targets: Platform.MAC.createTarget('dmg', Arch.arm64),
  publish: 'never',
  config: { dmg: { artifactName: 'tapkit.${ext}' } },
});
const artifact = artifacts.find(path => path.endsWith('.dmg'));
if (!artifact) throw new Error('Packaging did not produce a DMG.');

// Read the latest page after building so packaging preserves concurrent copy edits.
const index = await readFile(indexPath, 'utf8');
const downloadLink = /(<a\b[^>]*class="[^"]*\brelease-download\b[^"]*"[^>]*href=")[^"]*(")/g;
const releaseMeta = /(<p class="release-meta">)[^<]*(<\/p>)/g;
if ([...index.matchAll(downloadLink)].length !== 1 || [...index.matchAll(releaseMeta)].length !== 1) {
  throw new Error('Unable to locate the landing page download link and version label.');
}

await mkdir(downloads, { recursive: true });
try {
  await copyFile(artifact, temporary);
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(temporary)) hash.update(chunk);
  await rename(temporary, destination);
  await writeFile(join(downloads, 'SHA256SUMS'), `${hash.digest('hex')}  tapkit.dmg\n`);
  await writeFile(join(landing, 'config.js'), `// Updated by npm run package from the root package.json repository and version.
window.TAPKIT_RELEASE = {
  url: ${JSON.stringify(releaseUrl)},
  version: ${JSON.stringify(version)},
  platform: 'macOS · Apple silicon',
  unsigned: true,
};
`);
  await writeFile(indexPath, index
    .replace(downloadLink, `$1${releaseUrl}$2`)
    .replace(releaseMeta, `$1Version ${version} · macOS · Apple silicon$2`));
} finally {
  await rm(temporary, { force: true });
}
console.log(`\nPackaged Tapkit ${version}: ${destination}`);
