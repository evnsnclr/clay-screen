# Clay Screen

Turn a shared screen, camera, or video into a handmade world—locally on an
Apple Silicon Mac.

![Clay Screen interface](assets/clay-screen-poster.svg)

[Try the interface demo](https://evnsnclr.github.io/clay-screen/) ·
[Read the research notes](RESEARCH_AND_BUILD_PLAN.md)

The hosted page is an interface preview and does **not** run AI. Clone the repo
to run real SD-Turbo image-to-image diffusion through Apple's Metal/MPS
backend. Screen capture and inference stay on your Mac.

## Run on a Mac

Requirements:

- Apple Silicon (M1–M4 or newer)
- macOS 14 or newer
- Python 3.10 or newer
- about 6 GB free for the one-time model download

```bash
git clone https://github.com/evnsnclr/clay-screen.git
cd clay-screen
./setup_mac.sh
./run_mac.sh
```

Open [http://127.0.0.1:7860](http://127.0.0.1:7860), choose **Screen**,
**Camera**, or **Video**, then click **Start transforming**.

The first generated frame downloads SD-Turbo and TAESD and warms the pipeline,
so it can take a few minutes. Later launches reuse the Hugging Face cache.

## What it includes

- Browser-native screen, camera, and uploaded-video capture
- Clay, felt, ink, and dream prompt presets
- A simple faithful-to-generated blend control
- Local SD-Turbo + StreamDiffusion inference through PyTorch MPS
- Backpressure: only one fresh frame is processed at a time
- A browser-only 10-second recording button
- A static interface preview that can live on GitHub Pages
- No frontend build step, account, API key, or paid GPU

Clay Screen uses 512×288 inputs and a two-timestep StreamDiffusion batch. On a
Mac this is interactive, but it should not be confused with the much higher
frame rates reported for CUDA/TensorRT systems. The interface displays the
measured time for every generated frame.

On the development Mac (`Mac16,5`, 48 GB), four warm-cache server requests took
103–136 ms for the model call. See the reproducible [validation receipt](VALIDATION.md);
performance will vary across Macs.

## How it works

```text
approved browser capture
        │ newest JPEG only
        ▼
local FastAPI endpoint
        │
        ▼
SD-Turbo + StreamDiffusion + TAESD
        │ Apple Metal / MPS
        ▼
generated JPEG → canvas → optional 10s recording
```

The model is loaded lazily on the first frame. Prompt changes reuse the loaded
pipeline and refresh its text embedding. The transformation slider blends the
source and generated image; it does not rebuild the live denoising schedule.

## Privacy

- Your browser always shows its own screen-sharing picker.
- Clay Screen binds to `127.0.0.1` by default.
- In Mac mode, captured frames do not leave your computer.
- The app does not intentionally save source or generated frames.
- The browser saves a file only when you press **Record 10s**.
- Avoid sharing windows containing private information anyway.

## Interface-only preview

Anyone can inspect the UI without installing model dependencies:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-local.txt
./run_preview.sh
```

Preview mode uses a labeled browser effect. It is not presented as diffusion.

## Development

```bash
pip install -r requirements-dev.txt
pytest -q
node --check static/app.js
```

The Mac dependency pins include one deliberate override: the upstream macOS
fork declares Transformers 4.35.2, but Diffusers 0.33.1 imports newer SigLIP
APIs. This project installs Transformers 4.48.3, verified against the local
pipeline.

## Models, licenses, and attribution

Clay Screen's code is Apache-2.0 licensed. It installs the Apache-2.0
[StreamDiffusion macOS fork](https://github.com/patrickhartono/StreamDiffusion-Mac)
at a fixed commit and uses
[SD-Turbo](https://huggingface.co/stabilityai/sd-turbo) plus
[TAESD](https://huggingface.co/madebyollin/taesd). Model weights are downloaded
separately and retain their own licenses. Review the SD-Turbo license before
commercial use.

The visual direction was inspired by
[Ryan Stephen's realtime diffusion UI experiment](https://x.com/Ryan__Stephen/status/2066890410824528077).
This is an independent implementation; the post did not publish its underlying
code or model configuration.
