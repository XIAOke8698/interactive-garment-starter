import {validateMaterial} from './material-library.js';

export function localAsset(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.startsWith('/') || value.split('/').includes('..') || /^[a-z]+:/i.test(value)) throw new Error('Use a relative asset path inside public/.');
  return value;
}
const MAX_DETAILS = 8;
function validateFabric(fabric) {
  if (!fabric || typeof fabric !== 'object') throw new Error('Fabric must be an object.');
  if (typeof fabric.composition !== 'string' || !fabric.composition.trim()) throw new Error('Fabric needs a composition.');
  if (!Number.isFinite(fabric.weightGsm) || fabric.weightGsm < 0 || fabric.weightGsm > 5000) throw new Error('Fabric weight must be between 0 and 5000 gsm.');
  for (const key of ['thickness', 'finish', 'drape', 'care']) {
    if (fabric[key] !== undefined && typeof fabric[key] !== 'string') throw new Error(`Fabric ${key} must be a string.`);
  }
  return fabric;
}
function validateDetails(details) {
  if (!Array.isArray(details) || details.length < 1 || details.length > MAX_DETAILS) throw new Error(`Details must list 1–${MAX_DETAILS} entries.`);
  const ids = new Set();
  for (const detail of details) {
    if (!detail || typeof detail !== 'object') throw new Error('Each detail must be an object.');
    if (!/^[a-z0-9-]+$/.test(detail.id || '') || ids.has(detail.id)) throw new Error('Each detail needs a unique safe ID.');
    ids.add(detail.id);
    if (typeof detail.label !== 'string' || !detail.label.trim()) throw new Error('Each detail needs a label.');
    for (const axis of ['x', 'y']) {
      if (!Number.isFinite(detail[axis]) || detail[axis] < 0 || detail[axis] > 1) throw new Error(`Detail ${detail.id} needs a ${axis} between 0 and 1.`);
    }
    localAsset(detail.crop);
    if (detail.note !== undefined && typeof detail.note !== 'string') throw new Error('Detail note must be a string.');
  }
  return details;
}
export function validateCatalog(data) {
  if (!data || !Array.isArray(data.items) || data.items.length < 1 || data.items.length > 12) throw new Error('Catalog must have 1–12 items.');
  const ids = new Set();
  for (const item of data.items) {
    if (!/^[a-z0-9-]+$/.test(item.id) || ids.has(item.id) || typeof item.name !== 'string' || !item.name.trim()) throw new Error('Each item needs a unique safe ID and a name.');
    ids.add(item.id);localAsset(item.motion);
    if (item.back) localAsset(item.back);
    if (item.productUrl && !/^https:\/\//.test(item.productUrl)) throw new Error('Product links must use HTTPS.');
    if (item.mirror !== undefined && typeof item.mirror !== 'boolean') throw new Error('Mirror must be a boolean.');
    if (item.material) {
      validateMaterial(item.material);
      localAsset(item.material.grain);localAsset(item.material.normal);
    }
    if (item.fabric) validateFabric(item.fabric);
    if (item.details) validateDetails(item.details);
    if (item.mirror === true && item.details) {
      // Mirroring reflects the garment, so hotspot coordinates would no longer
      // match the drawn pixels on the mirrored half. Guard rather than guess.
      for (const detail of item.details) {
        if (detail.mirrorSafe === false) throw new Error(`Detail ${detail.id} cannot be used with a mirrored garment.`);
      }
    }
  }
  if (data.stage !== undefined) {
    if (!data.stage || typeof data.stage !== 'object') throw new Error('Stage must be an object.');
    if (!ids.has(data.stage.item)) throw new Error('Stage item must reference an existing catalog item.');
  }
  const t = data.timing;
  if (!t || !Number.isFinite(t.intentMs) || t.intentMs < 0 || t.intentMs > 500 || !Number.isFinite(t.turnMs) || t.turnMs < 100 || t.turnMs > 2000 || !Number.isFinite(t.returnMs) || t.returnMs < 100 || t.returnMs > 2000 || !Number.isFinite(t.endpointWindow) || t.endpointWindow < 0 || t.endpointWindow > .5) throw new Error('Invalid timing settings.');
  return data;
}
export function validateManifest(m) {
  if (!m || !Number.isInteger(m.frameCount) || m.frameCount < 2 || m.frameCount > 120 || !Number.isInteger(m.width) || m.width < 32 || m.width > 1024 || !Number.isInteger(m.height) || m.height < 32 || m.height > 1024 || !Number.isInteger(m.columns) || m.columns < 1 || m.columns > m.frameCount) throw new Error('Invalid frame manifest dimensions.');
  localAsset(m.atlas);localAsset(m.profile);localAsset(m.front);
  if (m.frameCount*m.width*m.height > 32_000_000) throw new Error('Atlas exceeds this starter\'s decode budget.');
  return m;
}
