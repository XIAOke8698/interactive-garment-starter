# Troubleshooting

| Symptom | Check |
| --- | --- |
| Blank page or missing previews | Start the HTTP server from the root; do not open a file URL. Check the console and catalog paths |
| “Could not load previews” | A manifest or atlas is missing, invalid, or has different decoded dimensions. Correct it and reload |
| Side image visible but no movement | The atlas must decode before input is enabled. Check the loading state, then hover inside the silhouette |
| Looks clean in a player, shaky on hover | Test at UI speed. Trim a clean interval; register translation if appropriate; regenerate persistent swing/deformation |
| Green/magenta fringe | Inspect key-review.jpg against dark and colored backgrounds. Avoid a backing present in the print; reduce spill in source images or use a better mask |
| Hanger moves at the seam | Keep one apex and one scale. Do not individually auto-crop frames. Use --pivot or inspect --align-wood |
| PNG sequence is already transparent | Use --frames. Alpha is preserved rather than keyed again |
| Submission timed out | Do not repeat --submit blindly. Resume the saved job ID; if missing, inspect the provider console |
| API rejects a request | Verify the current official field/model support and account access. The helper intentionally accepts a limited parameter subset |
| ffmpeg/ffprobe not found | Install both on PATH or set FFMPEG/FFPROBE to executable paths |
| Port 5264 is occupied | Set PORT to another port before launching the local server |
| Touch scrolling opens a product | A horizontal drag suppresses click. Test vertical page scroll and small taps separately on physical devices |

Use browser-native reduced motion to verify the accessible static-endpoint behavior. Product detail is intentionally front/back stills; no detail transition is missing.
