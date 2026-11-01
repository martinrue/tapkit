import { instruments, overlayDimensions, instrumentScale, scaleLimits, type InstrumentId, type Position, type Settings, type SharedLayout } from './model';
import { loopDockHeight } from './loops';
import { clampPosition } from './settings';

export interface Bounds extends Position { width: number; height: number }
export interface ResizeOrigin { bounds: Bounds; pointer: Position; scale: number; workArea: Bounds }

export function sharedPosition(bounds: Bounds, display: { id: number; workArea: Bounds }): SharedLayout['position'] {
  return { displayId: display.id, x: bounds.x + bounds.width - display.workArea.x, y: bounds.y - display.workArea.y };
}

/** Different silhouettes share a stable top-right corner, without clamping the saved anchor. */
export function positionAtAnchor(anchor: Position, dimensions: { width: number; height: number }, area: Bounds): Position {
  return clampPosition({ x: area.x + anchor.x - dimensions.width, y: area.y + anchor.y }, dimensions, area);
}

/** First summon adopts that instrument's old placement and size, then all instruments follow it. */
export function initialSharedLayout(settings: Settings, id: InstrumentId, display: { id: number; workArea: Bounds }): SharedLayout {
  const scale = instrumentScale(settings.instruments[id]);
  const dimensions = overlayDimensions(id, fitInstrumentScale(id, scale, display.workArea));
  const legacy = settings.positions[`${id}:${display.id}`];
  return { scale, position: legacy ? sharedPosition({ ...legacy, ...dimensions }, display) : { displayId: display.id, x: display.workArea.width - 24, y: 20 } };
}

export function fitInstrumentScale(id: InstrumentId, requested: number, area: Bounds): number {
  const { width, height } = instruments[id];
  const maximum = Math.max(scaleLimits.min, Math.min(scaleLimits.max, area.width / width, (area.height - loopDockHeight) / height));
  return Math.max(scaleLimits.min, Math.min(maximum, requested));
}

/** Lower-left grip, opposite top-right anchor. Project the drag onto the aspect diagonal. */
export function resizeInstrument(id: InstrumentId, origin: ResizeOrigin, point: Position) {
  const { width, height } = instruments[id];
  const dx = point.x - origin.pointer.x, dy = point.y - origin.pointer.y;
  const requested = origin.scale + (-dx * width + dy * height) / (width * width + height * height);
  // Round down after fitting so rounding cannot exceed a display edge.
  const scale = Math.floor(fitInstrumentScale(id, requested, origin.workArea) * 10000) / 10000;
  const dimensions = overlayDimensions(id, scale);
  const position = clampPosition({ x: origin.bounds.x + origin.bounds.width - dimensions.width, y: origin.bounds.y }, dimensions, origin.workArea);
  return { ...position, ...dimensions, scale };
}
