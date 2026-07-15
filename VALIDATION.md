# Validation receipt

Updated July 15, 2026.

## Current release gates

| Gate | Result |
|---|---|
| Python tests | pass; 11 tests in the current run |
| JavaScript syntax and built-in tests | pass; 9 tests in the current local-only build |
| Mocked browser FLUX.2 flow | pass; the earlier stream run produced 38 generated frames, and the current run exercised token exchange, cleanup, and the 15-second cap |
| Official fal browser client integration | pass through WebSocket construction with mocked inference |
| Static GitHub Pages preview | pass; interface-only, preview health only, clean console |
| Responsive layout | pass at 390 × 844 |
| Missing server key fails closed | pass |
| Wrong access code fails closed | pass |
| Realtime app allowlist | pass; only `fal-ai/flux-2/klein/realtime` is accepted |
| Current fal token schema | pass; request includes both the required `app` and exact `allowed_apps` values |
| Token response caching | pass; disabled with `Cache-Control: no-store` |
| `FAL_KEY` in frontend or tracked environment files | pass; not present |
| Real fal key authentication | pass |
| Realtime token creation | **blocked: fal returned HTTP 403 because the account balance was exhausted** |
| Paid FLUX.2 frames and cost | **0 frames; $0 observed cost** |
| Visual parity with the original X demo | **unverified because no real FLUX.2 frames were produced** |
| New 15-second session cap | pass in a mocked browser session; the connection closed and the UI returned to Start |
| Stop during WebSocket handshake | pass; the socket guard prevents the pinned fal client from sending a queued frame after Stop |
| Localhost-only release boundary | pass; hosted token code is removed, Pages requested preview health only, and live token exchange remained on `127.0.0.1` |

The current blocker is fal account balance, not key recognition or local token
validation. The project must not claim real FLUX.2 visual parity until a funded,
bounded smoke test produces actual frames.

## Required bounded real-service smoke test

After adding a small fal balance:

1. Put the user's own `FAL_KEY` and `CLAY_SCREEN_ACCESS_CODE` in the ignored
   `.env.local` file and run `./run_demo.sh`.
2. Confirm the app binds to `127.0.0.1`, an incorrect access code returns `401`,
   and the fal key never appears in page source, browser storage, or responses.
3. Use one short **Video + Clay** session and receive at least three real frames.
4. Press Stop as soon as the visual behavior is clear; otherwise let the
   15-second cap close the connection.
5. Confirm the fal dashboard reports no more than the expected bounded usage
   and cost.
6. Compare the captured result directly with the original X demo before making a
   visual-parity claim.

Screen, Camera, and the remaining materials are already covered by free UI or
mocked checks. Do not spend on additional real-service combinations unless the
first bounded Clay run reveals a specific issue that needs isolation.

At the price listed on July 15, 2026, a continuously billed 15-second session is
approximately `15 × $0.00194 = $0.0291`. Clients can restart sessions, so the cap
does not impose a hard account-level spending limit.

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
