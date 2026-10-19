export function localAsset(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.startsWith('/') || value.split('/').includes('..') || /^[a-z]+:/i.test(value)) throw new Error('Use a relative asset path inside public/.');
  return value;
}
export function validateCatalog(data) {
  if (!data || !Array.isArray(data.items) || data.items.length < 1 || data.items.length > 12) throw new Error('Catalog must have 1–12 items.');
  const ids = new Set();
  for (const item of data.items) {
    if (!/^[a-z0-9-]+$/.test(item.id) || ids.has(item.id) || typeof item.name !== 'string' || !item.name.trim()) throw new Error('Each item needs a unique safe ID and a name.');
    ids.add(item.id);localAsset(item.motion);
    if (item.back) localAsset(item.back);
    if (item.productUrl && !/^https:\/\//.test(item.productUrl)) throw new Error('Product links must use HTTPS.');
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
