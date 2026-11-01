import type { ThemeId } from './model';

export const samplerLayout = { width: 700, height: 700, left: 70, top: 90, body: 560, canvas: 1024, start: 104, pad: 144, gap: 24 };
export const samplerKeys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'Q', 'W', 'E', 'R', 'T', 'A', 'S', 'D', 'F', 'G', 'Z', 'X', 'C', 'V', 'B'];
// IDs identify physical pads and stay stable when the sound bank changes.
export const samplerSounds = [
  { id: 'kick', recipe: 'kick', name: 'House kick', seconds: 1.8 }, { id: 'snare', recipe: 'vocal-go', name: "Let's go", seconds: 1.5 },
  { id: 'clap', recipe: 'tape-stop', name: 'Tape stop', seconds: 1.15 }, { id: 'snap', recipe: 'vocal-go-chop', name: 'Go chop', seconds: 1.2 },
  { id: 'cowbell', recipe: 'vocal-echo', name: 'Vox echo', seconds: 1.8 }, { id: 'clave', recipe: 'sub-drop', name: 'Sub drop', seconds: 2.4 },
  { id: 'shaker', recipe: '808-glide', name: '808 glide', seconds: 1.7 }, { id: 'tambourine', recipe: 'reese', name: 'Reese bass', seconds: 1.35 },
  { id: 'rim', recipe: 'wobble', name: 'Wobble', seconds: 1.4 }, { id: 'metal', recipe: 'growl', name: 'Bass growl', seconds: 1.2 },
  { id: 'laser', recipe: 'laser', name: 'Laser', seconds: .65 }, { id: 'zap', recipe: 'zap', name: 'Zap', seconds: .32 },
  { id: 'space', recipe: 'rave', name: 'Rave stab', seconds: 1.1 }, { id: 'robot', recipe: 'supersaw', name: 'Supersaw', seconds: 1.6 },
  { id: 'coin', recipe: 'acid', name: 'Acid stab', seconds: .8 }, { id: 'bell', recipe: 'vocal-hey', name: 'Hey!', seconds: .9 },
  { id: 'chime', recipe: 'vocal-yeah', name: 'Yeah!', seconds: 1.15 }, { id: 'marimba', recipe: 'ring-mod', name: 'Ring mod', seconds: 1.65 },
  { id: 'bass', recipe: 'house-keys', name: 'Soft keys', seconds: 2.5 }, { id: 'chord', recipe: 'house-chord', name: 'Deep chord', seconds: 2.0 },
  { id: 'whoosh', recipe: 'riser', name: 'Riser', seconds: 1.4 }, { id: 'reverse', recipe: 'house-organ', name: 'Organ', seconds: 1.4 },
  { id: 'scratch', recipe: 'house-pluck', name: 'Soft pluck', seconds: 1.8 }, { id: 'bubble', recipe: 'impact', name: 'Impact', seconds: 2.0 },
  { id: 'horn', recipe: 'horn', name: 'Air horn', seconds: 1.1 },
] as const;

export function samplerPad(index: number) {
  const row = Math.floor(index / 5), column = index % 5, scale = samplerLayout.body / samplerLayout.canvas;
  return {
    left: samplerLayout.left + (samplerLayout.start + column * (samplerLayout.pad + samplerLayout.gap)) * scale,
    top: samplerLayout.top + (samplerLayout.start + row * (samplerLayout.pad + samplerLayout.gap)) * scale,
    size: samplerLayout.pad * scale, row, column,
  };
}

const hues = [350, 27, 49, 100, 162, 188, 218, 260, 285, 325, 12, 64, 140, 202, 243, 304, 38, 82, 176, 228, 276, 337, 54, 120, 194];
export const samplerPadMaterials: Record<ThemeId, { face: string; light: string; dark: string; ink: string; tint: number }> = {
  classic: { face: '#a77749', light: '#dfbd8c', dark: '#694529', ink: '#241b13', tint: .07 },
  metal: { face: '#adb7c0', light: '#eff2f4', dark: '#626e79', ink: '#202830', tint: .07 },
  neon: { face: '#2a424b', light: '#7d9b9b', dark: '#15212c', ink: '#f0f8f7', tint: .12 },
  candy: { face: '#e5cfe2', light: '#fff4fa', dark: '#b7a2bc', ink: '#3b3040', tint: .1 },
  paper: { face: '#f7f6f1', light: '#fffefa', dark: '#d9d7cf', ink: '#303033', tint: .025 },
  gold: { face: '#d9ac45', light: '#fff0ae', dark: '#996d21', ink: '#38260c', tint: .055 },
  cartoon: { face: '#8bd9d3', light: '#c2f0e6', dark: '#4c9b9b', ink: '#223044', tint: .1 },
};
export function samplerPadColours(index: number, theme: ThemeId) {
  const material = samplerPadMaterials[theme], hue = hues[index] / 60;
  const x = 1 - Math.abs(hue % 2 - 1);
  const tint = hue < 1 ? [1, x, 0] : hue < 2 ? [x, 1, 0] : hue < 3 ? [0, 1, x] : hue < 4 ? [0, x, 1] : hue < 5 ? [x, 0, 1] : [1, 0, x];
  const colour = (base: string) => {
    const channels = [1, 3, 5].map((start, channel) => (parseInt(base.slice(start, start + 2), 16) * (1 - material.tint) + (40 + tint[channel] * 190) * material.tint).toFixed(2));
    return `rgb(${channels.join(' ')})`;
  };
  return { face: colour(material.face), light: colour(material.light), dark: colour(material.dark), ink: material.ink };
}
