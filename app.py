"""Clay Screen: local screen-to-diffusion for Apple Silicon Macs."""

from __future__ import annotations

import json
import os
from pathlib import Path
import re
import tempfile

from fastapi import FastAPI, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field


BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
BACKEND = os.getenv("CLAY_SCREEN_BACKEND", "preview").strip().lower()
MAC_ENABLED = BACKEND in {"mac", "mps"}
MAX_FRAME_BYTES = 2_500_000
SESSION_ID_PATTERN = re.compile(r"^[0-9a-f-]{36}$")
RUNTIME_DIR = Path(tempfile.gettempdir()) / "clay-screen"
RUNTIME_DIR.mkdir(parents=True, exist_ok=True)


class SessionConfig(BaseModel):
    session_id: str = Field(min_length=36, max_length=36)
    prompt: str = Field(min_length=1, max_length=600)
    strength: float = Field(ge=0.55, le=0.95)


def _validated_session_id(value: str) -> str:
    normalized = (value or "").strip().lower()
    if not SESSION_ID_PATTERN.fullmatch(normalized):
        raise ValueError("Invalid session id")
    return normalized


def _config_path(session_id: str) -> Path:
    return RUNTIME_DIR / f"{_validated_session_id(session_id)}.json"


def _write_atomic(path: Path, text: str) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(text, encoding="utf-8")
    os.replace(temporary, path)


def _read_config(session_id: str) -> SessionConfig:
    data = json.loads(_config_path(session_id).read_text(encoding="utf-8"))
    return SessionConfig(**data)


app = FastAPI(title="Clay Screen", docs_url=None, redoc_url=None)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

if MAC_ENABLED:
    from mac_runtime import MacDiffusionEngine

    ENGINE = MacDiffusionEngine()
else:
    ENGINE = None


@app.get("/")
async def home():
    return FileResponse(BASE_DIR / "index.html")


@app.get("/api/health")
async def health():
    if ENGINE is not None:
        return {
            "ok": True,
            "backend": "streamdiffusion-mac",
            "inference": True,
            **ENGINE.status(),
        }
    return {
        "ok": True,
        "backend": "preview",
        "inference": False,
        "device": "browser",
        "model_loaded": False,
    }


@app.post("/api/session")
async def configure_session(config: SessionConfig):
    try:
        config.session_id = _validated_session_id(config.session_id)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    _write_atomic(_config_path(config.session_id), config.model_dump_json())
    return {"ok": True, "session_id": config.session_id}


@app.post("/api/transform")
async def transform_frame(request: Request):
    if ENGINE is None:
        raise HTTPException(
            status_code=409,
            detail="The server is running browser preview mode. Start it with run_mac.sh.",
        )

    session_id = request.headers.get("x-session-id", "").strip().lower()
    try:
        config = _read_config(session_id)
    except (ValueError, FileNotFoundError, json.JSONDecodeError):
        raise HTTPException(status_code=409, detail="Session is missing or invalid")

    payload = await request.body()
    if not payload or len(payload) > MAX_FRAME_BYTES:
        raise HTTPException(status_code=413, detail="Invalid frame payload")

    try:
        jpeg, inference_ms = await run_in_threadpool(
            ENGINE.transform,
            payload,
            config.prompt,
            config.strength,
        )
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    return Response(
        jpeg,
        media_type="image/jpeg",
        headers={
            "Cache-Control": "no-store",
            "X-Inference-Ms": str(round(inference_ms)),
            "X-Backend": "mps",
        },
    )


@app.post("/api/frame")
async def legacy_frame_endpoint():
    raise HTTPException(
        status_code=409,
        detail="Clay Screen now uses the local Mac transform endpoint",
    )


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "7860"))
    uvicorn.run(app, host="127.0.0.1", port=port)
