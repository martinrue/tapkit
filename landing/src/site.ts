import { mountInstrument } from './renderer/instrument';
import { defaultSettings, instruments, instrumentIds, themes, themeIds, voicesFor, instrumentArtwork, type AppState, type InstrumentId, type ThemeId, type TapkitBridge } from './shared/model';

declare global {
  interface Window { TAPKIT_RELEASE?: { url: string; version: string; platform: string; unsigned?: boolean } }
}

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const picker = $('.instrument-picker');
const panel = $('.demo-panel');
const stage = $('.demo-stage');
const fit = $('.demo-fit');
const loading = $('.demo-loading');
const guide = $('.key-guide');
const help = $('.playing-help');
const rangeControl = $('.range-control');
const register = $<HTMLSelectElement>('.range-control select');
const volume = $<HTMLInputElement>('.volume-control input');
const descriptions: Record<InstrumentId, string> = {
  djembe: 'Warm bass, crisp rim slaps. A pocket-sized groove.',
  piano: 'Twenty-five keys, and a melody waiting to happen.',
  handpan: 'Nine ringing notes. Find a little breathing room.',
  tambourine: 'A short shake, a long shimmer, a little accent.',
  trumpet: 'A little brass for your next big entrance.',
  guitar: 'Pick a melody, strum a chord, tap a wooden beat.',
  violin: 'A smooth bow and a little room for feeling.',
  drums: 'Kick, snare, hats, toms. Your desk just became a kit.',
  sampler: 'Twenty-five drops, vocal chops, stabs, and surprises.',
  marimba: 'Warm wooden notes with a lovely little bounce.',
};

let current: InstrumentId = 'djembe';
let theme: ThemeId = 'classic';
let mounted: ReturnType<typeof mountInstrument> | undefined;
let host: HTMLElement | undefined;
let ready = false;
let selectionRequest = 0;
const pulseTimers = new Map<string, ReturnType<typeof setTimeout>>();
const state: AppState = { settings: defaultSettings(), activeInstrument: current, playing: false, status: '' };
for (const id of instrumentIds) state.settings.instruments[id].volume = Number(volume.value) / 100;

const bridge: TapkitBridge = {
  getState: async () => state,
  ready: async () => {}, failed: () => {}, visibility: () => {},
  onState: () => () => {}, onHit: () => () => {}, onToggleLoop: () => () => {},
  hide: () => {}, toggle: () => {}, openSettings: () => {}, closeSettings: () => {},
  saveSettings: async () => ({ ok: true }), setLoop: async () => ({ ok: true }),
  setTheme: chooseTheme, setVolume: () => {},
  setRange(id, range) { state.settings.instruments[id].range = range; renderKeys(); },
  pointerInteractive: () => {}, drag: () => {}, resize: () => {}, reportTiming: () => {},
};

function removeTabStops(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('a, button, input, select, textarea, summary, [tabindex]').forEach(element => { element.tabIndex = -1; });
}

function thumbnail(id: InstrumentId) { return `./assets/art/${id === 'piano' ? `${theme}-piano-thumb.svg` : instrumentArtwork(id, theme, true)}`; }
for (const [index, id] of instrumentIds.entries()) {
  const button = document.createElement('button');
  button.className = 'instrument-option'; button.dataset.instrument = id; button.type = 'button';
  button.setAttribute('aria-pressed', String(id === current));
  button.innerHTML = `<span class="option-index">${String(index + 1).padStart(2, '0')}</span><img src="${thumbnail(id)}" alt="" width="156" height="108" loading="lazy"><span class="option-name">${instruments[id].name}</span>`;
  button.addEventListener('click', () => { void chooseInstrument(id); });
  picker.append(button);
}
for (const id of themeIds) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'theme-option'; button.dataset.theme = id;
  button.setAttribute('aria-label', `${themes[id].name} style`); button.title = themes[id].name;
  button.setAttribute('aria-pressed', String(id === theme));
  button.addEventListener('click', () => chooseTheme(id));
  $('.theme-picker').append(button);
}

function fitInstrument() {
  if (!mounted || !host) return;
  const frame = mounted.previewFrame();
  const scale = Math.max(.01, Math.min((stage.clientWidth - 12) / frame.width, (stage.clientHeight - 12) / frame.height));
  Object.assign(fit.style, {
    width: `${frame.width}px`, height: `${frame.height}px`, transform: `scale(${scale})`,
    left: `${(stage.clientWidth - frame.width * scale) / 2}px`, top: `${(stage.clientHeight - frame.height * scale) / 2}px`,
  });
  Object.assign(host.style, { left: `${-frame.left}px`, top: `${-frame.top}px` });
}
new ResizeObserver(fitInstrument).observe(stage);

async function chooseInstrument(id: InstrumentId) {
  const request = ++selectionRequest;
  mounted?.destroy(); mounted = undefined;
  for (const timer of pulseTimers.values()) clearTimeout(timer);
  pulseTimers.clear();
  current = id; state.activeInstrument = id; state.playing = false; ready = false;
  stage.setAttribute('aria-busy', 'true'); fit.style.visibility = 'hidden';
  stage.setAttribute('aria-label', `${instruments[id].name} playable instrument. Use your keyboard or tap a key below.`);
  help.textContent = 'Use your keyboard, or tap a key below.';
  loading.hidden = false; loading.textContent = 'Setting the stage…';
  $('.demo-name').textContent = instruments[id].name;
  $('.demo-description').textContent = descriptions[id];
  $('.demo-count').textContent = `${String(instrumentIds.indexOf(id) + 1).padStart(2, '0')} / 10`;
  picker.querySelectorAll<HTMLElement>('[data-instrument]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.instrument === id)));
  renderKeys();
  const nextHost = document.createElement('div'); nextHost.className = 'demo-host';
  fit.replaceChildren(nextHost); host = nextHost;
  try {
    const next = mountInstrument(nextHost, id, state, bridge, true, fitInstrument);
    mounted = next;
    removeTabStops(nextHost);
    await next.ready;
    if (request !== selectionRequest) return;
    ready = true; state.playing = true;
    next.update(state); fitInstrument(); fit.style.visibility = 'visible';
    loading.hidden = true; stage.setAttribute('aria-busy', 'false');
  } catch (error) {
    if (request !== selectionRequest) return;
    state.playing = false; ready = false;
    mounted?.destroy(); mounted = undefined;
    loading.hidden = false; loading.textContent = 'This instrument couldn’t load. Check your connection and choose it again to retry.';
    help.textContent = error instanceof Error ? error.message : 'Unable to prepare the demo.';
  }
}

function chooseTheme(id: ThemeId) {
  theme = id; panel.dataset.theme = id;
  for (const instrument of instrumentIds) state.settings.instruments[instrument].theme = id;
  $('.theme-name').textContent = themes[id].name;
  document.querySelectorAll<HTMLElement>('.theme-option').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.theme === id)));
  picker.querySelectorAll<HTMLImageElement>('img').forEach(image => { image.src = thumbnail(image.closest<HTMLElement>('[data-instrument]')!.dataset.instrument as InstrumentId); });
  mounted?.update(state);
}

async function playVoice(voiceId: string) {
  if (!ready || !mounted) return;
  const request = selectionRequest, instrument = mounted;
  try {
    // The first strike itself unlocks browser audio; no separate sound mode.
    await instrument.unlock();
    if (request !== selectionRequest || instrument !== mounted || !ready) return;
  } catch {
    help.textContent = 'Sound couldn’t start. Press a key or tap a note to try again.';
    return;
  }
  instrument.play({ voiceId, sentAt: performance.timeOrigin + performance.now() });
  const key = guide.querySelector<HTMLElement>(`[data-voice="${voiceId}"]`);
  if (key) {
    clearTimeout(pulseTimers.get(voiceId)); key.classList.add('pressed');
    pulseTimers.set(voiceId, setTimeout(() => { key.classList.remove('pressed'); pulseTimers.delete(voiceId); }, 150));
  }
}

function renderKeys() {
  guide.replaceChildren();
  guide.classList.toggle('melodic', Boolean(instruments[current].ranges));
  const item = state.settings.instruments[current];
  for (const voice of voicesFor(current, item.range)) {
    const button = document.createElement('button'); button.type = 'button'; button.tabIndex = -1;
    button.className = `guide-key${voice.black ? ' sharp' : ''}${voice.chord || voice.surface === 'body' ? ' extra' : ''}`;
    button.dataset.voice = voice.id; button.setAttribute('aria-label', `${voice.label}, key ${item.keys[voice.id]}`);
    const kbd = document.createElement('kbd'); kbd.textContent = item.keys[voice.id];
    const label = document.createElement('span'); label.textContent = voice.label;
    button.append(kbd, label);
    button.addEventListener('click', () => { void playVoice(voice.id); });
    guide.append(button);
  }
  const ranges = instruments[current].ranges;
  rangeControl.hidden = !ranges;
  register.replaceChildren();
  ranges?.forEach((range, index) => register.add(new Option(range.label, String(index))));
  if (ranges) register.value = String(item.range ?? instruments[current].defaultRange);
}

volume.addEventListener('input', () => {
  for (const id of instrumentIds) state.settings.instruments[id].volume = Number(volume.value) / 100;
  mounted?.update(state);
});
register.addEventListener('change', () => {
  state.settings.instruments[current].range = Number(register.value);
  mounted?.update(state); renderKeys();
});

stage.addEventListener('pointerdown', event => {
  if (event.button !== 0 || !ready) return;
  const target = event.target as Element;
  const hit = target.closest<HTMLElement>('[data-voice]');
  let voiceId = hit?.dataset.voice;
  if (!voiceId && target.closest('.instrument-body') && !['piano', 'sampler', 'marimba'].includes(current)) {
    const voices = voicesFor(current, state.settings.instruments[current].range);
    const rect = host!.getBoundingClientRect(), definition = instruments[current];
    const scale = rect.width / definition.width;
    const x = (event.clientX - rect.left) / scale / definition.width;
    const y = (event.clientY - rect.top) / scale / definition.height;
    if (current === 'djembe') voiceId = x < .32 ? 'left-rim' : x < .47 ? 'left-bass' : x < .53 ? 'center-bass' : x < .68 ? 'right-bass' : 'right-rim';
    else if (current === 'guitar') voiceId = 'chord-2';
    else voiceId = [...voices].sort((a, b) => (a.x - x) ** 2 + ((a.y ?? .4) - y) ** 2 - (b.x - x) ** 2 - ((b.y ?? .4) - y) ** 2)[0].id;
  }
  event.preventDefault();
  if (voiceId) { event.stopImmediatePropagation(); void playVoice(voiceId); }
}, true);

document.addEventListener('keydown', event => {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || document.hidden) return;
  if ((event.target as Element).closest('input:not([type=range]), textarea, [contenteditable]:not([contenteditable=false])')) return;
  if (event.repeat) return;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    const index = (instrumentIds.indexOf(current) + (event.key === 'ArrowLeft' ? -1 : 1) + instrumentIds.length) % instrumentIds.length;
    void chooseInstrument(instrumentIds[index]); return;
  }
  if (!ready) return;
  const binding = Object.entries(state.settings.instruments[current].keys).find(([, key]) => key === event.key.toUpperCase());
  if (!binding) return;
  event.preventDefault(); void playVoice(binding[0]);
});

document.querySelectorAll<HTMLElement>('[data-try]').forEach(button => button.addEventListener('click', async () => {
  if (button.dataset.style) chooseTheme(button.dataset.style as ThemeId);
  const id = button.dataset.try as InstrumentId;
  if (current !== id || !ready) void chooseInstrument(id);
  $('#playground').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  // Selecting a look stays silent; the first strike unlocks sound.
}));

const release = window.TAPKIT_RELEASE;
if (release) {
  document.querySelectorAll<HTMLAnchorElement>('.release-download').forEach(link => {
    link.href = release.url;
    if (/^https?:/.test(release.url)) link.removeAttribute('download');
  });
  $('.release-meta').textContent = `Version ${release.version} · ${release.platform}`;
  $('#unsigned-installation').hidden = release.unsigned === false;
}

removeTabStops();
void chooseInstrument(current);
