import type { VoiceDefinition } from '../shared/model';

export const maxAudioVoices = 128;
/** Identical articulation for live input and offline loop rendering. */
export class VoiceMixer {
  private active = new Map<AudioBufferSourceNode, { gain: GainNode; group?: string; end: number }>();
  constructor(private context: BaseAudioContext, private output: AudioNode, private buffers: Map<string, AudioBuffer>, private monophonic: boolean, private crossfadeSeconds = .025) {}
  play(voice: VoiceDefinition, at: number): boolean {
    const layers = voice.layers ?? [{ sample: voice.sample, semitones: voice.semitones }];
    if (layers.some(layer => !this.buffers.has(layer.sample))) return false;
    for (const [source, item] of this.active) {
      if (item.end <= at) { this.active.delete(source); continue; }
      if (this.monophonic || (voice.choke && item.group === voice.choke)) {
        const fade = this.monophonic ? this.crossfadeSeconds : .025;
        item.gain.gain.setTargetAtTime(0, at, .004 * fade / .025);
        source.stop(at + fade); item.end = Math.min(item.end, at + fade);
      }
    }
    for (const layer of layers) {
      if (this.active.size >= maxAudioVoices) {
        const [oldest, item] = this.active.entries().next().value!;
        item.gain.gain.setTargetAtTime(0, at, .002); oldest.stop(at + .01); this.active.delete(oldest);
      }
      const source = this.context.createBufferSource(), gain = this.context.createGain();
      gain.gain.value = voice.gain ?? (voice.id.startsWith('note-') ? .28 : .7);
      source.buffer = this.buffers.get(layer.sample)!; source.playbackRate.value = 2 ** (layer.semitones / 12);
      source.connect(gain); gain.connect(this.output);
      this.active.set(source, { gain, group: voice.chokeGroup, end: at + (layer.delay ?? 0) + source.buffer.duration / source.playbackRate.value });
      source.onended = () => { this.active.delete(source); source.disconnect(); gain.disconnect(); };
      source.start(at + (layer.delay ?? 0));
    }
    return true;
  }
  stop(at: number) { for (const source of this.active.keys()) { try { source.stop(at); } catch {} } }
  dispose() { this.stop(this.context.currentTime); this.active.clear(); }
}
