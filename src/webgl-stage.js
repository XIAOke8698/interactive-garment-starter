/** WebGL2 material renderer for the immersive stage.
 *
 * One context, one viewport, one draw call per frame. Everything visual that
 * the source footage cannot provide — fabric grain, specular response, the
 * studio softbox reflection, cloth micro-motion — is synthesised here on top of
 * the flat atlas frames.
 *
 * If WebGL2 is unavailable the caller falls back to the static rack page; this
 * module never silently renders garbage.
 */

const VERTEX_SOURCE = `#version 300 es
precision highp float;
in vec2 aPosition;
out vec2 vUv;
void main(){
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const FRAGMENT_SOURCE = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 outColor;

uniform sampler2D uAtlas;
uniform sampler2D uGrain;
uniform sampler2D uNormal;

uniform vec2 uCanvas;
uniform vec2 uQuadCenter;
uniform vec2 uQuadBaseSize;
uniform vec2 uCellSize;
uniform vec2 uOriginLower;
uniform vec2 uOriginUpper;
uniform vec2 uAtlasSize;
uniform float uMix;
uniform float uFlip;
uniform vec2 uCenter;
uniform float uZoom;

uniform vec3 uTint;
uniform float uGrainScale;
uniform float uRoughness;
uniform float uSpecular;
uniform float uNormalStrength;
uniform float uFrameNormalStrength;
uniform float uEdgeNormalStrength;
uniform float uSheen;
uniform float uAnisotropy;
uniform float uEnvSoftbox;
uniform float uFuzz;
uniform float uTranslucency;
uniform float uDisplacement;
uniform float uCreaseSharpness;

uniform vec3 uLightDir;
uniform vec2 uPointer;
uniform vec2 uApex;
uniform float uTime;

uniform vec3 uBackdropTop;
uniform vec3 uBackdropBottom;

const float PI = 3.14159265359;

vec3 decodeNormal(vec3 sampleColor){
  return normalize(sampleColor * 2.0 - 1.0);
}

float distributionGGX(vec3 n, vec3 h, float roughness){
  float a = max(roughness * roughness, 1e-3);
  float a2 = a * a;
  float nDotH = max(dot(n, h), 0.0);
  float d = nDotH * nDotH * (a2 - 1.0) + 1.0;
  return a2 / max(PI * d * d, 1e-5);
}

float geometrySmith(vec3 n, vec3 v, vec3 l, float roughness){
  float k = (roughness + 1.0) * (roughness + 1.0) / 8.0;
  float nDotV = max(dot(n, v), 0.0);
  float nDotL = max(dot(n, l), 0.0);
  return (nDotV / (nDotV * (1.0 - k) + k)) * (nDotL / (nDotL * (1.0 - k) + k));
}

// Atlas sampling helper for a content-space position inside the current cell.
vec2 atlasUv(vec2 cellPosition){
  return (uOriginLower * uCellSize + clamp(cellPosition, 0.0, 1.0) * uCellSize) / uAtlasSize;
}

// Rectangular studio softbox, approximated as a window in reflection space.
// This is what makes leather read as leather: the highlight is a soft strip,
// not a point.
float softbox(vec3 n, vec3 v, float rough){
  vec3 r = reflect(-v, n);
  float elevation = asin(clamp(r.y, -1.0, 1.0));
  float azimuth = atan(r.z, r.x);
  float boxElevation = 0.42;
  float boxAzimuth = -0.5;
  float vertical = smoothstep(0.60 + rough, 0.08 + rough, abs(elevation - boxElevation));
  float horizontal = smoothstep(1.50, 0.25, abs(azimuth - boxAzimuth));
  return vertical * horizontal;
}

void main(){
  // Screen pixel -> garment content space. Screen y is flipped here because
  // clip space runs bottom-up while the atlas row order runs top-down.
  vec2 px = vec2(vUv.x, 1.0 - vUv.y) * uCanvas;
  vec2 local = (px - uQuadCenter) / uQuadBaseSize;
  vec2 content = local / uZoom + uCenter;

  // Cloth micro-motion: a low-frequency warp that grows away from the hanger
  // apex, so the garment breathes at the hem instead of wobbling as a sheet.
  float drop = clamp((content.y - uApex.y) / max(1.0 - uApex.y, 0.001), 0.0, 1.0);
  float weight = drop * drop;
  float amp = uDisplacement * 0.0075 * weight;
  content.x += amp * sin(content.y * 7.5 + uTime * 1.35 + uPointer.x * 1.6);
  content.y += amp * 0.45 * sin(content.x * 6.0 - uTime * 1.05 + uPointer.y * 1.2);

  // Studio backdrop behind the garment.
  vec3 backdrop = mix(uBackdropTop, uBackdropBottom, smoothstep(0.0, 1.0, vUv.y));
  float vignette = smoothstep(1.25, 0.25, length((vUv - 0.5) * vec2(1.1, 1.0)));
  backdrop *= mix(0.72, 1.0, vignette);

  if (content.x < -0.02 || content.x > 1.02 || content.y < -0.02 || content.y > 1.02){
    outColor = vec4(backdrop, 1.0);
    return;
  }

  vec2 cellUv = clamp(content, 0.0, 1.0);
  if (uFlip > 0.5) cellUv.x = 1.0 - cellUv.x;

  vec2 uvLower = (uOriginLower * uCellSize + cellUv * uCellSize) / uAtlasSize;
  vec2 uvUpper = (uOriginUpper * uCellSize + cellUv * uCellSize) / uAtlasSize;
  vec4 frameLower = texture(uAtlas, uvLower);
  vec4 frameUpper = texture(uAtlas, uvUpper);
  vec4 frame = mix(frameLower, frameUpper, uMix);

  float alpha = smoothstep(0.02, 0.45, frame.a);
  if (alpha < 0.02){
    outColor = vec4(backdrop, 1.0);
    return;
  }

  // Volume from the silhouette. The source garment is a flat illustration with
  // almost no shading of its own, so the cross-section is inflated from the
  // alpha mask. The probe reads a heavily blurred mip level, which behaves like
  // a smooth height dome; probing raw alpha instead produces a hard bright band
  // hugging the outline.
  float probe = 0.055;
  float blurLod = 5.5;
  float aRight = textureLod(uAtlas, atlasUv(cellUv + vec2(probe, 0.0)), blurLod).a;
  float aLeft  = textureLod(uAtlas, atlasUv(cellUv - vec2(probe, 0.0)), blurLod).a;
  float aDown  = textureLod(uAtlas, atlasUv(cellUv + vec2(0.0, probe)), blurLod).a;
  float aUp    = textureLod(uAtlas, atlasUv(cellUv - vec2(0.0, probe)), blurLod).a;
  if (uFlip > 0.5){
    float swap = aRight; aRight = aLeft; aLeft = swap;
  }
  vec3 edgeNormal = normalize(vec3(-(aRight - aLeft) * 9.0, (aDown - aUp) * 9.0, 1.0));

  // Fabric grain: modulates albedo and perturbs the normal. The sample is
  // compressed toward mid-grey first — a full-contrast height map multiplied
  // straight into a lit surface reads as sandpaper, not leather.
  vec3 grainRaw = texture(uGrain, content * uGrainScale).rgb;
  vec3 grainSample = mix(vec3(0.5), grainRaw, 0.55);
  vec3 grainColor = texture(uNormal, content * uGrainScale).rgb;
  vec3 grainNormal = decodeNormal(grainColor);

  // Cloth-wide normal from the frame's own shading gradient. Cheap, always in
  // sync with the current frame, and needs no per-frame normal atlas.
  float lum = dot(frame.rgb, vec3(0.299, 0.587, 0.114));
  vec3 frameNormal = normalize(vec3(-dFdx(lum) * 38.0, dFdy(lum) * 38.0, 1.0));
  frameNormal = normalize(mix(vec3(0.0, 0.0, 1.0), frameNormal, uFrameNormalStrength));

  vec3 n = normalize(vec3(
    grainNormal.xy * uNormalStrength + frameNormal.xy + edgeNormal.xy * uEdgeNormalStrength,
    1.0
  ));

  // Specular rides a sharper version of the same grain, so each pebble throws
  // its own micro-highlight. Without this the surface lights like matte paint.
  vec3 nSpecular = normalize(vec3(grainNormal.xy * uNormalStrength * 1.6 + frameNormal.xy + edgeNormal.xy * uEdgeNormalStrength, 1.0));

  vec3 albedo = frame.rgb * uTint * mix(vec3(1.0), grainSample * 1.15 + 0.42, 0.09);

  vec3 lightDir = normalize(uLightDir + vec3(uPointer * 0.22, 0.0));
  vec3 viewDir = normalize(vec3(uPointer * 0.30, 1.0));
  vec3 halfDir = normalize(lightDir + viewDir);

  float nDotL = max(dot(n, lightDir), 0.0);
  float diffuse = mix(0.55, 1.0, nDotL);

  float roughness = clamp(uRoughness - uCreaseSharpness * 0.06, 0.02, 1.0);
  float spec = distributionGGX(nSpecular, halfDir, roughness) * geometrySmith(nSpecular, viewDir, lightDir, roughness);
  float fresnel = pow(1.0 - max(dot(nSpecular, viewDir), 0.0), 5.0);
  // Fresnel is deliberately restrained: at full strength it draws a bright
  // outline around the whole silhouette, which reads as a stroke, not a rim.
  float specular = spec * uSpecular * (0.55 + 0.45 * fresnel) * 0.85;

  vec3 reflected = softbox(n, viewDir, roughness) * uEnvSoftbox * vec3(1.0, 0.98, 0.94);

  // Sheen / anisotropy stay zero for leather; the channels exist for knit and
  // sherpa so those rounds are data, not renderer surgery.
  float sheenTerm = uSheen * pow(1.0 - max(dot(n, viewDir), 0.0), 3.0) * 0.18;

  vec3 color = albedo * (0.62 + 0.62 * diffuse);
  color += vec3(specular) + reflected * (albedo * 1.35 + 0.05) + sheenTerm * albedo;
  color += albedo * uTranslucency * 0.20 * (1.0 - diffuse);

  // Ambient occlusion from the frame's own darkening, keeps the garment reading
  // as a solid object rather than a decal.
  color *= mix(0.82, 1.06, smoothstep(0.15, 0.85, lum));

  // Silhouette fuzz for fur-like materials; inert for leather.
  float fuzz = uFuzz * (1.0 - alpha);
  color = mix(color, color * 1.25, fuzz);
  float outAlpha = clamp(alpha + fuzz * 0.6, 0.0, 1.0);

  outColor = vec4(mix(backdrop, color, outAlpha), 1.0);
}`;

const LIGHT_MODES = {
  front: {key: [-0.35, 0.55, 0.75], label: '顺光'},
  side: {key: [0.15, 0.42, 0.9], label: '侧光'},
  back: {key: [-0.25, -0.35, -0.85], label: '逆光'},
};

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error('Shader compile failed: ' + log);
  }
  return shader;
}

function link(gl, vertexSource, fragmentSource) {
  const program = gl.createProgram();
  const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error('Program link failed: ' + log);
  }
  return program;
}

function createTexture(gl, {wrap = gl.CLAMP_TO_EDGE, mipmaps = false} = {}) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  // Without mipmaps a minified grain tile aliases into static-like noise, which
  // is exactly what a leather grain must never look like.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mipmaps ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
  return texture;
}

function finishTexture(gl, {mipmaps = false} = {}) {
  if (!mipmaps) return;
  gl.generateMipmap(gl.TEXTURE_2D);
  const anisotropy = gl.getExtension('EXT_texture_filter_anisotropic');
  if (anisotropy) {
    const max = gl.getParameter(anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
    gl.texParameterf(gl.TEXTURE_2D, anisotropy.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, max));
  }
}

export class MaterialStage {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: true,
      premultipliedAlpha: false,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.canvas = canvas;
    this.gl = gl;
    this.program = link(gl, VERTEX_SOURCE, FRAGMENT_SOURCE);
    this.uniforms = {};
    const count = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i += 1) {
      const info = gl.getActiveUniform(this.program, i);
      const name = info.name.replace(/\[0\]$/, '');
      this.uniforms[name] = gl.getUniformLocation(this.program, info.name);
    }

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(this.program, 'aPosition');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    this.atlasTexture = createTexture(gl, {mipmaps: true});
    this.grainTexture = createTexture(gl, {wrap: gl.REPEAT, mipmaps: true});
    this.normalTexture = createTexture(gl, {wrap: gl.REPEAT, mipmaps: true});
    this.grainReady = false;
    this.lightMode = 'front';
  }

  setAtlas(image, manifest) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTexture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    // No UNPACK_FLIP_Y here: texImage2D already maps v = 0 to the image's first
    // (top) row, which is the space the manifest's cell indices assume.
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    finishTexture(gl, {mipmaps: true});
    this.atlasSize = [image.naturalWidth, image.naturalHeight];
    this.cellSize = [manifest.width, manifest.height];
    this.columns = manifest.columns;
    this.frameCount = manifest.frameCount;
    this.apex = manifest.pivot || [0.5, 0.027];
  }

  setMaterialTextures(grainImage, normalImage) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.grainTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, grainImage);
    finishTexture(gl, {mipmaps: true});
    gl.bindTexture(gl.TEXTURE_2D, this.normalTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, normalImage);
    finishTexture(gl, {mipmaps: true});
    this.grainReady = true;
  }

  resize(width, height, dpr) {
    const canvas = this.canvas;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    this.gl.viewport(0, 0, canvas.width, canvas.height);
  }

  /** Quad geometry: the garment fits the viewport height with a breathing margin. */
  quadFor(width, height) {
    const margin = width < 700 ? 0.90 : 0.82;
    const garmentAspect = this.cellSize ? this.cellSize[0] / this.cellSize[1] : 0.857;
    let quadHeight = height * margin;
    let quadWidth = quadHeight * garmentAspect;
    const maxWidth = width * 0.92;
    if (quadWidth > maxWidth) {
      quadWidth = maxWidth;
      quadHeight = quadWidth / garmentAspect;
    }
    return {width: quadWidth, height: quadHeight};
  }

  /** Same quad in viewport CSS pixels, so overlays can share the mapping. */
  quadCss(width, height) {
    const quad = this.quadFor(width, height);
    return {
      left: (width - quad.width) / 2,
      top: (height - quad.height) / 2,
      width: quad.width,
      height: quad.height,
    };
  }

  render(state) {
    const gl = this.gl;
    const {frameLower, frameUpper, mix, flip, zoom, center, material, pointer, time} = state;
    const canvas = this.canvas;
    const dpr = canvas.width / (canvas.clientWidth || canvas.width);
    const cssWidth = canvas.clientWidth || canvas.width / dpr;
    const cssHeight = canvas.clientHeight || canvas.height / dpr;
    const quad = this.quadFor(cssWidth, cssHeight);

    const parallaxX = pointer[0] * 10;
    const parallaxY = pointer[1] * 7;

    gl.useProgram(this.program);
    const u = this.uniforms;

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTexture);
    gl.uniform1i(u.uAtlas, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.grainTexture);
    gl.uniform1i(u.uGrain, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.normalTexture);
    gl.uniform1i(u.uNormal, 2);

    const originOf = index => [index % this.columns, Math.floor(index / this.columns)];
    const [lx, ly] = originOf(frameLower);
    const [ux, uy] = originOf(frameUpper);

    gl.uniform2f(u.uCanvas, canvas.width, canvas.height);
    gl.uniform2f(u.uQuadCenter, canvas.width / 2 + parallaxX * dpr, canvas.height / 2 + parallaxY * dpr);
    gl.uniform2f(u.uQuadBaseSize, quad.width * dpr, quad.height * dpr);
    gl.uniform2f(u.uCellSize, this.cellSize[0], this.cellSize[1]);
    gl.uniform2f(u.uOriginLower, lx, ly);
    gl.uniform2f(u.uOriginUpper, ux, uy);
    gl.uniform2f(u.uAtlasSize, this.atlasSize[0], this.atlasSize[1]);
    gl.uniform1f(u.uMix, mix);
    gl.uniform1f(u.uFlip, flip ? 1 : 0);
    gl.uniform2f(u.uCenter, center[0], center[1]);
    gl.uniform1f(u.uZoom, zoom);

    const params = material.parameters;
    gl.uniform3f(u.uTint, material.tint[0], material.tint[1], material.tint[2]);
    gl.uniform1f(u.uGrainScale, params.grainScale);
    gl.uniform1f(u.uRoughness, params.roughness);
    gl.uniform1f(u.uSpecular, params.specular);
    gl.uniform1f(u.uNormalStrength, params.normalStrength);
    gl.uniform1f(u.uFrameNormalStrength, params.frameNormalStrength);
    gl.uniform1f(u.uEdgeNormalStrength, params.edgeNormalStrength);
    gl.uniform1f(u.uSheen, params.sheen);
    gl.uniform1f(u.uAnisotropy, params.anisotropy);
    gl.uniform1f(u.uEnvSoftbox, params.envSoftbox);
    gl.uniform1f(u.uFuzz, params.fuzz);
    gl.uniform1f(u.uTranslucency, params.translucency);
    gl.uniform1f(u.uDisplacement, params.displacement);
    gl.uniform1f(u.uCreaseSharpness, params.creaseSharpness);

    const key = LIGHT_MODES[this.lightMode].key;
    const length = Math.hypot(...key);
    gl.uniform3f(u.uLightDir, key[0] / length, key[1] / length, key[2] / length);
    gl.uniform2f(u.uPointer, pointer[0], pointer[1]);
    gl.uniform2f(u.uApex, this.apex[0], this.apex[1]);
    gl.uniform1f(u.uTime, time);

    gl.uniform3f(u.uBackdropTop, 0.90, 0.90, 0.88);
    gl.uniform3f(u.uBackdropBottom, 0.74, 0.75, 0.73);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  cycleLight(direction) {
    const order = ['front', 'side', 'back'];
    const index = order.indexOf(this.lightMode);
    const next = (index + direction + order.length) % order.length;
    this.lightMode = order[next];
    return this.lightMode;
  }

  setLight(mode) {
    if (!LIGHT_MODES[mode]) throw new Error('Unknown light mode: ' + mode);
    this.lightMode = mode;
  }

  dispose() {
    const gl = this.gl;
    gl.deleteTexture(this.atlasTexture);
    gl.deleteTexture(this.grainTexture);
    gl.deleteTexture(this.normalTexture);
    gl.deleteProgram(this.program);
  }
}

export {LIGHT_MODES};
