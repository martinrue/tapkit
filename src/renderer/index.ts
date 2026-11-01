import { instrumentIds, type InstrumentId } from '../shared/model';
import { mountInstrument } from './instrument';
import { renderSettings } from './settings';

const root = document.querySelector<HTMLElement>('#app')!;
const params = new URLSearchParams(location.search);
async function start() {
  const initial = await window.tapkit.getState();
  if (params.get('view') === 'settings') { renderSettings(root, initial); return; }
  const id = params.get('instrument') as InstrumentId;
  if (!instrumentIds.includes(id)) throw new Error('Unknown instrument.');
  await mountInstrument(root, id, initial, window.tapkit).ready;
}
void start().catch(error => {
  console.error(error);
  const errorLabel = root.querySelector('.instrument-error');
  if (errorLabel) errorLabel.textContent = `Tapkit could not start: ${(error as Error).message}`;
  else { document.body.className = 'startup-error'; root.textContent = `Tapkit could not start: ${(error as Error).message}. Open Settings from the menubar to retry.`; }
  window.tapkit.failed((error as Error).message);
});
