# Validation receipt

Updated July 15, 2026.

## Current release gates

| Gate | Result |
|---|---|
| Python tests | pass; 12 tests in the current run |
| JavaScript syntax and built-in tests | pass; 9 tests in the current local-only build |
| Mocked browser FLUX.2 flow | pass; the earlier stream run produced 38 generated frames, and the current run exercised token exchange, cleanup, and the 15-second cap |
| Official fal browser client integration | pass through WebSocket construction with mocked inference |
| Hosted app | absent by design; GitHub Pages is disabled and the README holds the real video |
| Responsive layout | pass at 390 × 844 |
| Missing server key fails closed | pass |
| Wrong access code fails closed | pass |
| Realtime app allowlist | pass; only `fal-ai/flux-2/klein/realtime` is accepted |
| Current fal token schema | pass; request includes both the required `app` and exact `allowed_apps` values |
| Current fal token response | pass; both the documented object and live raw JSON string forms are normalized server-side |
| Token response caching | pass; disabled with `Cache-Control: no-store` |
| `FAL_KEY` in frontend or tracked environment files | pass; not present |
| Real fal key authentication | pass |
| Realtime token creation | pass; fal returned HTTP 201 and the localhost endpoint returned HTTP 200 without exposing the token |
| Paid FLUX.2 frames and cost | pass; 49 displayed frames in one 15-second run, estimated at no more than $0.0291 at the listed rate |
| Visual parity with the original X demo | partial; strong clay material and layout preservation, but weaker text, presentation, and measured frame rate |
| New 15-second session cap | pass in mocked and real browser sessions; the connection closed and the UI returned to Start |
| Stop during WebSocket handshake | pass; the socket guard prevents the pinned fal client from sending a queued frame after Stop |
| Localhost-only release boundary | pass; hosted token code is removed, Pages is disabled, and live token exchange remained on `127.0.0.1` |
| Real browser console | pass; 0 errors during the paid run |
| Built-in recording quality | pass; FLUX.2 capture requests 30 fps at 8 Mbps from the 768×768 output canvas |
| Public evidence | pass; the tracked screenshot links to the 13-second capture in the README only |

The bounded real-service gate now passes. This establishes that a fresh clone
can mint a scoped token, connect to FLUX.2, display real output, and stop on the
usage cap. It does not establish exact parity with the inspiration.

## Completed bounded real-service smoke test

The July 15 run used the 512×288, three-second map clip in
`output/review/current-pan-source.mp4`, which was effectively static despite its
filename. No second paid run was performed.

- Token creation: pass; live fal HTTP 201, local token endpoint HTTP 200.
- Output: 49 displayed frames before the real 15-second cap.
- Last observed round-trip: 271 ms. This is a single last-frame reading, not an
  average or percentile.
- Effective displayed generation rate: about 3.3 frames per second over the
  capped window, including two RIFE frames per response.
- Browser console: 0 errors.
- Estimated maximum cost: `15 × $0.00194 = $0.0291`. The API-scoped key cannot
  read account billing, so this is a rate-times-cap estimate rather than a
  dashboard-confirmed charge.
- Public artifacts: [`assets/flux2-smoke-result.jpg`](assets/flux2-smoke-result.jpg)
  and [`assets/clay-screen-demo.mp4`](assets/clay-screen-demo.mp4).

Screen, Camera, and the remaining materials are already covered by free UI or
mocked checks. No additional real-service combinations were purchased.

At the price listed on July 15, 2026, a continuously billed 15-second session is
approximately `15 × $0.00194 = $0.0291`. Clients can restart sessions, so the cap
does not impose a hard account-level spending limit.

## Comparison with the original X demo

The result is working in the same broad category, but it is not yet as polished
as Ryan Stephen's demo.

- **What matches:** real image-to-image streaming, recognizable map geometry,
  coherent pastel clay regions, rounded raised roads and markers, and stable
  composition across an effectively static source.
- **What trails:** small text is garbled, the app transforms the selected source
  inside a side-by-side studio rather than presenting one immersive transformed
  browser surface, and the measured 3.3 displayed frames per second is well
  below Ryan's reported roughly 20 fps.
- **What this run cannot prove:** motion tracking and temporal consistency under
  panning, because the validation clip contained no meaningful motion.

The release should therefore be described as a simple, working FLUX.2
approximation with convincing material treatment—not a pixel-for-pixel or
frame-rate-equivalent recreation.

## Optional local Mac fallback receipt

The private local backend was validated on an Apple Silicon Mac (`Mac16,5`,
48 GB, macOS 15.6) with Python 3.10.16, PyTorch MPS, Diffusers 0.33.1,
Transformers 4.48.3, and StreamDiffusion-Mac at commit `99f146e`.

| Local gate | Result |
|---|---|
| MPS available | pass |
| SD-Turbo + TAESD download and warm-up | pass; about 4.8 GB |
| Real PNG to generated 512×288 JPEG | pass |
| Four warm model calls | 103, 136, 103, and 104 ms |
| Browser video flow | pass against the current FLUX.2 UI; 107 frames in the verification run |
| Browser console | pass; no errors or warnings during generation and Stop |

Those figures measure the model call rather than capture, JPEG transport, or
browser drawing, and will vary across Macs.

`pip check` in `.venv-mac` reports the StreamDiffusion-Mac package's stale
`transformers==4.35.2` metadata pin. The setup script intentionally installs
the fork without dependencies and uses Transformers 4.48.3 because Diffusers
0.33.1 imports APIs absent from 4.35.2; the generation receipt above verifies
that combination. The FLUX.2 and CI environments do not install this fork.

## Free verification commands

```bash
pytest -q
npm run check
npm test
git check-ignore -q .env.local
```

CI leaves `FAL_KEY` unset and never performs paid inference.
