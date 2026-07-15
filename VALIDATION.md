# Validation receipt

Validated locally on July 15, 2026.

## System

- Apple Silicon Mac (`arm64`, model identifier `Mac16,5`)
- 48 GB unified memory
- macOS 15.6
- Python 3.10.16
- PyTorch 2.13.0
- Diffusers 0.33.1
- Transformers 4.48.3
- StreamDiffusion-Mac 0.1.1 at commit `99f146e`

## Gates

| Gate | Result |
|---|---|
| PyTorch built with MPS | pass |
| `torch.backends.mps.is_available()` | pass |
| Server health endpoint | pass; reports `streamdiffusion-mac` and `mps` |
| One-time SD-Turbo + TAESD download | pass; about 4.8 GB total |
| Real PNG input → real generated JPEG | pass; 512×288 JPEG |
| Warm-cache model latency | pass; 103, 136, 103, and 104 ms across four direct requests |
| Full browser video flow | pass; generated canvas updated continuously |
| Browser-reported live rate | about 0.10–0.11 seconds per model frame during the check |
| Browser console | pass; zero errors and zero warnings after favicon fix |
| Python tests | pass; 6 tests |
| JavaScript syntax | pass |

The latency figures cover the model call measured by the server, not capture,
JPEG transport, browser drawing, or the first model download. Performance will
vary by Mac model, thermals, input, and dependency versions.

## Commands used

```bash
pytest -q
node --check static/app.js
curl http://127.0.0.1:7860/api/health
curl -X POST http://127.0.0.1:7860/api/session ...
curl -X POST http://127.0.0.1:7860/api/transform ...
```

The final UI check used a real browser, an uploaded two-second MP4, the running
MPS endpoint, and a screenshot of the live generated canvas.
