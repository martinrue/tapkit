import { InstrumentAudio, maxAudioVoices } from '../src/renderer/audio';
import { instrumentIds, instruments, type InstrumentId } from '../src/shared/model';

const sampleRate = 44100;
const LiveAudioContext = window.AudioContext;
interface Tap { id: string; at: number }
interface Hit { id: string; at: number; stopped?: number; fadeAt?: number }
function check(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }

/** Production audio engine, real decoded samples and real Web Audio mixing, with a deterministic clock. */
async function render(id: InstrumentId, taps: Tap[], disableAt?: number) {
  const context = new OfflineAudioContext(1, sampleRate * 5, sampleRate);
  let now = 0, currentId = 'warmup';
  const hits: Hit[] = [];
  Object.defineProperties(context, { currentTime: { get: () => now }, state: { get: () => 'running' } });
  Object.assign(context, { resume: async () => {}, getOutputTimestamp: () => ({ contextTime: 0, performanceTime: 0 }) });
  const create = context.createBufferSource.bind(context);
  context.createBufferSource = () => {
    const source = create(), start = source.start.bind(source), stop = source.stop.bind(source), connect = source.connect.bind(source);
    const hit: Hit = { id: currentId, at: 0 };
    source.start = (at = 0) => { hit.at = at; hits.push(hit); start(at); };
    source.stop = (at = now) => { hit.stopped = at; stop(at); };
    source.connect = ((destination: AudioNode) => {
      const gain = destination as GainNode;
      if (gain.gain) {
        const fade = gain.gain.setTargetAtTime.bind(gain.gain);
        gain.gain.setTargetAtTime = (value, at, constant) => { if (value === 0) hit.fadeAt = at; return fade(value, at, constant); };
      }
      return connect(destination);
    }) as typeof source.connect;
    return source;
  };
  // A fresh context per render, so tests cannot share sources or instrument state.
  Object.defineProperty(window, 'AudioContext', { configurable: true, value: function() { return context; } });
  const audio = new InstrumentAudio();
  await audio.load(instruments[id]);
  audio.setEnabled(true);
  for (const tap of taps) {
    now = tap.at; currentId = tap.id;
    const voice = instruments[id].voices.find(voice => voice.id === tap.id);
    check(voice, `Unknown ${id} voice ${tap.id}`);
    check(audio.play(voice), `${id}/${tap.id} must start`);
  }
  if (disableAt !== undefined) { now = disableAt; audio.setEnabled(false); }
  const buffer = await context.startRendering();
  // Return PCM for comparison before hiding the engine's output on teardown.
  return { pcm: buffer.getChannelData(0), hits: hits.filter(hit => hit.id !== 'warmup') };
}

async function additive(id: InstrumentId, first: string, second: string) {
  const a = await render(id, [{ id: first, at: 0 }]);
  const b = await render(id, [{ id: second, at: .15 }]);
  const both = await render(id, [{ id: first, at: 0 }, { id: second, at: .15 }]);
  check(both.hits.every(hit => hit.stopped === undefined && hit.fadeAt === undefined), `${id}: ${first} + ${second} must not stop or fade earlier hits`);
  let maxError = 0, tailEnergy = 0;
  for (let i = Math.round(.15 * sampleRate); i < both.pcm.length; i++) {
    maxError = Math.max(maxError, Math.abs(both.pcm[i] - a.pcm[i] - b.pcm[i]));
    tailEnergy += a.pcm[i] ** 2;
  }
  check(maxError < 1e-6, `${id}: overlapping output must equal both complete waveforms (${maxError})`);
  check(tailEnergy > 1e-5, `${id}: earlier note must have an audible tail to test`);
  return { id, first, second, maxError };
}

Object.assign(window, { runAudioCheck: async () => {
  const overlaps = [];
  for (const id of instrumentIds.filter(id => !instruments[id].monophonic)) {
    const voices = instruments[id].voices;
    overlaps.push(await additive(id, voices[0].id, voices.at(-1)!.id));
    overlaps.push(await additive(id, voices[0].id, voices[0].id));
  }
  for (const pair of [
    ['crash', 'snare-right'], ['crash', 'kick'], ['ride', 'snare-left'], ['snare-left', 'snare-right'],
    ['tom-high', 'tom-floor'], ['hat-open', 'snare-right'], ['hat-open', 'kick'],
    ['hat-open', 'hat-open'], ['hat-closed', 'hat-open'],
  ]) overlaps.push(await additive('drums', pair[0], pair[1]));
  for (const chord of instruments.guitar.voices.filter(voice => voice.chord)) overlaps.push(await additive('guitar', chord.id, 'melody-0'));
  for (const first of ['body-tap', 'chord-0']) overlaps.push(await additive('guitar', first, 'body-tap'));
  const bodyTap = await render('guitar', [{ id: 'body-tap', at: 0 }]);
  let tapEnergy = 0, tapPeak = 0;
  for (const value of bodyTap.pcm.subarray(0, Math.round(sampleRate * .48))) { tapEnergy += value * value; tapPeak = Math.max(tapPeak, Math.abs(value)); }
  check(Math.sqrt(tapEnergy / Math.round(sampleRate * .48)) > .085, 'guitar body tap has audible impact density at the engine output');
  check(tapPeak < .6, 'a single louder body tap retains peak headroom');
  for (const [first, second] of [['pad-clave', 'pad-rim'], ['pad-clave', 'pad-clave'], ['pad-bell', 'pad-chime']]) overlaps.push(await additive('sampler', first, second));
  for (const second of ['center-bass', 'left-rim']) overlaps.push(await additive('djembe', 'center-bass', second));

  const hat = await render('drums', [
    { id: 'crash', at: 0 }, { id: 'hat-open', at: .05 }, { id: 'hat-open', at: .10 },
    { id: 'snare-right', at: .15 }, { id: 'hat-closed', at: .20 },
  ]);
  const choked = hat.hits.filter(hit => hit.stopped !== undefined);
  check(choked.length === 2 && choked.every(hit => hit.id === 'hat-open' && Math.abs(hit.stopped! - .225) < 1e-6 && hit.fadeAt === .2), 'Only closing the hi-hat chokes its two open tails; crash and snare keep ringing');

  const solo = [];
  for (const id of ['trumpet', 'violin'] as const) {
    for (const second of ['melody-0', 'melody-12']) {
      const result = await render(id, [{ id: 'melody-0', at: 0 }, { id: second, at: .15 }]);
      const crossfade = (instruments[id].crossfadeMs ?? 25) / 1000;
      check(result.hits.length === 2 && Math.abs(result.hits[0].stopped! - (.15 + crossfade)) < 1e-6 && result.hits[1].stopped === undefined, `${id}: preserve intentional solo-note transition`);
      solo.push({ id, second, crossfadeMs: crossfade * 1000 });
    }
  }

  const dense = [];
  for (const id of ['piano', 'guitar', 'drums'] as const) {
    const voice = instruments[id].voices.find(voice => id === 'guitar' ? voice.chord === 'C' : id === 'drums' ? voice.id === 'crash' : voice.id === 'note-0')!;
    const result = await render(id, Array.from({ length: id === 'guitar' ? 12 : 64 }, (_, i) => ({ id: voice.id, at: i * .002 })));
    check(result.hits.length > 32 && result.hits.length <= maxAudioVoices && result.hits.every(hit => hit.stopped === undefined), `${id}: dense playing exceeding the old 32-source cap must retain every tail`);
    dense.push({ id, sources: result.hits.length });
  }
  const limit = await render('drums', Array.from({ length: maxAudioVoices + 2 }, (_, i) => ({ id: 'crash', at: i * .001 })));
  const stolen = limit.hits.filter(hit => hit.stopped !== undefined);
  check(stolen.length === 2 && stolen.every((hit, i) => hit === limit.hits[i] && Math.abs(hit.stopped! - (maxAudioVoices + i) * .001 - .01) < 1e-6 && hit.fadeAt === (maxAudioVoices + i) * .001), 'At the safety cap, only the oldest sources fade over 10 ms');
  const disabled = await render('drums', [{ id: 'crash', at: 0 }, { id: 'hat-open', at: .1 }], .2);
  check(disabled.hits.every(hit => Math.abs(hit.stopped! - .24) < 1e-6), 'Hiding or pausing must still stop ringing sounds');
  const loops = [];
  Object.defineProperty(window, 'AudioContext', { configurable: true, value: LiveAudioContext });
  for (const id of ['sampler', 'trumpet', 'piano', 'guitar', 'marimba'] as const) {
    const audio = new InstrumentAudio(); await audio.load(instruments[id]); audio.setEnabled(true);
    const first = instruments[id].voices[0], last = instruments[id].voices.at(-1)!;
    const range = instruments[id].defaultRange;
    const buffer = await audio.renderLoop(id, { duration: .4, events: [{ at: 0, voiceId: first.id, range }, { at: .2, voiceId: last.id, range }] });
    check(buffer.numberOfChannels === 2 && Math.abs(buffer.duration - .4) < 1 / audio.context.sampleRate, 'loop has exact stereo period');
    let peak = 0, energy = 0;
    for (const value of buffer.getChannelData(0)) { peak = Math.max(peak, Math.abs(value)); energy += value * value; }
    check(peak > .01 && peak <= .80001 && energy > 1, 'composite contains sound and bounded headroom');
    const create = audio.context.createBufferSource.bind(audio.context), sources: { node: AudioBufferSourceNode; stopped: boolean }[] = [];
    audio.context.createBufferSource = () => {
      const node = create(), stop = node.stop.bind(node), item = { node, stopped: false };
      node.stop = when => { item.stopped = true; stop(when); }; sources.push(item); return node;
    };
    check(audio.playLoop(buffer), 'loop starts');
    audio.play(first); audio.play(last);
    check(sources[0].node.loop && !sources[0].stopped, 'live voices, including solo transitions, never stop the loop buffer');
    await new Promise(resolve => setTimeout(resolve, 45));
    const offset = audio.pauseLoop(); check(offset > 0 && offset < .4 && !audio.loopPlaying, 'pause retains phase');
    check(audio.playLoop(buffer, offset), 'resume succeeds');
    check(Math.abs(audio.loopElapsed() - offset) < .02, 'resume starts from the paused phase');
    audio.setEnabled(false); check(!audio.loopPlaying, 'hide/pause silences loop playback');
    audio.dispose(); loops.push({ id, seconds: buffer.duration, channels: buffer.numberOfChannels, peak });
  }
  return { instruments: instrumentIds.length, overlaps, loops, hiHat: 'only closed hat chokes', solo, dense, voiceLimit: maxAudioVoices, safetyFadeMs: 10, pauseStopsTails: true };
} });
