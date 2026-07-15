# FLUX.2 realtime build plan

Research updated July 15, 2026.

## Reference and model choice

[Ryan Stephen's original demo](https://x.com/Ryan__Stephen/status/2066890410824528077)
shows the behavior Clay Screen targets: browser structure survives while the
entire surface is redrawn as a coherent tactile material. Ryan later reported
[using fal at around 20 fps](https://x.com/Ryan__Stephen/status/2066903429881208975).
The post does not publish its complete source or model settings, so Clay Screen
remains an independent approximation.

The cloud path uses
[`fal-ai/flux-2/klein/realtime`](https://fal.ai/models/fal-ai/flux-2/klein/realtime/api):
a low-step FLUX.2 image-to-image endpoint with persistent WebSocket transport,
fixed seeds, optional output feedback, and optional RIFE interpolation. It is a
much closer fit than the earlier 512×288 SD-Turbo Mac pipeline.

## Deliberately small architecture

```text
browser capture
  → newest resized JPEG
  → direct fal realtime WebSocket
  → generated canvas and optional browser recording

token endpoint (Vercel function or local FastAPI)
  → validates shared access code and exact model name
  → mints a short-lived fal token
  → never receives image frames
```

Visible controls remain limited to source, material, transformation, start or
stop, and recording. There is no account system, database, job queue, model
picker, or frontend framework.

## Hosting and billing boundary

- **Vercel** is the canonical live deployment: it serves the static interface
  and two small JavaScript functions under `api/`, with no frontend build.
- **GitHub Pages** remains an explicitly labeled interface-only preview because
  it cannot protect `FAL_KEY`.
- **Local cloud development** runs the FastAPI mirror of the token endpoint with
  `FAL_KEY` and `CLAY_SCREEN_ACCESS_CODE` in an ignored `.env.local` file.
- **Local Mac mode** remains an optional private, free fallback.

The shared access code stops anonymous visitors from minting tokens, but anyone
who knows it can consume the deployer's fal credits. It is intentionally simple
and appropriate for a bounded showcase, not an open anonymous service. The UI
ends sessions after 60 seconds, but that is not a hard billing guard. Use a
small prepaid balance and verify the billing controls exposed by the fal
account before sharing an owner-funded deployment.

As listed on July 15, 2026, the endpoint costs $0.00194 per compute-second.
Price and service behavior can change, so recheck them before each public demo.

## Privacy boundary

In cloud mode, selected frames leave the device and are processed by fal. The
token server does not proxy or intentionally store them. The UI must disclose
cloud processing before Start, and the deployer must keep that language aligned
with fal's current payload-retention documentation.

## Release gates

- Unit tests cover missing keys, bad access codes, exact endpoint scoping, and
  non-cacheable token responses without contacting fal.
- Configuration tests pin the 60-second cap, and a mocked browser run exercises
  token exchange, frame backpressure, generated output, and connection cleanup
  without paid inference.
- Source, build output, page source, logs, and network responses contain no
  `FAL_KEY`.
- A private real-key smoke test receives at least 30 frames, stops billing on
  Stop and page exit, and matches observed use to the fal dashboard.
- A deployed HTTPS smoke test passes in Chrome and Safari.

The final two gates are currently unverified because this workspace has neither
a fal key nor Vercel deployment credentials. See [VALIDATION.md](VALIDATION.md).

## Primary references

- [FLUX.2 [klein] Realtime API](https://fal.ai/models/fal-ai/flux-2/klein/realtime/api)
- [fal realtime authentication](https://fal.ai/docs/documentation/model-apis/inference/real-time)
- [fal payload handling](https://fal.ai/docs/documentation/model-apis/inference/payloads)
- [Black Forest Labs FLUX.2 repository](https://github.com/black-forest-labs/flux2)
- [Vercel Functions quickstart](https://vercel.com/docs/functions/quickstart)
- [Browser screen capture](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia)
- [Apple PyTorch acceleration](https://developer.apple.com/metal/pytorch/)
