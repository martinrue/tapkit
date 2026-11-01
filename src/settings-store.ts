import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { defaultSettings, type Settings } from './shared/model';
import { validateSettings } from './shared/settings';

export class SettingsStore {
  private queue: Promise<void> = Promise.resolve();
  constructor(readonly path: string) {}
  async load(): Promise<{ settings: Settings; warning?: string }> {
    try { return { settings: validateSettings(JSON.parse(await readFile(this.path, 'utf8'))) }; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { settings: defaultSettings() };
      return { settings: defaultSettings(), warning: 'Saved settings could not be read. Defaults are in use; the original file is retained until you save.' };
    }
  }
  save(settings: Settings): Promise<void> {
    const contents = JSON.stringify(validateSettings(settings), null, 2) + '\n';
    const next = this.queue.catch(() => {}).then(async () => {
      await mkdir(dirname(this.path), { recursive: true });
      await writeFile(this.path + '.tmp', contents, { mode: 0o600 });
      await rename(this.path + '.tmp', this.path);
    });
    this.queue = next;
    return next;
  }
}
