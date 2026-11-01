import { noteLabel } from './melody';
import { pianoKeys } from './piano';
import type { VoiceDefinition, ThemeId } from './model';

export const marimbaLayout = { width: 620, height: 470, artworkHeight: 390, left: 46, step: 35, malletContact: 49 };
// VSCO's filenames use C3 for scientific C4. These are the sounding MIDI roots.
export const marimbaRoots = [48, 55, 59, 65, 72, 79, 83, 89, 96];
export const marimbaRanges = [48, 60, 72].map(start => ({ label: `${noteLabel(start)}–${noteLabel(start + 24)}`, start }));
export const marimbaSampleFile = (root: number) => `marimba-${root}.wav`;

export const marimbaMaterials: Record<ThemeId, { face: string; light: string; dark: string; raised: string; raisedLight: string; raisedDark: string; ink: string; raisedInk: string; edge: string; frame: string; frameLight: string; tube: string; tubeLight: string }> = {
  classic: { face: '#925836', light: '#cf9564', dark: '#4b281b', raised: '#523023', raisedLight: '#936044', raisedDark: '#271812', ink: '#ffe2bd', raisedInk: '#ffe2bd', edge: '#3d2519', frame: '#533222', frameLight: '#a6774c', tube: '#8b6332', tubeLight: '#e3bd72' },
  metal: { face: '#a5b2bd', light: '#f0f6f9', dark: '#596a77', raised: '#4a5b69', raisedLight: '#9cabb5', raisedDark: '#26323e', ink: '#24313c', raisedInk: '#f0f6f9', edge: '#40505d', frame: '#3d4b58', frameLight: '#c3d0d9', tube: '#647584', tubeLight: '#edf5fc' },
  neon: { face: '#173d47', light: '#66ffe6', dark: '#0e1c30', raised: '#3d1b51', raisedLight: '#f075ff', raisedDark: '#190e2b', ink: '#aaffef', raisedInk: '#ffd0ff', edge: '#74e7dc', frame: '#141d32', frameLight: '#9764ec', tube: '#232c51', tubeLight: '#65e8ed' },
  candy: { face: '#a8d9cf', light: '#effff3', dark: '#78a8a4', raised: '#d0b4e1', raisedLight: '#fff0ff', raisedDark: '#9d7db3', ink: '#3d5659', raisedInk: '#574164', edge: '#a29db9', frame: '#d4a6be', frameLight: '#ffe5f0', tube: '#c6a7cf', tubeLight: '#fff0e3' },
  paper: { face: '#fffef9', light: '#ffffff', dark: '#d8d6cf', raised: '#eeede8', raisedLight: '#ffffff', raisedDark: '#bdbbb6', ink: '#292929', raisedInk: '#292929', edge: '#353535', frame: '#deddd6', frameLight: '#fffefb', tube: '#d6d5d0', tubeLight: '#ffffff' },
  gold: { face: '#d9a635', light: '#fff0a9', dark: '#8a5910', raised: '#b58323', raisedLight: '#ffe89d', raisedDark: '#67420d', ink: '#56380d', raisedInk: '#3b260b', edge: '#9e731e', frame: '#9e6c16', frameLight: '#ffe69a', tube: '#a16d18', tubeLight: '#ffeaa1' },
  cartoon: { face: '#61c9bd', light: '#b4f0db', dark: '#369c9b', raised: '#ffb554', raisedLight: '#ffde8b', raisedDark: '#dc7e39', ink: '#233044', raisedInk: '#233044', edge: '#233044', frame: '#ed785d', frameLight: '#ffc38d', tube: '#f2bb50', tubeLight: '#ffe19a' },
};

/** One geometry for the visible bars, thumbnails, hit areas and mallet contact. */
export function marimbaBar(index: number) {
  const positions = [0, .5, 1, 1.5, 2, 3, 3.5, 4, 4.5, 5, 5.5, 6];
  const sharp = [1, 3, 6, 8, 10].includes(index % 12);
  const slot = Math.floor(index / 12) * 7 + positions[index % 12];
  const width = sharp ? 26 : 30;
  const height = (sharp ? 94 : 120) - slot * 3;
  const left = marimbaLayout.left + slot * marimbaLayout.step + (sharp ? 2 : 0);
  const top = sharp ? 108 : 206;
  return { left, top, width, height, sharp, centerX: left + width / 2, contactY: top + height * .42 };
}

export function marimbaVoices(start: number): VoiceDefinition[] {
  return pianoKeys.map((key, index) => {
    const midi = start + index, bar = marimbaBar(index);
    const root = marimbaRoots.reduce((nearest, root) => Math.abs(root - midi) < Math.abs(nearest - midi) ? root : nearest);
    return { id: `note-${index}`, key, label: noteLabel(midi), midi, noteIndex: index,
      sample: marimbaSampleFile(root), semitones: midi - root, gain: .5,
      hand: index < 12 ? 'left' : 'right', black: bar.sharp,
      x: bar.centerX / marimbaLayout.width, y: bar.contactY / marimbaLayout.height };
  });
}
