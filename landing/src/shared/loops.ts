import { instruments, type InstrumentId, type Settings } from './model';

export const maxLoopSeconds = 10;
export const maxLoopEvents = 512;
export const loopDockHeight = 112;
/** Keep custom summon shortcuts intact; prefer the mnemonic L for Loop. */
export function loopToggleShortcut(settings: Settings): string {
  const occupied = new Set(Object.values(settings.instruments).map(item => item.shortcut.toLowerCase()));
  return ['CommandOrControl+Alt+L', ...'LABCDEFGHIJKMNOPQRSTUVWXYZ'.split('').map(key => `CommandOrControl+Alt+Shift+${key}`)]
    .find(shortcut => !occupied.has(shortcut.toLowerCase()))!;
}
export interface LoopEvent { at: number; voiceId: string; range?: number }
export interface LoopClip { duration: number; events: LoopEvent[] }

export function validateLoop(id: InstrumentId, value: unknown): LoopClip {
  const clip = value as LoopClip;
  if (!clip || !Number.isFinite(clip.duration) || clip.duration < .25 || clip.duration > maxLoopSeconds
    || !Array.isArray(clip.events) || !clip.events.length || clip.events.length > maxLoopEvents) throw new Error('Loops need notes and a length between 0.25 and 10 seconds.');
  const definition = instruments[id], voices = new Set(definition.voices.map(voice => voice.id));
  const events = clip.events.map(event => {
    if (!event || !Number.isFinite(event.at) || event.at < 0 || event.at >= clip.duration || !voices.has(event.voiceId)) throw new Error('Loop contains an invalid note or time.');
    if (definition.ranges && (!Number.isInteger(event.range) || event.range! < 0 || event.range! >= definition.ranges.length)) throw new Error('Loop contains an invalid register.');
    return { at: event.at, voiceId: event.voiceId, ...(definition.ranges ? { range: event.range } : {}) };
  }).sort((a, b) => a.at - b.at);
  return { duration: clip.duration, events };
}

/** Capture on the audio clock; mouse-to-keyboard travel creates no leading silence. */
export class LoopCapture {
  startedAt: number | null = null;
  events: LoopEvent[] = [];
  add(voiceId: string, time: number, range?: number) {
    this.startedAt ??= time;
    const at = time - this.startedAt;
    if (at < 0 || at >= maxLoopSeconds || this.events.length >= maxLoopEvents) return;
    this.events.push({ at, voiceId, ...(range === undefined ? {} : { range }) });
  }
  finish(time: number): LoopClip | null {
    if (this.startedAt === null || !this.events.length) return null;
    const duration = Math.min(maxLoopSeconds, Math.max(.25, time - this.startedAt, this.events.at(-1)!.at + .001));
    return { duration, events: this.events.filter(event => event.at < duration).map(event => ({ ...event })) };
  }
}
