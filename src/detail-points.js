/** Detail hotspot projection and hit testing.
 *
 * Hotspot coordinates live in garment content space (0–1 of the atlas cell),
 * but the garment only occupies a fitted rectangle inside the viewport. The
 * projection therefore has to go content -> quad -> CSS pixels; normalising
 * against the viewport instead puts every marker in the wrong place.
 */

import {contentToScreen} from './lens.js';

export const HIT_RADIUS_PX = 24;

export function projectDetails(details, {center, zoom, quad}) {
  if (!Array.isArray(details)) return [];
  return details.map(detail => {
    const [u, v] = contentToScreen([detail.x, detail.y], center, zoom);
    return {
      ...detail,
      screen: [quad.left + u * quad.width, quad.top + v * quad.height],
      inside: u >= -0.01 && u <= 1.01 && v >= -0.01 && v <= 1.01,
    };
  });
}

/** Nearest hotspot within the hit radius, in CSS pixels. */
export function hitTest(pointer, projected, {radius = HIT_RADIUS_PX} = {}) {
  if (!Array.isArray(projected) || projected.length === 0) return null;
  let best = null;
  let bestDistance = Infinity;
  for (const item of projected) {
    if (!item.inside) continue;
    const distance = Math.hypot(pointer[0] - item.screen[0], pointer[1] - item.screen[1]);
    if (distance <= radius && distance < bestDistance) {
      best = item;
      bestDistance = distance;
    }
  }
  return best;
}

export function activeDetail(details, id) {
  if (!id) return null;
  return details.find(detail => detail.id === id) || null;
}
