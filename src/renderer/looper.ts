import { instruments, themes, voicesFor, type InstrumentId, type SaveResult, type VoiceDefinition } from '../shared/model';
import { LoopCapture, maxLoopSeconds, maxLoopEvents, type LoopClip } from '../shared/loops';
import type { InstrumentAudio } from './audio';

/** One saved performance; the audio device repeats a rendered buffer without timer drift. */
export function createLooper(id: InstrumentId, audio: InstrumentAudio, prepared: () => boolean,
  save: (clip: LoopClip | null) => Promise<SaveResult>, contact: (voice: VoiceDefinition) => void) {
  let clip: LoopClip | null = null, buffer: AudioBuffer | null = null, signature = '', generation = 0;
  let capture: LoopCapture | null = null, enabled = false, rendering = false, saving = false, destroyed = false;
  let offset = 0, previousVisual = 0, frame = 0, limitTimer: ReturnType<typeof setTimeout> | undefined;
  let error = '';
  const root = document.createElement('section'); root.className = 'loop-panel interactive'; root.setAttribute('aria-label', 'Loop recorder');
  root.innerHTML = `<div class="loop-actions">
    <button data-loop="record" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><circle class="record-icon" cx="12" cy="12" r="6"/><rect class="stop-icon" x="6" y="6" width="12" height="12" rx="2"/></svg><span class="loop-label">Record</span></button>
    <button data-loop="play" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path class="play-icon" d="m8 5 11 7-11 7z"/><path class="pause-icon" d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg><span class="loop-label">Play</span></button>
    <button data-loop="reset" type="button" title="Reset loop" aria-label="Reset loop"><svg viewBox="0 0 24 24" aria-hidden="true"><path class="reset-icon" d="M5 9a7 7 0 1 1 0 6M5 4v5h5"/></svg><span class="loop-label">Reset</span></button>
    <output class="loop-time">10 s max</output></div>
    <div class="loop-timeline" role="img" aria-label="Empty loop timeline"><div class="loop-markers"></div><span class="loop-playhead"></span></div><p class="loop-status" role="status"></p>`;
  const record = root.querySelector<HTMLButtonElement>('[data-loop=record]')!, play = root.querySelector<HTMLButtonElement>('[data-loop=play]')!, reset = root.querySelector<HTMLButtonElement>('[data-loop=reset]')!;
  const timeline = root.querySelector<HTMLElement>('.loop-timeline')!, markers = root.querySelector<HTMLElement>('.loop-markers')!, head = root.querySelector<HTMLElement>('.loop-playhead')!;
  const status = root.querySelector<HTMLElement>('.loop-status')!, time = root.querySelector<HTMLOutputElement>('.loop-time')!;
  function elapsed() { return capture?.startedAt === null ? 0 : capture ? Math.min(maxLoopSeconds, audio.context.currentTime - capture.startedAt!) : audio.loopPlaying ? Math.max(0, audio.loopElapsed(true)) % clip!.duration : offset; }
  const seconds = (value: number) => value.toFixed(1).replace(/\.0$/, '');
  function pause() { if (audio.loopPlaying) offset = audio.pauseLoop(); }
  function drawMarkers() {
    markers.replaceChildren();
    const events = capture?.events ?? clip?.events ?? [], duration = capture ? maxLoopSeconds : clip?.duration ?? maxLoopSeconds;
    timeline.style.setProperty('--loop-step', `${100 / duration}%`);
    for (const event of events) {
      const marker = document.createElement('span'), voice = voicesFor(id, event.range).find(voice => voice.id === event.voiceId)!;
      marker.className = 'loop-note'; marker.style.left = `${event.at / duration * 100}%`;
      marker.style.top = `${3 + instruments[id].voices.findIndex(voice => voice.id === event.voiceId) % 4 * 4}px`;
      marker.title = `${voice.label} · ${event.at.toFixed(2)} s`; markers.append(marker);
    }
    timeline.setAttribute('aria-label', `${events.length} notes in ${duration.toFixed(2)} seconds`);
  }
  function updateUI() {
    for (const [button, label] of [[record, capture ? 'Stop recording' : 'Record'], [play, audio.loopPlaying ? 'Pause' : 'Play']] as const) {
      button.querySelector('.loop-label')!.textContent = label;
      button.setAttribute('aria-label', label); button.title = label;
    }
    record.disabled = !enabled || rendering || saving; play.disabled = !enabled || !buffer || Boolean(capture) || rendering || saving;
    reset.disabled = saving || (!clip && !capture && !rendering);
    root.classList.toggle('recording', Boolean(capture)); root.classList.toggle('loop-playing', audio.loopPlaying);
    root.classList.toggle('loop-error', Boolean(error));
    status.textContent = error || (rendering ? 'Preparing…' : saving ? 'Saving…' : capture ? capture.startedAt === null ? 'Play your first note.' : `Recording · ${capture.events.length} hits` : '');
    status.title = error;
  }
  async function prepare() {
    const request = ++generation; buffer = null; pause(); offset = 0;
    if (!clip || !prepared()) { updateUI(); return; }
    rendering = true; updateUI();
    try { const rendered = await audio.renderLoop(id, clip); if (!destroyed && request === generation) buffer = rendered; }
    catch (e) { if (!destroyed && request === generation) error = `Loop: ${(e as Error).message}`; }
    finally { if (!destroyed && request === generation) { rendering = false; updateUI(); } }
  }
  async function commit(next: LoopClip | null) {
    const previous = clip; pause(); error = ''; clip = next; signature = JSON.stringify(next); saving = true;
    drawMarkers(); updateUI();
    try {
      const result = await save(next);
      if (!result.ok) throw new Error(result.error);
    } catch (e) { clip = previous; signature = JSON.stringify(previous); error = (e as Error).message; }
    finally { saving = false; if (!destroyed) { drawMarkers(); void prepare(); } }
  }
  function finish(at = audio.context.currentTime) {
    if (!capture) return;
    clearTimeout(limitTimer);
    const next = capture.finish(at); capture = null;
    if (next) void commit(next); else { drawMarkers(); updateUI(); }
  }
  record.addEventListener('click', () => {
    if (capture) { finish(); return; }
    pause(); offset = 0; error = ''; capture = new LoopCapture(); drawMarkers(); updateUI();
  });
  play.addEventListener('click', () => {
    if (audio.loopPlaying) pause();
    else if (buffer && enabled && audio.playLoop(buffer, offset)) previousVisual = offset - .000001;
    updateUI();
  });
  reset.addEventListener('click', () => {
    clearTimeout(limitTimer); capture = null; generation++; rendering = false; buffer = null; pause(); offset = 0;
    void commit(null);
  });
  function tick() {
    if (destroyed) return;
    const position = elapsed(), duration = capture ? maxLoopSeconds : clip?.duration ?? maxLoopSeconds;
    head.style.left = `${position / duration * 100}%`;
    time.value = capture || audio.loopPlaying || offset > 0 ? `${position.toFixed(1)} / ${seconds(duration)} s` : clip ? `${seconds(duration)} s loop` : `${maxLoopSeconds} s max`;
    time.title = !capture && clip ? `Loops every ${seconds(clip.duration)} seconds` : `Record up to ${maxLoopSeconds} seconds`;
    if (audio.loopPlaying && clip) {
      const now = audio.loopElapsed(true);
      if (now >= previousVisual) {
        for (let cycle = Math.max(Math.floor(previousVisual / clip.duration), Math.floor(now / clip.duration) - 1); cycle <= Math.floor(now / clip.duration); cycle++) for (const event of clip.events) {
          const at = cycle * clip.duration + event.at;
          if (at > previousVisual && at <= now) contact(voicesFor(id, event.range).find(voice => voice.id === event.voiceId)!);
        }
        previousVisual = now;
      }
    }
    frame = requestAnimationFrame(tick);
  }
  tick(); updateUI();
  return {
    element: root,
    update(saved: LoopClip | undefined, canPlay: boolean, theme: keyof typeof themes) {
      enabled = canPlay; root.dataset.theme = theme; root.style.setProperty('--loop-accent', themes[theme].accent);
      if (!enabled) { if (capture) finish(); pause(); }
      if (!saving && !capture && prepared() && JSON.stringify(saved ?? null) !== signature) {
        signature = JSON.stringify(saved ?? null); clip = saved ?? null; error = ''; drawMarkers(); void prepare();
      }
      updateUI();
    },
    capture(voiceId: string, range?: number) {
      if (!capture || !enabled) return;
      const first = capture.startedAt === null; capture.add(voiceId, audio.context.currentTime, range);
      if (first) {
        const recording = capture;
        limitTimer = setTimeout(() => { if (capture === recording) finish(recording.startedAt! + maxLoopSeconds); }, maxLoopSeconds * 1000);
      }
      drawMarkers(); updateUI();
      if (capture.events.length >= maxLoopEvents) finish();
    },
    destroy() { clearTimeout(limitTimer); if (capture) finish(); destroyed = true; generation++; cancelAnimationFrame(frame); pause(); root.remove(); },
  };
}
