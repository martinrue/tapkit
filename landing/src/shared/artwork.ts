/** Shared silhouette also keeps transparent-space mouse hit testing accurate. */
export const pianoOutline: [number, number][] = [
  [10,8], [90,8], [95.5,17.5], [95.6,21], [94,22.5], [94.5,32], [95.5,40], [97.5,49], [98,74], [97.5,78],
  [95.6,79], [95.7,84], [95,88], [94,90], [90.5,90.5], [89,89], [88,85], [88,81], [82,79], [75,79],
  [65,78], [57,77], [50,79], [45,78], [38,77], [30,78], [20,81], [12,80], [12,85], [11,89],
  [9.5,90.5], [6,90], [4.5,88], [3.9,84], [4.5,80], [2.5,79], [2,75], [2,52], [4,43], [5,33], [6,22], [5,21], [4.5,18],
];
export const pianoClip = `polygon(${pianoOutline.map(([x, y]) => `${x}% ${y}%`).join(',')})`;
export function insidePiano(x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = pianoOutline.length - 1; i < pianoOutline.length; j = i++) {
    const [xi, yi] = pianoOutline[i], [xj, yj] = pianoOutline[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
