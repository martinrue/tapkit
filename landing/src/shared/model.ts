import { melodicKeys, melodicSample, noteLabel, guitarChords, guitarTuning, guitarPosition, trumpetValves, trumpetRoots, guitarRoots, violinRoots, violinPosition, type SampleLayer } from './melody';
import { pianoVoices, pianoRoots, pianoRanges, pianoSampleFile } from './piano';
import { samplerKeys, samplerSounds, samplerLayout, samplerPad } from './sampler';
import { loopDockHeight, type LoopClip } from './loops';
import { marimbaVoices, marimbaRanges, marimbaRoots, marimbaSampleFile, marimbaLayout } from './marimba';

export const instrumentIds = ['djembe', 'piano', 'handpan', 'tambourine', 'trumpet', 'guitar', 'violin', 'drums', 'sampler', 'marimba'] as const;
export type InstrumentId = typeof instrumentIds[number];
export function adjacentInstrument(order: readonly InstrumentId[], current: InstrumentId, direction: -1 | 1): InstrumentId {
  return order[(order.indexOf(current) + direction + order.length) % order.length];
}
export const themeIds = ['classic', 'metal', 'neon', 'candy', 'paper', 'gold', 'cartoon'] as const;
export type ThemeId = typeof themeIds[number];
export const sizeIds = ['s', 'm', 'l'] as const;
export type InstrumentSize = typeof sizeIds[number];
export const sizeScales: Record<InstrumentSize, number> = { s: 0.75, m: 1, l: 1.25 };
export const scaleLimits = { min: .5, max: 2 };
export type Hand = 'left' | 'right';

export interface VoiceDefinition {
  id: string;
  label: string;
  key: string;
  sample: string;
  semitones: number;
  hand: Hand;
  x: number;
  /** Contact height as a fraction of the instrument window, for round note fields. */
  y?: number;
  motion?: 'shake' | 'roll';
  black?: boolean;
  gain?: number;
  accent?: boolean;
  legend?: string;
  noteIndex?: number;
  midi?: number;
  layers?: SampleLayer[];
  chord?: string;
  fret?: number;
  string?: number;
  valves?: number[];
  chokeGroup?: string;
  choke?: string;
  surface?: string;
}
export interface InstrumentDefinition {
  id: InstrumentId;
  name: string;
  subtitle: string;
  shortcut: string;
  width: number;
  height: number;
  voices: VoiceDefinition[];
  ranges?: { label: string; start: number }[];
  defaultRange?: number;
  samples?: string[];
  monophonic?: boolean;
  crossfadeMs?: number;
  preserveSampleEnvelope?: boolean;
}

export const rangeBindings = [{ id: 'range-down', label: 'Lower register', key: 'Z' }, { id: 'range-up', label: 'Higher register', key: 'X' }];
function melodicVoices(id: 'trumpet' | 'guitar' | 'violin', start: number): VoiceDefinition[] {
  return melodicKeys.map((key, index) => ({ id: `melody-${index}`, label: noteLabel(start + index), key, ...melodicSample(id, start + index), hand: 'right', x: index, noteIndex: index, midi: start + index, legend: noteLabel(start + index), gain: id === 'trumpet' ? .36 : id === 'violin' ? .32 : .42, ...(id === 'trumpet' ? { valves: trumpetValves(start + index) } : id === 'violin' ? violinPosition(start + index) : guitarPosition(start + index)) }));
}

export const instruments: Record<InstrumentId, InstrumentDefinition> = {
  djembe: {
    id: 'djembe', preserveSampleEnvelope: true, name: 'Djembe', subtitle: 'Find your pocket.', shortcut: 'CommandOrControl+Alt+D', width: 390, height: 490,
    voices: [
      { id: 'left-rim', label: 'Left rim', key: 'D', sample: 'djembe-rim.wav', semitones: -1.5, hand: 'left', x: 0.26 },
      { id: 'left-bass', label: 'Left bass', key: 'F', sample: 'djembe-bass.wav', semitones: -2, gain: .62, hand: 'left', x: 0.43 },
      { id: 'center-bass', label: 'Hard bass', key: 'G', sample: 'djembe-bass.wav', semitones: -11, gain: 1.1, accent: true, legend: 'accent', hand: 'right', x: .5 },
      { id: 'right-bass', label: 'Right bass', key: 'J', sample: 'djembe-bass.wav', semitones: -2, gain: .62, hand: 'right', x: 0.57 },
      { id: 'right-rim', label: 'Right rim', key: 'K', sample: 'djembe-rim.wav', semitones: -1.5, hand: 'right', x: 0.74 },
    ],
  },
  piano: {
    id: 'piano', name: 'Pocket piano', subtitle: 'A little room for melody.', shortcut: 'CommandOrControl+Alt+P', width: 540, height: 400,
    voices: pianoVoices(60), ranges: pianoRanges, defaultRange: 2,
    samples: pianoRoots.map(pianoSampleFile),
  },
  handpan: {
    id: 'handpan', name: 'Handpan', subtitle: 'Let it ring.', shortcut: 'CommandOrControl+Alt+H', width: 440, height: 510,
    voices: ['A3', 'D4', 'E4', 'F4', 'G4', 'A4', 'B♭4', 'C5', 'D5'].map((label, index) => {
      // The central ding plus eight surrounding fields; samples keep their native tuning.
      const [x, y] = [[.5, .397], [.5, .183], [.29, .28], [.72, .26], [.23, .44], [.79, .43], [.32, .60], [.69, .60], [.5, .65]][index];
      return { id: `pan-${index}`, label, key: 'ASDFGHJKL'[index], sample: `handpan-${label.replace('♭', 'b')}.wav`, semitones: 0, gain: .48, hand: (index === 0 || x > .5 ? 'right' : 'left') as Hand, x: (20 + x * 400) / 440, y: (35 + y * 400) / 510, legend: label };
    }),
  },
  tambourine: {
    id: 'tambourine', name: 'Tambourine', subtitle: 'A little shimmer.', shortcut: 'CommandOrControl+Alt+T', width: 390, height: 450,
    voices: [
      { id: 'short-shake', label: 'Short shake', key: 'F', sample: 'tambourine-short.wav', semitones: 0, gain: .42, hand: 'right', x: .66, legend: 'short', motion: 'shake' },
      { id: 'long-shake', label: 'Long shake', key: 'J', sample: 'tambourine-long.wav', semitones: 0, gain: .42, hand: 'right', x: .66, legend: 'long', motion: 'roll' },
      { id: 'accent-tap', label: 'Accent tap', key: 'G', sample: 'tambourine-tap.wav', semitones: 0, gain: .58, hand: 'left', x: .43, legend: 'tap', accent: true },
    ],
  },
  trumpet: {
    id: 'trumpet', name: 'Trumpet', subtitle: 'A little brass.', shortcut: 'CommandOrControl+Alt+R', width: 540, height: 480,
    voices: melodicVoices('trumpet', 60),
    ranges: [{ label: 'E3–E4', start: 52 }, { label: 'C4–C5', start: 60 }, { label: 'C5–C6', start: 72 }], defaultRange: 1,
    samples: trumpetRoots.map(root => `trumpet-${root}.wav`), monophonic: true,
  },
  guitar: {
    id: 'guitar', name: 'Guitar', subtitle: 'Pick a little melody.', shortcut: 'CommandOrControl+Alt+G', width: 620, height: 590,
    voices: [...melodicVoices('guitar', 52), ...guitarChords.map((chord, index): VoiceDefinition => {
      const notes = chord.frets.flatMap((fret, string) => fret < 0 ? [] : [guitarTuning[string] + fret]);
      const layers = notes.map((midi, index) => ({ ...melodicSample('guitar', midi), delay: index * .009 }));
      return { id: `chord-${index}`, label: chord.name, key: chord.key, sample: layers[0].sample, semitones: layers[0].semitones, hand: 'right', x: .72, layers, chord: chord.name, fret: Math.max(...chord.frets), legend: chord.name, gain: .22 };
    }), { id: 'body-tap', label: 'Body tap', key: 'B', sample: 'guitar-body-tap.wav', semitones: 0, gain: 1.05, hand: 'right', x: .79, y: .53, surface: 'body', legend: 'Tap' }],
    ranges: [40, 52, 64, 76].map(start => ({ label: `${noteLabel(start)}–${noteLabel(start + 12)}`, start })), defaultRange: 1,
    samples: [...guitarRoots.map(root => `guitar-${root}.wav`), 'guitar-body-tap.wav'],
  },
  violin: {
    id: 'violin', name: 'Violin', subtitle: 'Draw a little melody.', shortcut: 'CommandOrControl+Alt+V', width: 620, height: 520,
    voices: melodicVoices('violin', 67),
    ranges: [55, 67, 79, 88].map(start => ({ label: `${noteLabel(start)}–${noteLabel(start + 12)}`, start })), defaultRange: 1,
    samples: violinRoots.map(root => `violin-${root}.wav`), monophonic: true, crossfadeMs: 50, preserveSampleEnvelope: true,
  },
  drums: {
    id: 'drums', name: 'Drum kit', subtitle: 'Build a little groove.', shortcut: 'CommandOrControl+Alt+B', width: 620, height: 690,
    voices: [
      { id: 'kick', label: 'Kick', key: 'B', sample: 'kit-kick.wav', semitones: -3, gain: 1.05 * 10 ** (3 / 20) * 1.3, hand: 'right', x: .49, y: 0.60123, surface: 'kick', legend: 'kick' },
      { id: 'snare-left', label: 'Snare · left hand', key: 'F', sample: 'kit-snare.wav', semitones: 0, gain: .48, hand: 'left', x: .242, y: 0.40023, surface: 'snare', legend: 'snare' },
      { id: 'snare-right', label: 'Snare · right hand', key: 'J', sample: 'kit-snare.wav', semitones: 0, gain: .48, hand: 'right', x: .242, y: 0.40023, surface: 'snare', legend: 'snare' },
      { id: 'hat-closed', label: 'Closed hi-hat', key: 'D', sample: 'kit-hat-closed.wav', semitones: 0, gain: .24, hand: 'left', x: .14, y: 0.26823, surface: 'hat', legend: 'hat shut', choke: 'hi-hat', chokeGroup: 'hi-hat' },
      { id: 'hat-open', label: 'Open hi-hat', key: 'E', sample: 'kit-hat-open.wav', semitones: 0, gain: .26, hand: 'left', x: .14, y: 0.26823, surface: 'hat', legend: 'hat open', chokeGroup: 'hi-hat' },
      { id: 'tom-high', label: 'High tom', key: 'R', sample: 'kit-tom-high.wav', semitones: 0, gain: .48, hand: 'left', x: .394, y: 0.25423, surface: 'tom-high', legend: 'high tom' },
      { id: 'tom-mid', label: 'Middle tom', key: 'T', sample: 'kit-tom-high.wav', semitones: -3, gain: .48, hand: 'right', x: .609, y: 0.25223, surface: 'tom-mid', legend: 'mid tom' },
      { id: 'tom-floor', label: 'Floor tom', key: 'G', sample: 'kit-tom-floor.wav', semitones: 0, gain: .52, hand: 'right', x: .801, y: 0.39723, surface: 'tom-floor', legend: 'floor tom' },
      { id: 'crash', label: 'Crash cymbal', key: 'Q', sample: 'kit-crash.wav', semitones: 0, gain: .28, hand: 'left', x: .234, y: 0.10423, surface: 'crash', legend: 'crash' },
      { id: 'ride', label: 'Ride cymbal', key: 'U', sample: 'kit-ride.wav', semitones: 0, gain: .25, hand: 'right', x: .79, y: 0.16723, surface: 'ride', legend: 'ride' },
    ],
  },
  sampler: {
    id: 'sampler', name: 'Sampler', subtitle: 'A little collection of sounds.', shortcut: 'CommandOrControl+Alt+S', width: samplerLayout.width, height: samplerLayout.height,
    voices: samplerSounds.map((sound, index) => {
      const pad = samplerPad(index);
      return { id: `pad-${sound.id}`, label: sound.name, key: samplerKeys[index], sample: `sampler-${sound.recipe}.wav`, semitones: 0, gain: .48,
        hand: pad.column < 2 || (pad.column === 2 && pad.row % 2 === 0) ? 'left' : 'right',
        x: (pad.left + pad.size / 2) / samplerLayout.width, y: (pad.top + pad.size / 2) / samplerLayout.height, noteIndex: index, legend: sound.name };
    }),
  },
  marimba: {
    id: 'marimba', name: 'Marimba', subtitle: 'A little wooden melody.', shortcut: 'CommandOrControl+Alt+M', width: marimbaLayout.width, height: marimbaLayout.height,
    voices: marimbaVoices(60), ranges: marimbaRanges, defaultRange: 1,
    samples: marimbaRoots.map(marimbaSampleFile), preserveSampleEnvelope: true,
  },
};

export function instrumentBindings(id: InstrumentId, range?: number) {
  const controls = instruments[id].ranges ? rangeBindings.map(binding => id === 'piano' || id === 'marimba' ? { ...binding, label: binding.id === 'range-down' ? 'Lower octave' : 'Higher octave' } : binding) : [];
  return [...voicesFor(id, range), ...controls];
}
export function voicesFor(id: InstrumentId, range = instruments[id].defaultRange ?? 0): VoiceDefinition[] {
  const definition = instruments[id];
  if (!definition.ranges) return definition.voices;
  const start = definition.ranges[range]?.start ?? definition.ranges[definition.defaultRange!].start;
  if (id === 'piano') return pianoVoices(start);
  if (id === 'marimba') return marimbaVoices(start);
  if (id !== 'trumpet' && id !== 'guitar' && id !== 'violin') return definition.voices;
  const notes = melodicVoices(id, start);
  return [...notes, ...definition.voices.filter(voice => voice.midi === undefined)];
}

export const themes: Record<ThemeId, { name: string; description: string; accent: string; handStyle?: 'cartoon' }> = {
  classic: { name: 'Classic', description: 'Carved walnut, ivory & brass', accent: '#b98555' },
  metal: { name: 'Metal', description: 'Brushed steel, chrome & black', accent: '#9caab6' },
  candy: { name: 'Candy', description: 'Pastel shell, sugar-soft colors', accent: '#bc90cb' },
  neon: { name: 'Neon', description: 'After-dark glow & electric edges', accent: '#86e0c7' },
  paper: { name: 'Paper', description: 'White folded paper & black ink', accent: '#dddddf' },
  gold: { name: 'Gold', description: 'Polished gold & engraved details', accent: '#e1b349' },
  cartoon: { name: 'Cartoon', description: 'Bold ink outlines & flat cel colors', accent: '#f28151', handStyle: 'cartoon' },
};

export function handArtwork(id: InstrumentId, theme: ThemeId, hand: Hand = 'left'): string {
  return `hand-${id === 'drums' || id === 'marimba' || (id === 'violin' && hand === 'right') ? 'grip' : id === 'piano' || id === 'trumpet' || id === 'sampler' ? 'piano' : 'drum'}${themes[theme].handStyle === 'cartoon' ? '-cartoon' : ''}.webp`;
}
export function instrumentArtwork(id: InstrumentId, theme: ThemeId, thumbnail = false): string {
  return id === 'sampler' || id === 'marimba' ? `${theme}-${id}${thumbnail ? '' : '-body'}.svg` : `${theme}-${id}.webp`;
}

export function instrumentScale(size: InstrumentSize | InstrumentSettings | number): number {
  return typeof size === 'number' ? size : typeof size === 'string' ? sizeScales[size] : size.scale ?? sizeScales[size.size];
}
export function instrumentDimensions(id: InstrumentId, size: InstrumentSize | InstrumentSettings | number) {
  const scale = instrumentScale(size);
  return { width: Math.round(instruments[id].width * scale), height: Math.round(instruments[id].height * scale) };
}
export function overlayDimensions(id: InstrumentId, size: InstrumentSize | InstrumentSettings | number) {
  const scale = instrumentScale(size);
  return { width: Math.round(instruments[id].width * scale), height: Math.round(instruments[id].height * scale + loopDockHeight) };
}
/** Shadows only: hand artwork stays neutral white for every instrument style. */
export function handGroupFilter(): string { return 'drop-shadow(0 6px 4px #0002)'; }

/** 75% of the original hand frames; anchors keep fingertips over the playing surface. */
export const handGeometry = {
  djembe: { width: 70.5, height: 97.5, top: 50, contactY: 29, fingertipX: .5 },
  piano: { width: 59.25, height: 93.75, top: 148, contactY: 20, fingertipX: .61 },
  handpan: { width: 70.5, height: 97.5, top: 100, contactY: 16, fingertipX: .5 },
  tambourine: { width: 70.5, height: 97.5, top: 80, contactY: 24, fingertipX: .5 },
  trumpet: { width: 59.25, height: 93.75, top: 65, contactY: 15, fingertipX: .61 },
  guitar: { width: 70.5, height: 97.5, top: 166, contactY: 20, fingertipX: .5 },
  violin: { width: 70.5, height: 97.5, top: 140, contactY: 12, fingertipX: .5 },
  drums: { width: 70.5, height: 97.5, top: 170, contactY: 12, fingertipX: .5 },
  sampler: { width: 59.25, height: 93.75, top: 30, contactY: 14, fingertipX: .61 },
  marimba: { width: 70.5, height: 97.5, top: 310, contactY: 0, fingertipX: .5 },
} as const;


export interface InstrumentSettings { theme: ThemeId; size: InstrumentSize; scale?: number; volume: number; shortcut: string; keys: Record<string, string>; range?: number }
export interface Position { x: number; y: number }
export interface SharedLayout {
  scale: number;
  /** Top-right anchor relative to the display work area. */
  position: Position & { displayId: number };
}
export interface Settings {
  version: 1;
  loops: Partial<Record<InstrumentId, LoopClip>>;
  instrumentOrder: InstrumentId[];
  instruments: Record<InstrumentId, InstrumentSettings>;
  layout?: SharedLayout;
  /** Legacy per-instrument positions, consumed when the shared layout is first created. */
  positions: Record<string, Position>;
}
export function defaultSettings(): Settings {
  return { version: 1, loops: {}, instrumentOrder: [...instrumentIds], positions: {}, instruments: Object.fromEntries(instrumentIds.map(id => [id, {
    theme: 'classic', size: 'm', volume: 0.75, shortcut: instruments[id].shortcut,
    keys: Object.fromEntries(instrumentBindings(id).map(binding => [binding.id, binding.key])),
    ...(instruments[id].ranges ? { range: instruments[id].defaultRange } : {}),
  }])) as Settings['instruments'] };
}
export interface AppState { settings: Settings; activeInstrument: InstrumentId | null; playing: boolean; status: string; overlayScale?: number }
export interface Hit { voiceId: string; sentAt: number }
export interface TimingReport { schedulingMs: number; dispatchMs: number; visualErrorMs: number; baseLatencyMs: number; outputLatencyMs: number }
export type SaveResult = { ok: true } | { ok: false; error: string };
export interface TapkitBridge {
  getState(): Promise<AppState>;
  ready(): Promise<void>;
  failed(message: string): void;
  visibility(visible: boolean): void;
  onState(callback: (state: AppState) => void): () => void;
  onHit(callback: (hit: Hit) => void): () => void;
  onToggleLoop(callback: () => void): () => void;
  hide(): void;
  toggle(id: InstrumentId): void;
  openSettings(): void;
  saveSettings(settings: Settings): Promise<SaveResult>;
  closeSettings(): void;
  setTheme(theme: ThemeId): void;
  setVolume(volume: number): void;
  setRange(id: InstrumentId, range: number): void;
  setLoop(id: InstrumentId, clip: LoopClip | null): Promise<SaveResult>;
  pointerInteractive(interactive: boolean): void;
  drag(phase: 'start' | 'move' | 'end', point: Position): void;
  resize(phase: 'start' | 'move' | 'end', point: Position): void;
  reportTiming(report: TimingReport): void;
}
