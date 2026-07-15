# Validation receipt

Updated July 15, 2026.

## Current release gates

| Gate | Result |
|---|---|
| Python tests | pass; 10 tests |
| JavaScript syntax and built-in tests | pass; 17 tests |
| Mocked browser FLUX.2 stream | pass; token, capture, 38 generated frames, recording gate, Stop, and 60-second cap exercised |
| Official fal browser client integration | pass through WebSocket construction; paid inference not attempted without a key |
| Static GitHub Pages preview | pass; clearly labeled interface preview, preview health only, clean console |
| Responsive layout | pass at 390 x 844 |
| Missing server key fails closed | pass |
| Wrong access code fails closed | pass |
| Realtime app allowlist | pass; only `fal-ai/flux-2/klein/realtime` is accepted |
| Token response caching | pass; disabled with `Cache-Control: no-store` |
| `FAL_KEY` in frontend or tracked environment files | pass; not present |
| Real FLUX.2 frame stream | **not run: no `FAL_KEY` is available in this workspace** |
| Vercel production smoke test | **not run: deployment credentials are unavailable** |

The implementation can be tested safely without credentials, but it must not
be described as production-verified until the two real-service gates pass.

## Required real-key smoke test

On a private preview deployment with a small prepaid balance and the account's
available billing controls reviewed:

1. Set `FAL_KEY` and `CLAY_SCREEN_ACCESS_CODE` in Vercel.
2. Confirm an incorrect access code returns `401` and no token.
3. Start Screen, Camera, and Video sources and receive at least 30 generated
   frames from each.
4. Exercise every material preset and the transformation control.
5. Press Stop and verify WebSocket traffic and fal usage stop immediately.
6. Start again and verify the UI closes the session at 60 seconds.
7. Leave the page mid-session and verify no further WebSocket traffic occurs.
8. Confirm page source, browser storage, logs, and network responses never
   expose `FAL_KEY`.
9. Confirm the fal dashboard reports the expected bounded usage and cost.
10. Check the deployed HTTPS page in current Chrome and Safari with a clean
    console.

## Optional local Mac fallback receipt

The previous local backend was validated on an Apple Silicon Mac (`Mac16,5`,
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
that combination. The cloud and CI environments do not install this fork.

## Free verification commands

```bash
pytest -q
find static api server -name '*.js' -print0 | xargs -0 -n1 node --check
node --test tests/*.mjs
git grep -nE 'FAL_KEY=.+|fal_key_[A-Za-z0-9]+'
```

CI deliberately leaves `FAL_KEY` unset and never performs paid inference.
