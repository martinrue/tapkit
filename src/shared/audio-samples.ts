/** Trim quiet lead-in by default; prepared envelopes retain their complete attack and release. */
export function sampleBounds(channels: readonly Float32Array[], sampleRate: number, trimAttack = true) {
  const total = channels[0]?.length ?? 0;
  let peak = 0;
  for (const data of channels) for (const value of data) peak = Math.max(peak, Math.abs(value));
  if (peak <= 0.000001 || !total) throw new Error('Sample is silent.');
  const threshold = peak * 0.05;
  let attack = total;
  for (const data of channels) {
    const first = data.findIndex(value => Math.abs(value) >= threshold);
    if (first >= 0) attack = Math.min(attack, first);
  }
  const start = trimAttack ? Math.max(0, attack - Math.ceil(sampleRate * 0.0002)) : 0;
  return { start, length: Math.min(total - start, Math.ceil(sampleRate * 7)), peak };
}
