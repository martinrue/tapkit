import { noteLabel } from './melody';
import type { VoiceDefinition } from './model';

// Keep the original thirteen bindings, then continue along the number row.
export const pianoKeys = ['A', 'W', 'S', 'E', 'D', 'F', 'T', 'G', 'Y', 'H', 'U', 'J', 'K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'O', 'P'];
export const pianoRoots = Array.from({ length: 21 }, (_, index) => 36 + index * 3);
export const pianoRanges = [36, 48, 60, 72].map(start => ({ label: `${noteLabel(start)}–${noteLabel(start + 24)}`, start }));
export const pianoLayout = { left: 66, top: 214, width: 408, height: 48, whiteKeys: 15, blackWidth: .64 };
export function pianoSampleFile(root: number): string { return `${noteLabel(root).replace('♯', 's')}.mp3`; }

export function pianoVoices(start: number): VoiceDefinition[] {
  const positions = [0, .68, 1, 1.68, 2, 3, 3.68, 4, 4.68, 5, 5.68, 6];
  return pianoKeys.map((key, index) => {
    const midi = start + index;
    const root = pianoRoots.reduce((nearest, root) => Math.abs(root - midi) < Math.abs(nearest - midi) ? root : nearest);
    return {
      id: `note-${index}`, key, label: noteLabel(midi), midi, noteIndex: index,
      sample: pianoSampleFile(root), semitones: midi - root,
      hand: index < 12 ? 'left' : 'right',
      x: Math.floor(index / 12) * 7 + positions[index % 12],
      black: [1, 3, 6, 8, 10].includes(midi % 12),
    };
  });
}

/** Same coordinates drive the real keys and the animated fingertips. */
export function pianoKeyCenter(voice: Pick<VoiceDefinition, 'x' | 'black'>): number {
  return pianoLayout.left + (voice.x + (voice.black ? pianoLayout.blackWidth / 2 : .5)) * pianoLayout.width / pianoLayout.whiteKeys;
}
