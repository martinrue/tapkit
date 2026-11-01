export type MelodicInstrument = 'trumpet' | 'guitar' | 'violin';
export interface SampleLayer { sample: string; semitones: number; delay?: number }
export const melodicKeys = ['A', 'W', 'S', 'E', 'D', 'F', 'T', 'G', 'Y', 'H', 'U', 'J', 'K'];
export const violinRoots = [55, 57, 60, 64, 67, 69, 72, 76, 79, 81, 84, 88, 91, 93, 96];
export const violinTuning = [55, 62, 69, 76];
export function violinPosition(midi: number) {
  let string = 3; while (violinTuning[string] > midi && string > 0) string--;
  return { string, fret: midi - violinTuning[string] };
}
export const trumpetRoots = [53, 57, 60, 63, 67, 70, 74, 77, 81, 84];
// Actual sample roots from the original FreePats SFZ (scientific pitch notation).
export const guitarRoots = [40, 41, 43, 45, 47, 48, 50, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84];
export function noteLabel(midi: number): string { return `${['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][midi % 12]}${Math.floor(midi / 12) - 1}`; }
export function melodicSample(id: MelodicInstrument, midi: number): SampleLayer {
  const roots = id === 'trumpet' ? trumpetRoots : id === 'violin' ? violinRoots : guitarRoots;
  const nearest = roots.reduce((best, root) => Math.abs(root - midi) < Math.abs(best - midi) ? root : best);
  return { sample: `${id}-${nearest}.wav`, semitones: midi - nearest };
}
export const guitarChords = [
  { name: 'C', key: '1', frets: [-1, 3, 2, 0, 1, 0] },
  { name: 'D', key: '2', frets: [-1, -1, 0, 2, 3, 2] },
  { name: 'Em', key: '3', frets: [0, 2, 2, 0, 0, 0] },
  { name: 'F', key: '4', frets: [1, 3, 3, 2, 1, 1] },
  { name: 'G', key: '5', frets: [3, 2, 0, 0, 0, 3] },
  { name: 'Am', key: '6', frets: [-1, 0, 2, 2, 1, 0] },
];
export const guitarTuning = [40, 45, 50, 55, 59, 64];
export function guitarPosition(midi: number) {
  let string = guitarTuning.length - 1;
  while (guitarTuning[string] > midi && string > 0) string--;
  return { string, fret: midi - guitarTuning[string] };
}
/** Standard B-flat trumpet fingerings; the app displays sounding/concert notes. */
export function trumpetValves(concertMidi: number): number[] {
  const written = concertMidi + 2;
  if (written === 54) return [1, 2, 3];
  if (written === 55) return [1, 3];
  const ordinary = [[], [1, 2, 3], [1, 3], [2, 3], [1, 2], [1], [2], [], [2, 3], [1, 2], [1], [2]];
  const upper = [[], [1, 2], [1], [2], [], [1], [2], [], [2, 3], [1, 2], [1], [2]];
  return (written >= 72 ? upper : ordinary)[written % 12];
}
