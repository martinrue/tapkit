import { instruments, voicesFor, type InstrumentDefinition, type InstrumentId, type VoiceDefinition } from '../shared/model';
import type { LoopClip } from '../shared/loops';
import { VoiceMixer } from './audio-voices';
export { maxAudioVoices } from './audio-voices';
import { sampleBounds } from '../shared/audio-samples';


/** All decoding happens before ready(). The hit path only creates audio nodes. */
export class InstrumentAudio {
  // An explicit 1 ms target can select a smaller hardware-supported buffer than "interactive".
  readonly context = new AudioContext({ latencyHint: 0.001 });
  private output = this.context.createGain();
  private buffers = new Map<string, AudioBuffer>();
  private mixer!: VoiceMixer;
  private loopSource: AudioBufferSourceNode | null = null;
  private loopGain: GainNode | null = null;
  private loopStart = 0;
  private loopOffset = 0;
  private loopDuration = 0;
  private volume = 0.6;
  private enabled = false;
  private disposed = false;

  constructor() { this.output.connect(this.context.destination); this.output.gain.value = 0; }
  async load(definition: InstrumentDefinition) {
    this.mixer = new VoiceMixer(this.context, this.output, this.buffers, Boolean(definition.monophonic), (definition.crossfadeMs ?? 25) / 1000);
    const files = definition.samples ?? definition.voices.flatMap(voice => voice.layers?.map(layer => layer.sample) ?? [voice.sample]);
    await Promise.all([...new Set(files)].map(async file => {
      const response = await fetch(new URL(`../assets/audio/${file}`, location.href));
      if (!response.ok) throw new Error(`Could not load ${file}.`);
      const bytes = await response.arrayBuffer();
      if (this.disposed) return;
      const decoded = await this.context.decodeAudioData(bytes);
      if (this.disposed) return;
      const channels = Array.from({ length: decoded.numberOfChannels }, (_, channel) => decoded.getChannelData(channel));
      const { start, length, peak } = sampleBounds(channels, decoded.sampleRate, !definition.preserveSampleEnvelope);
      const buffer = this.context.createBuffer(decoded.numberOfChannels, length, decoded.sampleRate);
      for (let c = 0; c < decoded.numberOfChannels; c++) {
        const source = decoded.getChannelData(c);
        const target = buffer.getChannelData(c);
        for (let i = 0; i < length; i++) {
          const fade = definition.preserveSampleEnvelope ? 1 : Math.min(1, i / (decoded.sampleRate * 0.0002), (length - i) / (decoded.sampleRate * 0.025));
          target[i] = source[start + i] * (0.9 / peak) * fade;
        }
      }
      this.buffers.set(file, buffer);
    }));
    if (this.disposed) return;
    await this.context.resume();
    if (this.disposed) return;
    // Start the output stream before the first real hit.
    const warmup = this.context.createBufferSource();
    warmup.buffer = this.context.createBuffer(1, 1, this.context.sampleRate);
    warmup.connect(this.output); warmup.start();
  }
  setVolume(volume: number) {
    if (this.disposed) return;
    this.volume = volume;
    this.output.gain.setTargetAtTime(this.enabled ? volume : 0, this.context.currentTime, 0.008);
  }
  setEnabled(enabled: boolean) {
    if (this.disposed) return;
    this.enabled = enabled;
    this.setVolume(this.volume);
    if (enabled && this.context.state !== 'running') void this.context.resume().catch(() => {});
    if (!enabled) { this.mixer?.stop(this.context.currentTime + .04); this.pauseLoop(); }
  }
  dispose() {
    this.disposed = true;
    this.enabled = false;
    this.pauseLoop(); this.mixer?.dispose(); this.buffers.clear();
    this.output.disconnect();
    void this.context.close().catch(() => {});
  }
  play(voice: VoiceDefinition): { onset: number; schedulingMs: number } | null {
    if (!this.enabled || this.context.state !== 'running') return null;
    const started = performance.now();
    const audioTime = this.context.currentTime;
    if (!this.mixer.play(voice, audioTime)) return null;
    const stamp = this.context.getOutputTimestamp();
    const estimated = stamp.contextTime && stamp.performanceTime
      ? stamp.performanceTime + (audioTime - stamp.contextTime) * 1000
      : performance.now() + (this.context.baseLatency + (this.context.outputLatency || 0)) * 1000;
    return { onset: Math.max(performance.now(), estimated), schedulingMs: performance.now() - started };
  }
  get loopPlaying() { return this.loopSource !== null; }
  loopElapsed(audible = false) {
    const stamp = audible ? this.context.getOutputTimestamp() : null;
    const time = stamp?.contextTime || (this.context.currentTime - (audible ? this.context.baseLatency + (this.context.outputLatency || 0) : 0));
    return this.loopSource ? time - this.loopStart + this.loopOffset : this.loopOffset;
  }
  playLoop(buffer: AudioBuffer, offset = 0) {
    if (!this.enabled || this.disposed) return false;
    this.pauseLoop();
    const source = this.context.createBufferSource(), gain = this.context.createGain();
    source.buffer = buffer; source.loop = true; source.connect(gain); gain.connect(this.output);
    this.loopDuration = buffer.duration; this.loopOffset = offset % buffer.duration; this.loopStart = this.context.currentTime;
    gain.gain.setValueAtTime(0, this.loopStart); gain.gain.linearRampToValueAtTime(1, this.loopStart + .006);
    source.start(this.loopStart, this.loopOffset); this.loopSource = source; this.loopGain = gain;
    source.onended = () => { source.disconnect(); gain.disconnect(); };
    return true;
  }
  pauseLoop() {
    if (this.loopSource) {
      this.loopOffset = Math.max(0, this.loopElapsed()) % this.loopDuration;
      this.loopGain!.gain.setTargetAtTime(0, this.context.currentTime, .003);
      try { this.loopSource.stop(this.context.currentTime + .02); } catch {}
      this.loopSource = null; this.loopGain = null;
    }
    return this.loopOffset;
  }
  async renderLoop(id: InstrumentId, clip: LoopClip): Promise<AudioBuffer> {
    const events = clip.events.map(event => ({ at: event.at, voice: voicesFor(id, event.range).find(voice => voice.id === event.voiceId)! }));
    let tail = 0;
    for (const { voice } of events) for (const layer of voice.layers ?? [{ sample: voice.sample, semitones: voice.semitones }]) {
      tail = Math.max(tail, this.buffers.get(layer.sample)!.duration / 2 ** (layer.semitones / 12) + (layer.delay ?? 0));
    }
    const rate = this.context.sampleRate, frames = Math.max(1, Math.round(clip.duration * rate)), period = frames / rate;
    // Warm up complete periods so ringing tails wrap naturally through the loop seam.
    const cycles = Math.ceil(tail / period) + 1;
    const context = new OfflineAudioContext(2, frames * cycles, rate);
    const mixer = new VoiceMixer(context, context.destination, this.buffers, Boolean(instruments[id].monophonic), (instruments[id].crossfadeMs ?? 25) / 1000);
    for (let cycle = 0; cycle < cycles; cycle++) for (const event of events) mixer.play(event.voice, cycle * period + event.at);
    const rendered = await context.startRendering();
    const buffer = this.context.createBuffer(2, frames, rate);
    for (let channel = 0; channel < 2; channel++) buffer.copyToChannel(rendered.getChannelData(channel).subarray(frames * (cycles - 1)), channel);
    let peak = 0;
    for (let channel = 0; channel < 2; channel++) for (const value of buffer.getChannelData(channel)) peak = Math.max(peak, Math.abs(value));
    if (peak > .8) for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel); for (let i = 0; i < data.length; i++) data[i] *= .8 / peak;
    }
    return buffer;
  }

}
