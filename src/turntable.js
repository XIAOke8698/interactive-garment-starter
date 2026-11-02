/** Turntable mapping: drag pixels <-> turn value <-> atlas frame.
 *
 * Turn value conventions (see the design spec, section 4.2):
 *   mirror  : v ∈ [-1, 1], v = 0 is the front, |v| = 1 the side profiles
 *   no mirror: v ∈ [0, 1], v = 0 is the side profile, v = 1 the front
 * The atlas always runs profile (frame 0) -> front (last frame), so the
 * mirror case has to invert its magnitude. Getting this backwards shows the
 * garment turning away from the viewer, which reads as broken.
 */

export const MAX_SPAN_PX = 1400;
export const MIN_SPAN_PX = 240;
export const COAST_DAMPING = 0.0045;

export function turnBounds({mirror = false} = {}) {
  return mirror ? {min: -1, max: 1} : {min: 0, max: 1};
}

export function clampTurn(value, bounds) {
  if (!Number.isFinite(value)) throw new RangeError('Turn value must be a finite number.');
  return Math.min(bounds.max, Math.max(bounds.min, value));
}

/** Pixels of horizontal drag required to sweep the whole arc. */
export function dragSpan(viewportWidth) {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) throw new RangeError('Invalid viewport width.');
  return Math.min(Math.max(viewportWidth * 0.85, MIN_SPAN_PX), MAX_SPAN_PX);
}

export function unitsPerPixel(viewportWidth, bounds) {
  return (bounds.max - bounds.min) / dragSpan(viewportWidth);
}

export function dragToTurn(startTurn, deltaX, viewportWidth, bounds) {
  return clampTurn(startTurn + deltaX * unitsPerPixel(viewportWidth, bounds), bounds);
}

/** Release velocity in turn-units per millisecond, from a pointer history window. */
export function velocityFromDrag(deltaX, deltaMs, viewportWidth, bounds) {
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) return 0;
  return (deltaX * unitsPerPixel(viewportWidth, bounds)) / deltaMs;
}

export function inertiaStep(turn, velocity, deltaMs, bounds, damping = COAST_DAMPING) {
  if (!Number.isFinite(turn) || !Number.isFinite(velocity)) throw new RangeError('Invalid inertia state.');
  const dt = Math.min(Math.max(deltaMs, 0), 50);
  const decayed = velocity * Math.exp(-damping * dt);
  const next = clampTurn(turn + decayed * dt, bounds);
  const hitEdge = next === bounds.min || next === bounds.max;
  return {turn: next, velocity: hitEdge ? 0 : decayed};
}

/** Atlas cell for a turn value, including the cross-fade pair and mirror flag. */
export function frameAt(value, frameCount, {mirror = false} = {}) {
  if (!Number.isInteger(frameCount) || frameCount < 2) throw new RangeError('Invalid frame count.');
  if (!Number.isFinite(value)) throw new RangeError('Turn value must be a finite number.');
  const last = frameCount - 1;
  const magnitude = Math.min(1, Math.abs(value));
  const scaled = (mirror ? 1 - magnitude : magnitude) * last;
  const lower = Math.min(Math.floor(scaled), last);
  const upper = Math.min(lower + 1, last);
  return {lower, upper, mix: scaled - lower, flip: mirror && value < 0};
}

/** Human-readable zone for the aria-live announcement. */
export function turnZone(value, {mirror = false} = {}) {
  if (!mirror) return value >= 0.92 ? '正面' : value <= 0.12 ? '侧影' : '转角中';
  if (value > -0.12 && value < 0.12) return '正面';
  if (value > 0.88) return '左侧影';
  if (value < -0.88) return '右侧影';
  return value > 0 ? '转向左侧影' : '转向右侧影';
}

export function keyboardStep(current, direction, {fine = false, bounds}) {
  const degrees = fine ? 3 : 15;
  // One unit of turn covers 90° on a plain arc and 180° once mirrored, so the
  // degrees-to-units conversion has to follow the active bounds.
  const arc = (bounds.max - bounds.min) * 90;
  return clampTurn(current + direction * (degrees / arc), bounds);
}
