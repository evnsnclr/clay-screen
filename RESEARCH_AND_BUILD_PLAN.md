# FLUX.2 realtime build plan

Research updated July 15, 2026.

## Reference and model choice

[Ryan Stephen's original demo](https://x.com/Ryan__Stephen/status/2066890410824528077)
shows the target behavior: browser structure survives while the entire surface
is redrawn as a coherent tactile material. Ryan later reported
[using fal at around 20 fps](https://x.com/Ryan__Stephen/status/2066903429881208975).
The post does not publish its complete source or model settings, so Clay Screen
remains an independent approximation.

Clay Screen uses
[`fal-ai/flux-2/klein/realtime`](https://fal.ai/models/fal-ai/flux-2/klein/realtime/api),
a low-step FLUX.2 image-to-image endpoint with persistent WebSocket transport,
fixed seeds, output feedback, and RIFE interpolation. It is a much closer fit
than the earlier 512×288 SD-Turbo Mac pipeline.

## Deliberately small architecture

```text
localhost browser capture
  → newest resized JPEG
  → direct fal realtime WebSocket
  → generated canvas and optional browser recording

localhost FastAPI token endpoint
  → validates a local access code and exact model name
  → uses the user's own ignored FAL_KEY
  → mints a short-lived fal token
  → never receives image frames
```

Visible controls remain limited to source, material, transformation, start or
stop, and recording. There is no account system, database, job queue, model
picker, frontend build system, or hosted billing service.

## Release and billing boundary

- **GitHub Pages** is interface-only and never runs AI.
- **Live FLUX.2** runs only from `127.0.0.1` through `./run_demo.sh` with each
  user's own ignored `FAL_KEY` and `CLAY_SCREEN_ACCESS_CODE`.
- **No owner-funded public endpoint** is part of this release.
- **Local Mac mode** remains an optional private, free fallback.

The access code gates the localhost token endpoint, but anyone with local access
and the code can start another session. The UI stops each normal FLUX.2 session
after 15 seconds; this is a safety rail rather than a hard billing boundary.

On July 15, 2026, fal listed the endpoint at $0.00194 per compute-second. A
continuously billed 15-second session would be about $0.029. Pricing and service
behavior can change, so users should recheck the model page and keep a small
available balance.

## Privacy boundary

In FLUX.2 mode, selected frames leave the device and are processed by fal. The
localhost token server does not proxy or intentionally store them. The UI must
disclose cloud processing before Start and keep that language aligned with
fal's current payload-retention documentation.

The optional SD-Turbo Mac mode has a different boundary: capture and inference
remain on the Mac and no fal key is used.

## Current verification state

- Unit tests cover missing keys, bad access codes, exact endpoint scoping, and
  non-cacheable token responses without contacting fal.
- Mocked browser tests cover token exchange, frame backpressure, generated
  output, recording readiness, and connection cleanup without paid inference.
- The real fal key authenticated, but token creation returned HTTP 403 because
  the fal balance was exhausted.
- No paid frames were generated, observed test cost was $0, and visual parity
  with the original X demo remains unverified.
- The 15-second cap and localhost-only release boundary passed the final free
  browser rerun recorded in [VALIDATION.md](VALIDATION.md).

## Primary references

- [FLUX.2 [klein] Realtime API](https://fal.ai/models/fal-ai/flux-2/klein/realtime/api)
- [fal realtime authentication](https://fal.ai/docs/documentation/model-apis/inference/real-time)
- [fal payload handling](https://fal.ai/docs/documentation/model-apis/inference/payloads)
- [Black Forest Labs FLUX.2 repository](https://github.com/black-forest-labs/flux2)
- [Browser screen capture](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia)
- [Apple PyTorch acceleration](https://developer.apple.com/metal/pytorch/)
