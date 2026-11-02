import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

import {
  turnBounds, clampTurn, dragSpan, dragToTurn, velocityFromDrag,
  inertiaStep, frameAt, turnZone, keyboardStep,
} from '../src/turntable.js';
import {
  clampZoom, clampCenter, contentToScreen, screenToContent, zoomAt, panBy, zoomFromWheel,
} from '../src/lens.js';
import {resolveMaterial, validateMaterial, PRESETS, PARAM_RANGES} from '../src/material-library.js';
import {projectDetails, hitTest, activeDetail} from '../src/detail-points.js';
import {validateCatalog} from '../src/catalog.js';

test('mirrored turns put the front at zero and the profiles at the extremes', () => {
  const mirror = {mirror: true};
  assert.equal(frameAt(0, 30, mirror).lower, 29, 'v=0 must be the front frame');
  assert.equal(frameAt(1, 30, mirror).lower, 0, 'v=1 must be the profile frame');
  assert.equal(frameAt(-1, 30, mirror).lower, 0);
  assert.equal(frameAt(1, 30, mirror).flip, false);
  assert.equal(frameAt(-1, 30, mirror).flip, true, 'the negative half is mirrored');
  assert.equal(frameAt(-0.5, 30, mirror).flip, true);
});

test('plain arcs run profile to front and never mirror', () => {
  assert.equal(frameAt(0, 30).lower, 0);
  assert.equal(frameAt(1, 30).lower, 29);
  assert.equal(frameAt(0.5, 30).flip, false);
  assert.equal(frameAt(-0.4, 30).flip, false, 'a plain arc clamps rather than mirroring');
  assert.deepEqual(frameAt(0.5, 30), {lower: 14, upper: 15, mix: 0.5, flip: false});
});

test('drag mapping sweeps the whole arc over one span and clamps at the ends', () => {
  const bounds = turnBounds({mirror: true});
  const span = dragSpan(1000);
  assert.equal(span, 850);
  assert.equal(dragToTurn(0, span, 1000, bounds), 1);
  assert.equal(dragToTurn(0, -span, 1000, bounds), -1);
  assert.equal(dragToTurn(0, span * 4, 1000, bounds), 1, 'overshoot must clamp');
  assert.equal(dragToTurn(0, 0, 1000, bounds), 0);
  assert.equal(clampTurn(0.4, turnBounds()), 0.4);
  assert.throws(() => clampTurn(NaN, bounds), RangeError);
});

test('release velocity is bounded and inertia stops dead at the edge', () => {
  const bounds = turnBounds({mirror: true});
  const velocity = velocityFromDrag(20, 16, 1000, bounds);
  assert.ok(velocity > 0);
  assert.equal(velocityFromDrag(20, 0, 1000, bounds), 0, 'a zero time window cannot divide by zero');

  let turn = 0;
  let speed = 0.02;
  let steps = 0;
  while (Math.abs(speed) > 1e-6 && steps < 5000) {
    const next = inertiaStep(turn, speed, 16, bounds);
    turn = next.turn;
    speed = next.velocity;
    steps += 1;
    assert.ok(Number.isFinite(turn) && turn >= -1 && turn <= 1);
  }
  assert.ok(steps < 5000, 'inertia must decay, not spin forever');
  if (turn === 1 || turn === -1) assert.equal(speed, 0, 'hitting an edge kills the velocity');
});

test('keyboard steps follow the active arc width', () => {
  const plain = turnBounds();
  const mirror = turnBounds({mirror: true});
  assert.equal(keyboardStep(0.5, 1, {bounds: plain}), 0.5 + 15 / 90);
  assert.equal(keyboardStep(0, 1, {bounds: mirror}), 0 + 15 / 180);
  assert.equal(keyboardStep(0, 1, {bounds: mirror, fine: true}), 3 / 180);
  assert.equal(keyboardStep(1, 1, {bounds: plain}), 1, 'clamped at the end');
});

test('turn zones describe the visible side for announcements', () => {
  assert.equal(turnZone(1), '正面');
  assert.equal(turnZone(0), '侧影');
  assert.equal(turnZone(0, {mirror: true}), '正面');
  assert.equal(turnZone(0.95, {mirror: true}), '左侧影');
  assert.equal(turnZone(-0.95, {mirror: true}), '右侧影');
});

test('zoom clamping, anchoring and panning stay inside the content', () => {
  assert.equal(clampZoom(0.2), 1);
  assert.equal(clampZoom(9), 3);
  assert.throws(() => clampZoom(NaN), RangeError);

  const center = [0.5, 0.5];
  const zoom = 1.4;
  const pointer = [0.32, 0.78];
  const anchorBefore = screenToContent(pointer, center, zoom);
  const moved = zoomAt({pointer, center, zoom, nextZoom: 2.6});
  const anchorAfter = screenToContent(pointer, moved.center, moved.zoom);
  assert.ok(Math.abs(anchorBefore[0] - anchorAfter[0]) < 1e-9, 'pointer anchor must not drift in x');
  assert.ok(Math.abs(anchorBefore[1] - anchorAfter[1]) < 1e-9, 'pointer anchor must not drift in y');

  const clamped = clampCenter([0.1, 0.9], 2);
  assert.deepEqual(clamped, [0.25, 0.75]);

  const panned = panBy({center: [0.5, 0.5], zoom: 2, delta: [0.1, -0.1]});
  assert.deepEqual(panned.center, [0.45, 0.55]);

  assert.ok(zoomFromWheel(1.5, -100) > 1.5);
  assert.ok(zoomFromWheel(1.5, 100) < 1.5);
  assert.ok(Math.abs(contentToScreen([0.5, 0.5], [0.5, 0.5], 2)[0] - 0.5) < 1e-12);
});

test('material presets resolve, and bad parameters fail loudly', () => {
  const resolved = resolveMaterial({preset: 'leather', tint: '#42301f'});
  assert.equal(resolved.label, '皮革');
  assert.deepEqual(resolved.tint.map(value => Math.round(value * 255)), [0x42, 0x30, 0x1f]);
  assert.equal(resolved.parameters.roughness, PRESETS.leather.parameters.roughness);

  const overridden = resolveMaterial({preset: 'leather', tint: '#42301f', params: {roughness: 0.9}});
  assert.equal(overridden.parameters.roughness, 0.9);
  assert.equal(overridden.parameters.grainScale, PRESETS.leather.parameters.grainScale);

  assert.throws(() => resolveMaterial({preset: 'leather', tint: '#42301f', params: {roughnes: 0.5}}), /Unknown material parameter/, 'a typo must not silently do nothing');
  assert.throws(() => resolveMaterial({preset: 'leather', tint: '#42301f', params: {roughness: 9}}), /within/);
  assert.throws(() => resolveMaterial({preset: 'leather', tint: 'brown'}), /tint/);
  assert.throws(() => resolveMaterial({preset: 'nope', tint: '#42301f'}), /Unknown material preset/);

  for (const [key, value] of Object.entries(PRESETS.leather.parameters)) {
    const [low, high] = PARAM_RANGES[key];
    assert.ok(value >= low && value <= high, `${key} preset value must be inside its declared range`);
  }
  for (const preset of ['knit', 'sherpa']) {
    assert.doesNotThrow(() => validateMaterial({preset, tint: '#888888'}), `${preset} must stay usable for later rounds`);
  }
});

test('detail projection follows the garment quad, not the viewport', () => {
  const quad = {left: 100, top: 50, width: 400, height: 600};
  const details = [
    {id: 'center', label: '中', x: 0.5, y: 0.5, crop: 'fixtures/tee/details/collar.webp'},
    {id: 'edge', label: '角', x: 0, y: 0, crop: 'fixtures/tee/details/collar.webp'},
    {id: 'outside', label: '外', x: 0.05, y: 0.5, crop: 'fixtures/tee/details/collar.webp'},
  ];
  const projected = projectDetails(details, {center: [0.5, 0.5], zoom: 1, quad});
  assert.deepEqual(projected[0].screen, [300, 350]);
  assert.deepEqual(projected[1].screen, [100, 50]);
  assert.equal(projected[2].inside, true, 'at 1x the whole content is visible');

  const zoomed = projectDetails(details, {center: [0.5, 0.5], zoom: 2, quad});
  assert.deepEqual(zoomed[0].screen, [300, 350], 'centre stays put while zooming');
  assert.equal(zoomed[2].inside, false, 'zooming pushes a corner point off the quad');

  assert.equal(hitTest([305, 352], projected).id, 'center');
  assert.equal(hitTest([600, 352], projected), null, 'a far click hits nothing');
  assert.equal(activeDetail(details, 'edge').label, '角');
  assert.equal(activeDetail(details, 'missing'), null);
});

test('the catalog contract accepts the real file and rejects malformed materials', async () => {
  const catalog = JSON.parse(await readFile(new URL('../config/catalog.json', import.meta.url), 'utf8'));
  assert.doesNotThrow(() => validateCatalog(catalog));
  assert.equal(catalog.stage.item, 'tee');

  const stageItem = catalog.items.find(entry => entry.id === 'tee');
  assert.ok(stageItem.material, 'the staged item must carry a material');
  assert.ok(stageItem.details.length >= 3);

  const clone = structuredClone(catalog);
  clone.items[0].mirror = 'yes';
  assert.throws(() => validateCatalog(clone), /boolean/);

  const badTint = structuredClone(catalog);
  badTint.items[0].material.tint = '#12345';
  assert.throws(() => validateCatalog(badTint), /tint|rrggbb/i);

  const badCrop = structuredClone(catalog);
  badCrop.items[0].details[0].crop = '../private/collar.webp';
  assert.throws(() => validateCatalog(badCrop), /relative asset path/);

  const badCoord = structuredClone(catalog);
  badCoord.items[0].details[0].x = 1.4;
  assert.throws(() => validateCatalog(badCoord), /between 0 and 1/);

  const badStage = structuredClone(catalog);
  badStage.stage.item = 'ghost';
  assert.throws(() => validateCatalog(badStage), /existing catalog item/);

  const tooMany = structuredClone(catalog);
  tooMany.items[0].details = Array.from({length: 9}, (_, i) => ({
    id: `d${i}`, label: 'x', x: 0.5, y: 0.5, crop: 'fixtures/tee/details/collar.webp',
  }));
  assert.throws(() => validateCatalog(tooMany), /1–8 entries/);
});
