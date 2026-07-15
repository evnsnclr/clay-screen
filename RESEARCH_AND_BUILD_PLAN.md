# Recreating the realtime diffusion UI on a Mac

Research updated: July 15, 2026

## What the reference likely does

[Ryan Stephen's post](https://x.com/Ryan__Stephen/status/2066890410824528077)
only says “playing with realtime diffusion ui.” It does not identify the model
or publish code. The visible behavior is consistent with image/video-to-video
diffusion: the large layout survives while text mutates and surfaces are redrawn
as clay.

The simplest recreation is:

1. `getDisplayMedia()` captures a browser-approved screen or window.
2. The browser sends only the newest resized frame.
3. A low-step image-to-image pipeline redraws it from a material prompt.
4. The generated image is painted back to a canvas and can be recorded.

## Why the project now runs on Mac

The original StreamDiffusion project documents browser screen capture and very
high rates on an RTX 4090 with TensorRT. Those numbers do not transfer to a Mac.
Apple does, however, provide PyTorch GPU acceleration through the Metal
Performance Shaders (`mps`) device, and the StreamDiffusion macOS fork adapts
its timing and image-to-image path for M1–M4 hardware.

Clay Screen therefore uses:

- Apple Silicon + PyTorch MPS
- SD-Turbo, a distilled one-to-four-step Stable Diffusion model
- StreamDiffusion's streaming denoising batch
- TAESD as the small autoencoder
- 512×288 inputs and two selected timesteps
- request/response backpressure instead of pretending the Mac produces 10–16 fps

Primary references:

- [Apple: Accelerated PyTorch training on Mac](https://developer.apple.com/metal/pytorch/)
- [StreamDiffusion](https://github.com/cumulo-autumn/StreamDiffusion)
- [StreamDiffusion-Mac](https://github.com/patrickhartono/StreamDiffusion-Mac)
- [SD-Turbo model card](https://huggingface.co/stabilityai/sd-turbo)
- [Browser screen capture](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia)

## The bounded public version

The app intentionally has five visible decisions:

1. Source: screen, camera, or video
2. Material: clay, felt, ink, or dream
3. Transformation blend
4. Start/stop
5. Record 10 seconds

Model selection, schedulers, seeds, graph editors, accounts, API keys, and paid
cloud infrastructure stay out of version 1.

## Honest demo boundary

GitHub Pages can host the complete interface but cannot execute PyTorch. The
public URL is therefore labeled **Interface demo** and uses a simple browser
effect. Real diffusion starts with `./run_mac.sh` after cloning the repo.

This yields a simple and durable public story:

- GitHub Pages: instant visual/interaction demo
- GitHub repository: source of truth and three-command Mac setup
- Local Mac: actual AI, private transport, no ongoing bill

The full SD-Turbo model is downloaded once to the user's Hugging Face cache.
The model has its own Stability AI Community License; the app code and
StreamDiffusion dependency are Apache-2.0.

## Expected limitations

- The first frame is slow because the weights download and the pipeline warms.
- Apple MPS is interactive but slower than CUDA/TensorRT.
- Small text becomes invented or unreadable.
- Fast changes can flicker because each image is regenerated.
- SD-Turbo works best near its preferred 512-pixel scale.
- Browser screen sharing requires a user gesture and fresh permission.

## Success criteria

- A clean Apple Silicon Mac can install and launch with the documented commands.
- Health checks report MPS availability before weights load.
- A real input frame returns a real generated JPEG with measured latency.
- The browser never queues multiple stale inference requests.
- The public page never describes its CSS preview as AI.
- No API key, captured frame, or model weight is committed to Git.
