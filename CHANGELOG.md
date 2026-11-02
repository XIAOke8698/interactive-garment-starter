# Changes

## 0.3.0 — 2 November 2026

Immersive single-garment material stage. The rack experience is unchanged and moves to `rack.html`; `index.html` becomes the new stage. Both read one catalog.

- WebGL2 material renderer: procedural leather grain, GGX specular, studio softbox reflection, and cloth micro-motion, composited over the existing frame atlas
- Volume normals derived from the silhouette, because the plain fixtures are flat illustrations with almost no shading of their own
- Drag turntable with inertia; the plain-garment arc mirrors to 180°, printed garments stay on their real 90°
- Pointer-anchored zoom to 3x: fabric grain stays sharp because it comes from a 1024² material tile, not from magnified footage
- Three light positions (front / side / backlight); leather stays opaque under backlight as a baseline for future fabrics
- Four macro details behind hotspots, gated to the front view; fabric spec panel
- `pipeline/textures.py` generates seamless pebbled grain (FFT-band-limited Worley), its normal map, a lit swatch, and the detail crops — fixed seed, reproducible, honest provenance
- Catalog contract extended with `material`, `fabric`, `details`, `mirror` and top-level `stage`; unknown material parameter keys fail loudly
- Degrades to a link to `rack.html` without WebGL2; reduced motion disables displacement, inertia and light drift; full keyboard equivalents and `aria-live` announcements
- New tests: `tests/stage.test.mjs` (10 cases) and `tests/test_textures.py` (5 cases); server test now pins the widened allowlist

Known limits: the source frames are 384×448, so silhouettes soften at full-screen scale; the leather grain is synthesised, not photographed; a true 360° turntable needs roughly 120 new frames per garment.

## 0.2.0 — 19 October 2026

- Two photographic concept shirts replace the procedural default collection
- Exact source artwork is composited onto generated cotton bases; the motion uses LTX-2.5 Pro and Kling 3.0 through Pika
- Thirty transparent frames per garment; shared endpoint plates and suspension point
- Green-key handling preserves dark green artwork
- Desktop reversal, touch browsing and static front/back details
- English quick start, agent brief, image/video templates, local API helper and processing pipeline
- No model calls or keys required to run the example

First public release with the included original-art garments. A fresh coding-agent chat downloaded the source package, started the example and checked its browser interaction without the project conversation.


## Review revision · 18 October 2026

Agent-led onboarding for Codex and Claude Code: run the included preview first, then guide product adaptation. Added a complete agent execution guide and Claude entry file. The user-facing quick start delegates environment setup and processing to the agent. Prepared media and interaction timing are unchanged.
