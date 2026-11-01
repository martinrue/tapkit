import { defaultSettings, instrumentIds, instruments, instrumentBindings, instrumentScale, themeIds, sizeIds, scaleLimits, type Settings, type Position, type ThemeId } from './model';
import { validateLoop } from './loops';

/** Retain the existing settings format while sharing appearance across instruments. */
export function setSharedAppearance(settings: Settings, appearance: { theme?: ThemeId; scale?: number }) {
  if (settings.layout && appearance.scale !== undefined) settings.layout.scale = appearance.scale;
  for (const id of instrumentIds) {
    const item = settings.instruments[id];
    if (appearance.theme !== undefined) item.theme = appearance.theme;
    if (appearance.scale !== undefined) { item.size = 'm'; item.scale = appearance.scale; }
  }
}

/** Apply Settings edits atomically, including clients editing just one instrument. */
export function shareAppearanceChanges(previous: Settings, next: Settings) {
  const themes = new Set(instrumentIds.filter(id => next.instruments[id].theme !== previous.instruments[id].theme).map(id => next.instruments[id].theme));
  const scales = new Set(instrumentIds.filter(id => instrumentScale(next.instruments[id]) !== instrumentScale(previous.instruments[id])).map(id => instrumentScale(next.instruments[id])));
  if (themes.size > 1 || scales.size > 1) throw new Error('Choose one shared style and size for all instruments.');
  if (previous.layout && !next.layout) next.layout = structuredClone(previous.layout);
  setSharedAppearance(next, { theme: themes.values().next().value, scale: scales.values().next().value });
}

const modifierOrder = ['CommandOrControl', 'Control', 'Alt', 'Shift'];
export function normalizeAccelerator(value: string): string {
  const aliases: Record<string, string> = { cmd: 'CommandOrControl', command: 'CommandOrControl', commandorcontrol: 'CommandOrControl', cmdorctrl: 'CommandOrControl', ctrl: 'Control', control: 'Control', option: 'Alt', alt: 'Alt', shift: 'Shift' };
  return value.trim().split('+').map(part => aliases[part.trim().toLowerCase()] ?? part.trim().toUpperCase()).sort((a, b) => {
    const ai = modifierOrder.indexOf(a), bi = modifierOrder.indexOf(b);
    return (ai < 0 ? 10 : ai) - (bi < 0 ? 10 : bi);
  }).join('+');
}

export function validateSettings(value: unknown): Settings {
  if (!value || typeof value !== 'object') throw new Error('Invalid settings.');
  const input = value as Settings;
  if (input.version !== 1 || !input.instruments) throw new Error('Unsupported settings version.');
  const result = defaultSettings();
  if (input.loops !== undefined) {
    if (!input.loops || typeof input.loops !== 'object' || Array.isArray(input.loops) || Object.keys(input.loops).some(id => !instrumentIds.includes(id as typeof instrumentIds[number]))) throw new Error('Invalid saved loops.');
    for (const id of instrumentIds) if (input.loops[id] !== undefined) result.loops[id] = validateLoop(id, input.loops[id]);
  }
  if (input.instrumentOrder !== undefined) {
    if (!Array.isArray(input.instrumentOrder) || input.instrumentOrder.some(id => !instrumentIds.includes(id)) || new Set(input.instrumentOrder).size !== input.instrumentOrder.length) throw new Error('Instrument order must contain each instrument once.');
    // Append newly added instruments while retaining the user's established order.
    result.instrumentOrder = [...input.instrumentOrder, ...instrumentIds.filter(id => !input.instrumentOrder.includes(id))];
  }
  const summons = new Set<string>();
  for (const id of instrumentIds) {
    let item = input.instruments[id];
    // Older installations gain new instruments without resetting any existing preferences.
    if (item === undefined && id !== 'djembe' && id !== 'piano') {
      item = structuredClone(result.instruments[id]);
      if (id === 'marimba') {
        const existing = (input.instrumentOrder ?? instrumentIds).map(other => input.instruments[other]).find(Boolean);
        if (existing) { item.theme = existing.theme; item.size = existing.size ?? 'm'; item.scale = existing.scale; }
      }
      const occupied = new Set(Object.values(input.instruments).flatMap(entry => typeof entry?.shortcut === 'string' ? [normalizeAccelerator(entry.shortcut).toLowerCase()] : []));
      item.shortcut = [item.shortcut, ...'HTRGNBYUIOV'.split('').map(key => `CommandOrControl+Alt+Shift+${key}`)]
        .find(shortcut => !occupied.has(shortcut.toLowerCase()) && !summons.has(shortcut.toLowerCase()))!;
    }
    // Preserve preferences when opening renamed or replaced styles.
    const legacyTheme = item?.theme as string;
    const theme = legacyTheme === 'studio' ? 'classic' : legacyTheme === 'ceramic' ? 'paper' : legacyTheme === 'terrarium' ? 'cartoon' : item?.theme;
    if (!item || !themeIds.includes(theme)) throw new Error(`Choose a valid theme for ${id}.`);
    const size = item.size === undefined ? 'm' : item.size;
    if (!sizeIds.includes(size)) throw new Error(`Choose S, M, or L for ${id}.`);
    const scale = item.scale;
    if (scale !== undefined && (typeof scale !== 'number' || !Number.isFinite(scale) || scale < scaleLimits.min || scale > scaleLimits.max)) throw new Error('Instrument size must be between 50% and 200%.');
    if (typeof item.volume !== 'number' || !Number.isFinite(item.volume) || item.volume < 0 || item.volume > 1) throw new Error('Volume must be between 0 and 100%.');
    if (typeof item.shortcut !== 'string' || item.shortcut.length > 80) throw new Error('Invalid summon shortcut.');
    const shortcut = normalizeAccelerator(item.shortcut);
    if (!/^(?:(?:CommandOrControl|Control|Alt|Shift)\+)+[A-Z0-9]$/.test(shortcut)) throw new Error('Summon shortcuts need modifiers and one letter or number.');
    const parts = shortcut.split('+');
    if (new Set(parts).size !== parts.length) throw new Error('A shortcut cannot repeat a modifier.');
    if (summons.has(shortcut.toLowerCase())) throw new Error('Each instrument needs a different summon shortcut.');
    summons.add(shortcut.toLowerCase());
    const definition = instruments[id];
    const range = item.range ?? definition.defaultRange;
    if (definition.ranges && (!Number.isInteger(range) || range! < 0 || range! >= definition.ranges.length)) throw new Error(`Choose a valid register for ${definition.name}.`);
    const seen = new Set<string>();
    const keys: Record<string, string> = {};
    const legacyPiano = id === 'piano' && item.range === undefined
      && Array.from({ length: 13 }, (_, index) => `note-${index}`).every(key => typeof item.keys?.[key] === 'string')
      && instrumentBindings(id).slice(13).every(binding => item.keys?.[binding.id] === undefined);
    const occupiedPianoKeys = new Set(Object.values(item.keys ?? {}).filter(key => typeof key === 'string').map(key => key.toUpperCase()));
    for (const voice of instrumentBindings(id)) {
      let raw: string | undefined = item.keys?.[voice.id];
      if (legacyPiano && raw === undefined) {
        // Add notes and octave controls around existing bindings, including custom Z/X.
        raw = [voice.key, ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'].find(key => !occupiedPianoKeys.has(key));
        if (raw) occupiedPianoKeys.add(raw);
      }
      // Add the new accent to legacy four-key maps without taking a custom binding.
      if (id === 'djembe' && voice.id === 'center-bass' && raw === undefined) {
        const used = new Set(instruments[id].voices.filter(other => other.id !== voice.id).map(other => { const key = item.keys?.[other.id]; return typeof key === 'string' ? key.toUpperCase() : undefined; }));
        raw = ['G', 'H', 'B', 'N', 'V', 'C', 'X', 'Z'].find(key => !used.has(key))!;
      }
      if (id === 'guitar' && voice.id === 'body-tap' && raw === undefined) {
        const used = new Set(Object.values(item.keys ?? {}).filter(key => typeof key === 'string').map(key => key.toUpperCase()));
        raw = ['B', 'N', 'V', 'C', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'].find(key => !used.has(key));
      }
      if (typeof raw !== 'string' || !/^[a-z0-9]$/i.test(raw)) throw new Error('Playing keys must be single letters or numbers.');
      const key = raw.toUpperCase();
      if (seen.has(key)) throw new Error(`${instruments[id].name} has duplicate playing key ${key}.`);
      seen.add(key);
      keys[voice.id] = key;
    }
    result.instruments[id] = { theme, size, ...(scale === undefined ? {} : { scale }), volume: item.volume, shortcut, keys, ...(definition.ranges ? { range } : {}) };
  }
  if (input.layout !== undefined) {
    const layout = input.layout;
    if (!layout || !Number.isFinite(layout.scale) || layout.scale < scaleLimits.min || layout.scale > scaleLimits.max) throw new Error('Instrument size must be between 50% and 200%.');
    const position = layout.position;
    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y) || !Number.isSafeInteger(position.displayId)) throw new Error('Invalid shared instrument position.');
    result.layout = { scale: layout.scale, position: { x: Math.round(position.x), y: Math.round(position.y), displayId: position.displayId } };
    setSharedAppearance(result, { scale: layout.scale });
  }
  if (!result.layout && input.positions && typeof input.positions === 'object') {
    for (const [key, point] of Object.entries(input.positions).slice(0, 100)) {
      if (new RegExp(`^(${instrumentIds.join('|')}):\\d+$`).test(key) && point && Number.isFinite(point.x) && Number.isFinite(point.y)) result.positions[key] = { x: Math.round(point.x), y: Math.round(point.y) };
    }
  }
  return result;
}

export function clampPosition(position: Position, size: { width: number; height: number }, workArea: { x: number; y: number; width: number; height: number }): Position {
  return {
    x: Math.round(Math.max(workArea.x, Math.min(position.x, workArea.x + Math.max(0, workArea.width - size.width)))),
    y: Math.round(Math.max(workArea.y, Math.min(position.y, workArea.y + Math.max(0, workArea.height - size.height)))),
  };
}
