/** Download the existing CC BY 3.0 Salamander bank; no runtime network access. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, writeFile } from 'node:fs/promises';
import { pianoRoots, pianoSampleFile } from '../src/shared/piano';

const run = promisify(execFile);
for (const root of pianoRoots) {
  const file = pianoSampleFile(root), path = `assets/audio/${file}`;
  try { await access(path); continue; } catch {}
  const response = await run('gh', ['api', `repos/Tonejs/audio/contents/salamander/${file}`], { maxBuffer: 8 * 1024 * 1024 });
  const data = JSON.parse(response.stdout);
  if (data.encoding !== 'base64' || !data.content) throw new Error(`No sample data for ${file}.`);
  await writeFile(path, Buffer.from(data.content, 'base64'));
  console.log(file);
}
