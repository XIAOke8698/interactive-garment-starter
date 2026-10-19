# Performance and asset contract

The site loads JSON and two small atlases, decodes them, then enables interaction. Showing an endpoint alone is not proof that its timeline is ready. Input is gated on actual image decode rather than a timer.

The fixture atlases use 384×448 cells, 30 frames and six columns. One atlas is 2304×2240 pixels: about **20.6 MB of RGBA pixels** before browser overhead, regardless of its compressed transfer size. The two default atlases are 837,702 transferred bytes (about 0.84 MB) and 41,287,680 decoded RGBA bytes (about 41 MB), before browser overhead. More items need an explicit memory/loading strategy; this small eager-loading starter is not a claim that a 100-item collection scales unchanged.

Keep geometry, pivot and scale consistent between frames. The endpoint stills are extracted from the final decoded atlas, preventing a pixel jump when a still is replaced by a frame. The UI's vertical wire is a separate layer. No generated metal hook is keyed or animated.

Inspect atlas dimensions and actual WebP byte sizes. Evaluate quality on edges and print details before increasing compression. Check a cold load on a realistic connection and a lower-memory device; a local warm load is not a production benchmark.

The controller renders only while motion is active and stops when the page is hidden. Reduced motion selects endpoints immediately. Fonts are local and licensed. The static build requires no server-side AI calls, analytics or third-party runtime scripts.

To deploy, run `node scripts/build.mjs` and upload **dist/**. Set correct HTML/JS/JSON/image MIME types. Cache versioned production assets; avoid stale catalog/manifests referencing changed files. The included development server intentionally uses no-store for review.
