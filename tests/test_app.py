import importlib
import os
from pathlib import Path

from fastapi.testclient import TestClient


os.environ["CLAY_SCREEN_BACKEND"] = "preview"
app_module = importlib.import_module("app")
client = TestClient(app_module.app)


def test_health_reports_preview_mode():
    response = client.get("/api/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["backend"] == "preview"
    assert payload["inference"] is False


def test_home_and_static_assets_are_served():
    assert client.get("/").status_code == 200
    assert client.get("/static/app.js").status_code == 200
    assert client.get("/static/styles.css").status_code == 200


def test_session_configuration_is_validated():
    good = client.post(
        "/api/session",
        json={
            "session_id": "4f5dbad8-20d9-4ae9-90dd-73f35e614e32",
            "prompt": "handmade clay",
            "strength": 0.75,
        },
    )
    assert good.status_code == 200

    bad = client.post(
        "/api/session",
        json={"session_id": "../bad", "prompt": "x", "strength": 2.0},
    )
    assert bad.status_code == 422


def test_preview_refuses_uploaded_frames():
    response = client.post("/api/frame", content=b"not-an-image")
    assert response.status_code == 409


def test_preview_refuses_transform_requests():
    response = client.post("/api/transform", content=b"not-an-image")
    assert response.status_code == 409


def test_ui_contract_is_present():
    root = Path(__file__).resolve().parents[1]
    html = (root / "index.html").read_text(encoding="utf-8")
    javascript = (root / "static" / "app.js").read_text(encoding="utf-8")

    for expected in (
        'data-source="screen"',
        'data-source="camera"',
        'data-source="video"',
        'data-style="clay"',
        'id="recordButton"',
        "not intentionally stored",
    ):
        assert expected in html

    assert "getDisplayMedia" in javascript
    assert "MediaRecorder" in javascript
    assert "CLAY_SCREEN" not in javascript
