/** Parameterised material presets.
 *
 * A material is pure data: it never touches the DOM or WebGL. The renderer
 * reads the resolved parameter set as uniforms, so adding a fabric later is a
 * data change plus a shader path that is already reserved (sheen, anisotropy,
 * fuzz, translucency), not a renderer rewrite.
 */

export const PARAM_RANGES = {
  roughness: [0, 1],
  specular: [0, 2],
  normalStrength: [0, 2],
  frameNormalStrength: [0, 2],
  edgeNormalStrength: [0, 4],
  grainScale: [0.5, 32],
  sheen: [0, 2],
  anisotropy: [0, 1],
  envSoftbox: [0, 2],
  fuzz: [0, 1],
  translucency: [0, 1],
  displacement: [0, 1],
  creaseSharpness: [0, 1],
};

export const PRESETS = {
  leather: {
    label: '皮革',
    parameters: {
      roughness: 0.52,
      specular: 0.55,
      normalStrength: 0.32,
      frameNormalStrength: 0.38,
      edgeNormalStrength: 0.7,
      grainScale: 2.8,
      sheen: 0.0,
      anisotropy: 0.0,
      envSoftbox: 1.0,
      fuzz: 0.0,
      translucency: 0.0,
      displacement: 0.25,
      creaseSharpness: 0.85,
    },
  },
  // Reserved for later rounds; the shader already carries these channels.
  knit: {
    label: '针织',
    parameters: {
      roughness: 0.78,
      specular: 0.18,
      normalStrength: 0.9,
      frameNormalStrength: 0.5,
      edgeNormalStrength: 1.35,
      grainScale: 14.0,
      sheen: 0.7,
      anisotropy: 0.6,
      envSoftbox: 0.2,
      fuzz: 0.12,
      translucency: 0.15,
      displacement: 0.55,
      creaseSharpness: 0.3,
    },
  },
  sherpa: {
    label: '泰迪绒',
    parameters: {
      roughness: 0.92,
      specular: 0.08,
      normalStrength: 1.2,
      frameNormalStrength: 0.45,
      edgeNormalStrength: 0.9,
      grainScale: 18.0,
      sheen: 1.4,
      anisotropy: 0.0,
      envSoftbox: 0.15,
      fuzz: 0.85,
      translucency: 0.45,
      displacement: 0.8,
      creaseSharpness: 0.15,
    },
  },
};

const TINT_PATTERN = /^#[0-9a-f]{6}$/i;

export function resolveMaterial(material) {
  if (!material || typeof material !== 'object') throw new Error('Material definition is required.');
  const preset = PRESETS[material.preset];
  if (!preset) throw new Error(`Unknown material preset: ${String(material.preset)}`);
  if (!TINT_PATTERN.test(String(material.tint || ''))) throw new Error('Material tint must be #rrggbb.');

  const override = material.params;
  if (override && typeof override !== 'object') throw new Error('Material params must be an object.');
  const parameters = {...preset.parameters};
  if (override) {
    for (const [key, value] of Object.entries(override)) {
      if (!(key in PARAM_RANGES)) throw new Error(`Unknown material parameter: ${key}`);
      if (!Number.isFinite(value)) throw new Error(`Material parameter ${key} must be a finite number.`);
      const [low, high] = PARAM_RANGES[key];
      if (value < low || value > high) throw new Error(`Material parameter ${key} must be within [${low}, ${high}].`);
      parameters[key] = value;
    }
  }
  for (const [key, value] of Object.entries(parameters)) {
    const [low, high] = PARAM_RANGES[key];
    if (!Number.isFinite(value) || value < low || value > high) throw new Error(`Preset parameter ${key} is out of range.`);
  }

  return {
    label: preset.label,
    preset: material.preset,
    tint: hexToRgb(material.tint),
    grain: material.grain,
    normal: material.normal,
    parameters,
  };
}

export function hexToRgb(hex) {
  if (!TINT_PATTERN.test(String(hex || ''))) throw new Error('Colour must be #rrggbb.');
  return [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255];
}

/** Validate without building; used by the catalog contract. */
export function validateMaterial(material) {
  resolveMaterial(material);
  return material;
}
