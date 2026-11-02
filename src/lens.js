/** View transform for the immersive stage: pointer-anchored zoom and clamping.
 *
 * Content coordinates are the garment image's own [0,1] UV space. Screen
 * coordinates are [0,1] across the canvas. The mapping is
 *   screen = (content - center) * zoom + 0.5
 * so `center` is the content point sitting at the middle of the viewport.
 */

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 3;
export const EDGE_SLACK = 12;

export function clampZoom(zoom) {
  if (!Number.isFinite(zoom)) throw new RangeError('Zoom must be finite.');
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/** Keep the content covering the viewport once zoomed in. */
export function clampCenter(center, zoom) {
  const half = 0.5 / zoom;
  return [Math.min(1 - half, Math.max(half, center[0])), Math.min(1 - half, Math.max(half, center[1]))];
}

export function contentToScreen(point, center, zoom) {
  return [(point[0] - center[0]) * zoom + 0.5, (point[1] - center[1]) * zoom + 0.5];
}

export function screenToContent(point, center, zoom) {
  return [(point[0] - 0.5) / zoom + center[0], (point[1] - 0.5) / zoom + center[1]];
}

/** Zoom while holding the content point under the pointer perfectly still. */
export function zoomAt({pointer, center, zoom, nextZoom}) {
  const target = clampZoom(nextZoom);
  const anchor = screenToContent(pointer, center, zoom);
  const nextCenter = [anchor[0] - (pointer[0] - 0.5) / target, anchor[1] - (pointer[1] - 0.5) / target];
  return {zoom: target, center: clampCenter(nextCenter, target)};
}

/** Drag the viewport; `delta` is in normalised screen units. */
export function panBy({center, zoom, delta}) {
  const nextCenter = [center[0] - delta[0] / zoom, center[1] - delta[1] / zoom];
  return {zoom, center: clampCenter(nextCenter, zoom)};
}

export function resetView() {
  return {zoom: MIN_ZOOM, center: [0.5, 0.5]};
}

/** Wheel delta to zoom, tuned so one notch is a perceptible but small step. */
export function zoomFromWheel(zoom, deltaY) {
  return clampZoom(zoom * Math.exp(-deltaY * 0.0012));
}

/** True when the view is fully zoomed out, so a drag should turn instead of pan. */
export function isAtRestView(zoom) {
  return zoom <= MIN_ZOOM + 1e-6;
}
