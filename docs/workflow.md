# Technical recipe for the agent

If you are reading this as the user, start with [START-HERE.md](../START-HERE.md). Your agent executes these steps using [the agent workflow](agent-workflow.md).

## 1. Prepare two image anchors

Start with front and, if available, back photographs you can use. Generate the front image with [image-front.md](../prompts/image-front.md), approve it, then derive the strict profile with [image-profile.md](../prompts/image-profile.md). Image generation is a separate tool: use the reference-image editor available in your agent or prepare images elsewhere.

Save `inputs/profile.png` and `inputs/front.png`. Match canvas, lighting, suspension apex and scale. Keep the wire and rail out of the images; the site supplies a stationary wire. Use a flat backing color absent from the fabric and print.

## 2. Generate a constrained turn, optionally through LTX

You can use any video model supporting the needed endpoints, or supply an existing video. The bundled helper targets LTX's async image-to-video endpoint. [Official API documentation](https://docs.ltx.io/api-documentation/api-reference/async-video-generation/submit-image-to-video) and [console](https://console.ltx.io) are the provider sources; check availability and pricing there before a paid request.

Copy `examples/ltx-turn.json` into `inputs/turn.json`. Set `image_uri` to `inputs/profile.png`, `last_frame_uri` to `inputs/front.png`, and edit the prompt. Local file paths are converted to data-image URIs by the helper. They are not raw API field values.

Inspect the request without a key or network call:

```sh
node pipeline/ltx.mjs inputs/turn.json
```

The included JSON points to illustrative anchors. It makes the dry run usable; replace them before paying for product footage.

After approving the provider, request settings and cost, save the key as `LTX_API_KEY` in an ignored `.env.local`, using `.env.example` as a template. Never put credentials in `config/`, `public/` or a prompt.

```sh
node --env-file=.env.local pipeline/ltx.mjs inputs/turn.json --submit --out generated/my-item-01
```

This is the paid action. One invocation submits one job. The helper saves a request receipt and job ID, polls the job and downloads the MP4. It does not automatically submit another generation if the POST fails or the result is poor. Existing take directories are never overwritten.

```sh
node --env-file=.env.local pipeline/ltx.mjs --resume generated/my-item-01
```

Resume polls the saved job; it does not submit again. If submission is uncertain and no job ID was saved, inspect the provider console before creating a new take.

## 3. Select and process the useful interval

Prepare the project-local Python environment and locate FFmpeg as described in agent-workflow.md. Review the full video and choose only the clean rotation, excluding a static tail, overshoot or camera drift.

```sh
python pipeline/prepare.py --video generated/my-item-01/video.mp4 --start 0 --end 3.5 --out work/my-item
```

`3.5` is an example, not a universal cut. Use your footage's actual endpoints. The processor samples 30 frames across the interval, removes the flat backing, applies one shared crop and scale, and produces:

```text
atlas.webp       30 cells packed in 6 columns
profile.webp     First cell, from the decoded atlas
front.webp       Last cell, from the decoded atlas
manifest.json    Dimensions, source hash and processing receipt
key-review.jpg   Edge and pose review on three backgrounds
```

For magenta backing, add `--key magenta`. For a stable manually measured apex, add `--pivot 640,30` using **source-image pixel coordinates**. If the wooden apex drifts, try `--align-wood`; this detects and registers the top of a brown wooden hanger. It cannot fix fabric deformation and may fail with a different hanger material. Inspect its result, or use a stable manual pivot. `--crop x0,y0,x1,y1` selects one shared rectangle for all frames.

You can process an already transparent PNG sequence with `--frames inputs/frames` instead of `--video`. The processor preserves existing alpha. It refuses an existing output folder to protect reviewed work.

The keyer is a simple configurable starting point. Fabrics matching the backing, shadows and severe spill can require a different key, a dedicated mask or manual cleanup.

## 4. Add one reviewed item

Copy the accepted output folder to `public/fixtures/my-item/`. If you have a reviewed back image, prepare it at the same scale/canvas and add `back.webp`. Do not invent an unseen side. Omit `back` to hide the back button.

Add an entry to `config/catalog.json`:

```json
{
  "id": "my-item",
  "name": "Your garment name",
  "type": "Cotton T-shirt",
  "color": "Off-white",
  "description": "Your concise product description",
  "motion": "fixtures/my-item/manifest.json",
  "productUrl": "https://your-store.example/product/your-item"
}
```

Replace the example product URL with a real HTTPS address, or omit it. All media paths are relative to `public/`. Keep imported raw material outside `public/`.

## 5. Validate inside the interface

Run the site. Check repeated hover/reversal, sleeve/hem clearance, fixed apex, printed details, alpha edges, neighbor movement and touch browsing. Judge motion at **360ms**, not only as a six-second video. The catalog's `timing` values tune intent, turn, return and endpoint softness; they do not repair oscillation within footage.

Run tests and audit. The sample provenance file covers only the bundled examples; maintain a separate source/permission receipt for your own imports. Test physical devices and your audience's connection before deploying. Add the remaining garments only after the first one passes.
