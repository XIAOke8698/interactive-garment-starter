import {MaterialStage, LIGHT_MODES} from './webgl-stage.js';
import {validateCatalog, validateManifest} from './catalog.js';
import {resolveMaterial} from './material-library.js';
import {hitTest, projectDetails, activeDetail} from './detail-points.js';
import {
  turnBounds, clampTurn, dragToTurn, velocityFromDrag, inertiaStep,
  frameAt, turnZone, keyboardStep,
} from './turntable.js';
import {
  clampZoom, clampCenter, zoomAt, panBy, resetView, zoomFromWheel, isAtRestView,
} from './lens.js';

const $ = selector => document.querySelector(selector);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const IDLE_MS = 3000;

const state = {
  turn: 0,
  velocity: 0,
  zoom: 1,
  center: [0.5, 0.5],
  pointer: [0, 0],
  drag: null,
  bounds: turnBounds({mirror: false}),
  lastInput: performance.now(),
  time: 0,
  ready: false,
  detailId: null,
};

let stage = null;
let item = null;
let material = null;
let manifest = null;
let projectedDetails = [];
let lastFrameTime = 0;
let rafId = 0;

const canvas = $('#stage-canvas');
const detailLayer = $('#detail-layer');

function announce(message) {
  const live = $('#live');
  if (live) live.textContent = message;
}

function markActivity() {
  state.lastInput = performance.now();
  document.body.classList.remove('idle');
}

function updateIdle() {
  if (performance.now() - state.lastInput > IDLE_MS) document.body.classList.add('idle');
}

function cssSize() {
  return {width: canvas.clientWidth || innerWidth, height: canvas.clientHeight || innerHeight};
}

function pointerToNormalised(event) {
  const rect = canvas.getBoundingClientRect();
  return [
    (event.clientX - rect.left) / rect.width,
    (event.clientY - rect.top) / rect.height,
  ];
}

function currentFrame() {
  return frameAt(state.turn, manifest.frameCount, {mirror: item.mirror === true});
}

function draw() {
  if (!stage || !state.ready) return;
  const frame = currentFrame();
  stage.render({
    frameLower: frame.lower,
    frameUpper: frame.upper,
    mix: frame.mix,
    flip: frame.flip,
    zoom: state.zoom,
    center: state.center,
    material,
    pointer: state.pointer,
    time: state.time,
  });
  positionDetails(frame);
}

function positionDetails(frame) {
  // A mirrored garment draws x' = 1 - x, so hotspots have to follow the same
  // reflection or the cuff marker ends up on the opposite side of the shirt.
  const details = (item.details || []).map(detail => (
    frame.flip ? {...detail, x: 1 - detail.x} : detail
  ));
  // The detail coordinates describe the front view. Once the garment turns far
  // enough away, markers would float beside a profile silhouette, so they are
  // gated on how close the turntable is to front.
  const mirrored = item.mirror === true;
  const frontness = mirrored ? 1 - Math.abs(state.turn) : state.turn;
  const detailsVisible = frontness > 0.75;

  const {width, height} = cssSize();
  const quad = stage.quadCss(width, height);
  projectedDetails = projectDetails(details, {center: state.center, zoom: state.zoom, quad});
  for (const detail of projectedDetails) {
    const node = detailLayer.querySelector(`[data-detail="${detail.id}"]`);
    if (!node) continue;
    node.hidden = !detailsVisible || !detail.inside;
    node.style.left = `${detail.screen[0]}px`;
    node.style.top = `${detail.screen[1]}px`;
  }
  detailLayer.style.visibility = detailsVisible ? 'visible' : 'hidden';
}

function pointerToPixels(event) {
  const rect = canvas.getBoundingClientRect();
  return [event.clientX - rect.left, event.clientY - rect.top];
}

function buildDetailNodes() {
  detailLayer.textContent = '';
  for (const detail of item.details || []) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'hotspot';
    button.dataset.detail = detail.id;
    button.setAttribute('aria-label', `查看${detail.label}细节`);
    const dot = document.createElement('span');
    dot.className = 'hotspot-dot';
    dot.setAttribute('aria-hidden', 'true');
    button.append(dot);
    button.addEventListener('click', event => {
      event.stopPropagation();
      openDetail(detail.id);
    });
    detailLayer.append(button);
  }
}

function openDetail(id) {
  const detail = activeDetail(item.details || [], id);
  if (!detail) return;
  state.detailId = id;
  markActivity();
  $('#detail-title').textContent = detail.label;
  $('#detail-note').textContent = detail.note || '';
  $('#detail-image').src = new URL('../public/' + detail.crop, import.meta.url).href;
  $('#detail-image').alt = `${item.name} 的${detail.label}特写`;
  $('#detail-source').textContent = detail.source ? `素材来源：${detail.source}` : '';
  $('#detail-panel').classList.add('open');
  $('#detail-panel').setAttribute('aria-hidden', 'false');
  announce(`已打开${detail.label}细节`);
  $('#detail-close').focus();
}

function closeDetail() {
  state.detailId = null;
  $('#detail-panel').classList.remove('open');
  $('#detail-panel').setAttribute('aria-hidden', 'true');
}

function setLight(mode) {
  if (!stage) return;
  stage.setLight(mode);
  for (const button of document.querySelectorAll('[data-light]')) {
    button.setAttribute('aria-pressed', String(button.dataset.light === mode));
  }
  announce(`光位：${LIGHT_MODES[mode].label}`);
  markActivity();
  if (reduced.matches) draw();
}

function applyZoom(next) {
  const result = zoomAt({pointer: state.pointer, center: state.center, zoom: state.zoom, nextZoom: next});
  state.zoom = result.zoom;
  state.center = result.center;
  document.body.classList.toggle('zoomed', !isAtRestView(state.zoom));
}

function loop(now) {
  const delta = lastFrameTime ? Math.min(50, now - lastFrameTime) : 0;
  lastFrameTime = now;
  let moving = false;

  if (!reduced.matches) {
    state.time += delta / 1000;
    moving = true;
  }

  if (Math.abs(state.velocity) > 0.00002) {
    const next = inertiaStep(state.turn, state.velocity, delta, state.bounds);
    state.turn = next.turn;
    state.velocity = next.velocity;
    if (Math.abs(state.velocity) > 0.001) moving = true;
  }

  draw();
  updateIdle();
  if (moving || !reduced.matches) rafId = requestAnimationFrame(loop);
  else rafId = 0;
}

function wake() {
  if (!rafId && !document.hidden) rafId = requestAnimationFrame(loop);
}

canvas.addEventListener('pointerdown', event => {
  if (!state.ready || event.button !== 0) return;
  markActivity();
  const pointer = pointerToNormalised(event);
  state.drag = {
    id: event.pointerId,
    mode: isAtRestView(state.zoom) ? 'turn' : 'pan',
    startTurn: state.turn,
    lastX: event.clientX,
    lastY: event.clientY,
    lastTime: performance.now(),
    totalX: 0,
  };
  state.velocity = 0;
  canvas.setPointerCapture(event.pointerId);
  document.body.classList.add('dragging');
});

canvas.addEventListener('pointermove', event => {
  const {width, height} = cssSize();
  const pointer = pointerToNormalised(event);
  state.pointer = [pointer[0] - 0.5, pointer[1] - 0.5];

  if (!state.drag) {
    if (reduced.matches) draw();
    return;
  }
  if (event.pointerId !== state.drag.id) return;
  markActivity();

  const now = performance.now();
  const deltaX = event.clientX - state.drag.lastX;
  const deltaY = event.clientY - state.drag.lastY;
  state.drag.lastX = event.clientX;
  state.drag.lastY = event.clientY;
  state.drag.totalX += deltaX;

  if (state.drag.mode === 'turn') {
    state.turn = dragToTurn(state.drag.startTurn, state.drag.totalX, width, state.bounds);
    state.velocity = velocityFromDrag(deltaX, now - state.drag.lastTime, width, state.bounds) * 0.55;
  } else {
    const next = panBy({
      center: state.center,
      zoom: state.zoom,
      delta: [deltaX / width, deltaY / height],
    });
    state.center = next.center;
  }
  state.drag.lastTime = now;
  if (reduced.matches) draw();
});

function endDrag(event) {
  if (!state.drag || event.pointerId !== state.drag.id) return;
  const wasTurn = state.drag.mode === 'turn';
  state.drag = null;
  document.body.classList.remove('dragging');
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  if (wasTurn) {
    if (reduced.matches) {
      state.velocity = 0;
      draw();
    } else {
      wake();
    }
    announce(`转台：${turnZone(state.turn, {mirror: item.mirror === true})}`);
  }
}

canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('pointerleave', () => {
  state.pointer = [0, 0];
  if (reduced.matches) draw();
});

canvas.addEventListener('wheel', event => {
  if (!state.ready) return;
  event.preventDefault();
  markActivity();
  applyZoom(zoomFromWheel(state.zoom, event.deltaY));
  if (reduced.matches) draw();
}, {passive: false});

canvas.addEventListener('click', event => {
  if (!state.ready) return;
  const hit = hitTest(pointerToPixels(event), projectedDetails);
  if (hit) openDetail(hit.id);
});

canvas.addEventListener('dblclick', () => {
  const view = resetView();
  state.zoom = view.zoom;
  state.center = view.center;
  document.body.classList.remove('zoomed');
  wake();
});

for (const button of document.querySelectorAll('[data-light]')) {
  button.addEventListener('click', () => setLight(button.dataset.light));
}
$('#detail-close').addEventListener('click', closeDetail);

addEventListener('keydown', event => {
  if (!state.ready) return;
  if (event.key === 'Escape') {
    if (state.detailId) { closeDetail(); return; }
    const view = resetView();
    state.zoom = view.zoom;
    state.center = view.center;
    document.body.classList.remove('zoomed');
    wake();
    return;
  }
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    state.turn = keyboardStep(state.turn, event.key === 'ArrowRight' ? 1 : -1, {
      fine: event.shiftKey, bounds: state.bounds,
    });
    state.velocity = 0;
    markActivity();
    announce(`转台：${turnZone(state.turn, {mirror: item.mirror === true})}`);
    if (reduced.matches) draw(); else wake();
    return;
  }
  if (event.key === '+' || event.key === '=' || event.key === '-') {
    event.preventDefault();
    applyZoom(clampZoom(state.zoom + (event.key === '-' ? -0.25 : 0.25)));
    if (reduced.matches) draw(); else wake();
    return;
  }
  const lightKeys = {1: 'front', 2: 'side', 3: 'back'};
  if (lightKeys[event.key]) setLight(lightKeys[event.key]);
});

function handleResize() {
  const {width, height} = cssSize();
  stage.resize(width, height, Math.min(devicePixelRatio || 1, 2));
  draw();
}

addEventListener('resize', () => {
  if (!stage) return;
  handleResize();
});

reduced.addEventListener('change', () => {
  if (reduced.matches) {
    cancelAnimationFrame(rafId);
    rafId = 0;
    draw();
  } else wake();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    cancelAnimationFrame(rafId);
    rafId = 0;
    lastFrameTime = 0;
  } else wake();
});

function loadImage(url) {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.src = url;
  return image.decode().then(() => image);
}

function showFallback(message) {
  $('#stage-fallback').hidden = false;
  $('#stage-fallback-message').textContent = message;
  document.body.classList.add('fallback');
}

function fillInfo() {
  $('#garment-name').textContent = item.name;
  $('#garment-type').textContent = [item.type, item.color].filter(Boolean).join(' · ');
  $('#material-label').textContent = material.label;
  const fabric = item.fabric || {};
  const rows = [
    ['成分', fabric.composition],
    ['克重', fabric.weightGsm ? `${fabric.weightGsm} gsm` : null],
    ['厚度', fabric.thickness],
    ['表面处理', fabric.finish],
    ['垂感', fabric.drape],
    ['护理', fabric.care],
  ].filter(([, value]) => value);
  const list = $('#spec-list');
  list.textContent = '';
  for (const [label, value] of rows) {
    const row = document.createElement('div');
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = label;
    dd.textContent = value;
    row.append(dt, dd);
    list.append(row);
  }
}

async function boot() {
  try {
    const response = await fetch(new URL('../config/catalog.json', import.meta.url));
    if (!response.ok) throw new Error('Catalog not found.');
    const catalog = validateCatalog(await response.json());
    const stageId = catalog.stage?.item || catalog.items[0].id;
    item = catalog.items.find(entry => entry.id === stageId);
    if (!item) throw new Error('Stage item is missing from the catalog.');
    if (!item.material) throw new Error('Stage item has no material definition.');
    material = resolveMaterial(item.material);

    const manifestUrl = new URL('../public/' + item.motion, import.meta.url);
    const manifestResponse = await fetch(manifestUrl);
    if (!manifestResponse.ok) throw new Error('Motion manifest not found.');
    manifest = validateManifest(await manifestResponse.json());

    state.bounds = turnBounds({mirror: item.mirror === true});
    state.turn = item.mirror === true ? 0 : 1;

    if (document.title && catalog.title) document.title = `${item.name} · ${catalog.title}`;
    document.querySelectorAll('[data-brand]').forEach(node => {
      if (catalog.title) node.textContent = catalog.title;
    });
    if (catalog.subtitle) $('#stage-kicker').textContent = catalog.subtitle;

    try {
      stage = new MaterialStage(canvas);
    } catch (error) {
      showFallback(error.message);
      return;
    }

    const assetUrl = file => new URL(file, new URL('../public/' + item.motion, import.meta.url)).href;
    const publicUrl = file => new URL('../public/' + file, import.meta.url).href;

    const [atlasImage, grainImage, normalImage] = await Promise.all([
      loadImage(assetUrl(manifest.atlas)),
      loadImage(publicUrl(item.material.grain)),
      loadImage(publicUrl(item.material.normal)),
    ]);

    const expectedWidth = manifest.width * manifest.columns;
    const expectedHeight = manifest.height * Math.ceil(manifest.frameCount / manifest.columns);
    if (atlasImage.naturalWidth !== expectedWidth || atlasImage.naturalHeight !== expectedHeight) {
      throw new Error('Atlas dimensions do not match the manifest.');
    }

    stage.setAtlas(atlasImage, manifest);
    stage.setMaterialTextures(grainImage, normalImage);
    handleResize();

    buildDetailNodes();
    fillInfo();
    setLight('front');
    state.ready = true;
    document.documentElement.dataset.ready = 'true';
    document.body.classList.remove('loading');
    announce(`${item.name} 已就绪，${material.label}，拖拽可转向`);
    wake();
  } catch (error) {
    showFallback(error.message);
    console.error(error);
  }
}

boot();
