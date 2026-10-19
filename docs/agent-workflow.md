# Execution guide for the coding agent

Read this as the implementation brief. The person using this repository supplies creative input and approvals; you carry out technical setup and production. Begin with a local working example, then replace one garment. Reuse the code and prompts here.

## 1. Acquire and start the example

If given only a GitHub URL, inspect the repository, clone it into a dedicated writable folder, and read AGENTS.md. If Git is unavailable, download its source ZIP through an available trusted tool, inspect the paths, and extract into a new project folder. If the folder already exists, inspect it before creating duplicates or replacing files. Never overwrite an unrelated project.

Inspect the available terminal, OS and runtimes. Look for `node --version`, then a bundled runtime available to your environment. The minimum is Node.js 20.6. If missing, prepare a verified official Node.js runtime using a supported local install method. Prefer a project/user-local installation; obtain permission if your environment requires it. Do not alter system settings or ask the user to install tools as a default. If execution is unavailable, explain that the user must open this project in a coding-agent environment with local terminal access, with one precise next action.

From the project root, run:

```sh
node scripts/serve.mjs
```

No npm install, key, provider login or image tool is required at this stage. Keep the process running in a managed session. Start background helpers hidden on Windows. If port 5264 belongs to another process, select a free port and set `PORT` for this process only; do not kill unrelated servers. The server prints the actual local URL. Verify it returns the page and required assets, then open it with your browser tool. If browser control is unavailable, provide the local link and label what you did verify.

Try hover, interruption, reversal and detail opening on both shirts. Test a narrow touch viewport if browser tools allow it. The included example should work before any custom generation. Report the URL and ask what product the user wants to use.

## 2. Get creative inputs and inspect tools

Ask for the pilot product’s front/back photos or original artwork and a visual reference for the site. Ask only for information still missing. A source folder or attachments are sufficient; the user need not choose filenames or edit configuration. Confirm they can use the supplied material. Keep unknown back details unknown and hide unavailable views.

Inspect connected image tools, video tools, locally stored provider configuration and the permissions available to you. Never print secrets. Explain the one missing connection only if needed. For image anchors, use an available reference-image editor such as GPT Images or Nano Banana. For video, use the bundled LTX helper or another user-approved first/last-frame model. External generation tools vary by agent; this repository does not install those capabilities automatically.

If a key is needed, create an ignored .env.local from .env.example and guide private entry outside the chat, then verify presence without displaying the value. Use current official provider documentation for field names and cost. If the user prefers an external image/video app, give them a ready prompt and exact input images; resume from the returned media.

## 3. Prepare and review two anchors

Use prompts/image-front.md (or prompts/printed-shirt-front.md for original artwork), then prompts/image-profile.md. Inspect the references first. Save accepted files under inputs/ in a named item folder.

Preserve the original silhouette, color and print; match canvas, lighting, scale and wooden suspension apex. Use a flat backing color absent from the garment. Keep wire and rail outside the generated images. Show the full front/profile pair to the user. Fix an incorrect print or orientation before paying for video.

## 4. Generate one controlled turn

Read docs/workflow.md and prompts/video-turn.md. The agent prepares the request. Before uploading or spending, present provider/model, duration, resolution, frame rate, uploaded files, cost per attempt, maximum attempts and total cap. Existing explicit authorization can cover subsequent attempts within those bounds.

For LTX, copy examples/ltx-turn.json to inputs/turn.json and point image_uri and last_frame_uri to the approved local files. Inspect the dry run:

```sh
node pipeline/ltx.mjs inputs/turn.json
```

Only after approval, with LTX_API_KEY privately configured:

```sh
node --env-file=.env.local pipeline/ltx.mjs inputs/turn.json --submit --out generated/my-item-01
```

Save the receipt. Resume a known job after interruption:

```sh
node --env-file=.env.local pipeline/ltx.mjs --resume generated/my-item-01
```

An uncertain submit without a receipt needs reconciliation with the provider before another job. A failed or poor take is not permission to exceed the budget. Show the user a concrete blocker or bounded next option if approved attempts are exhausted.

## 5. Process the footage and add the product

Discover Python 3.10+, FFmpeg and ffprobe; reuse suitable installed/bundled tools. Create a project-local virtual environment and install pipeline/requirements.txt into it. If binaries are outside PATH, set FFMPEG and FFPROBE to their verified executable paths for this process. Handle discovery and installation yourself where permitted.

Review the complete take. Select the clean profile-to-front interval, excluding overshoot, drift and idle tails. Then use the virtual environment’s Python:

```sh
python pipeline/prepare.py --video generated/my-item-01/video.mp4 --start 0 --end 3.5 --out work/my-item
```

The interval above is an example. Choose the real endpoints. docs/workflow.md explains backing color, shared crop, registration, transparent PNG input and the output manifest. Inspect key-review.jpg on light/dark/color backgrounds and compare the print with the original. Use one shared crop and pivot for all frames. Regeneration, trimming and edge cleanup solve different defects; choose the relevant repair.

Copy only reviewed browser assets into public/fixtures/my-item/, then update config/catalog.json yourself using the documented schema. Keep original inputs, provider receipts and keys outside public/. Prepare static detail stills consistently. Omit an unknown back and product URL instead of fabricating them. Show the actual UI at its configured speed to the user.

## 6. Validate and hand off

```sh
node --test tests/runtime.test.mjs tests/server.test.mjs tests/ltx.test.mjs
node scripts/audit.mjs
node scripts/build.mjs
python -m unittest discover -s tests -p "test_*.py"
```

The Python tests require the production environment prepared above. Check foreground edges, exact profile/front endpoints, print fidelity, rapid reversal, fixed wire, neighbors at full opacity, mobile swipe versus tap, keyboard and reduced motion. Measure file size and loading behavior. Browser touch emulation and physical-phone tests are different evidence: report each honestly.

Keep the local server available and give the user a working preview. Summarize visible changes, remaining defects, verified checks and actual generation spend. Iterate from their visual feedback before expanding the collection.

When explicitly asked to publish, deploy only dist/ through an authorized hosting tool/account and verify the resulting public URL and asset responses. The root folder contains production helpers and may contain private inputs. Share code or assets only within the user-approved release scope.

## Resume after interruption

Keep a short local work/session.md containing the project path, server port, approved image pair, current item, provider job IDs/receipt paths, spending cap and spend, last verified result and next step. Never include secret values. On resumption, read it, inspect files and existing jobs/processes, and continue without duplicate charges or duplicate servers.
