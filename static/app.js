const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const inputVideo = $("#inputVideo");
const inputEmpty = $("#inputEmpty");
const outputCanvas = $("#outputCanvas");
const outputContext = outputCanvas.getContext("2d");
const outputEmpty = $("#outputEmpty");
const captureCanvas = $("#captureCanvas");
const captureContext = captureCanvas.getContext("2d");
const videoFile = $("#videoFile");
const sourceStatus = $("#sourceStatus");
const outputStatus = $("#outputStatus");
const sessionMessage = $("#sessionMessage");
const startButton = $("#startButton");
const recordButton = $("#recordButton");
const stopSharingButton = $("#stopSharingButton");
const liveIndicator = $("#liveIndicator");
const runtimeBadge = $("#runtimeBadge");
const strength = $("#strength");
const strengthValue = $("#strengthValue");

const STYLE_PROMPTS = {
  clay: "handmade stop-motion claymation, soft polymer clay, tactile fingerprints, rounded extruded shapes, matte pastel colors, miniature diorama lighting, preserve the original layout and composition",
  felt: "hand-cut felt art, soft wool fibers, layered textile shapes, embroidered details, warm craft-table lighting, preserve the original layout and composition",
  ink: "expressive india ink illustration on warm paper, bold brush edges, subtle watercolor bleed, editorial drawing, preserve the original layout and composition",
  dream: "surreal miniature dream world, pearlescent glass, soft luminous gradients, playful sculptural forms, cinematic glow, preserve the original layout and composition"
};

const PREVIEW_FILTERS = {
  clay: "saturate(1.28) contrast(1.05) sepia(.12)",
  felt: "saturate(.88) contrast(1.12) sepia(.18)",
  ink: "grayscale(.78) contrast(1.5) sepia(.22)",
  dream: "saturate(1.65) contrast(.94) hue-rotate(12deg)"
};

let runtime = { backend: "preview", inference: false, device: "browser" };
let sourceStream = null;
let sourceKind = null;
let sourceObjectUrl = null;
let selectedStyle = "clay";
let running = false;
let previewAnimation = null;
let frameRequestPending = false;
let sessionId = null;
let recorder = null;
let recordingTimer = null;
let generatedFrames = 0;

async function boot() {
  try {
    const response = await fetch("api/health", { cache: "no-store" });
    if (response.ok) runtime = await response.json();
  } catch {
    // A static GitHub Pages build intentionally uses the browser preview.
  }

  if (runtime.inference) {
    runtimeBadge.textContent = "MAC · MPS READY";
    runtimeBadge.classList.add("is-local");
    sessionMessage.textContent = runtime.model_loaded
      ? "Local diffusion is ready. Pick a source to begin."
      : "Local Mac mode is ready. The first frame downloads and warms the model.";
  } else {
    runtimeBadge.textContent = "INTERFACE DEMO";
    runtimeBadge.classList.remove("is-local");
    sessionMessage.textContent = "This hosted page previews the interface. Clone it on an Apple Silicon Mac for AI diffusion.";
  }
}

function setMessage(message, tone = "normal") {
  sessionMessage.textContent = message;
  sessionMessage.dataset.tone = tone;
}

function setSourceSelected(kind) {
  sourceKind = kind;
  $$(".source-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.source === kind);
  });
  sourceStatus.textContent = kind === "video" ? "video loaded" : `${kind} selected`;
  inputEmpty.hidden = true;
  inputVideo.hidden = false;
  stopSharingButton.hidden = kind === "video";
  setMessage("Source ready. Choose a material and start transforming.");
}

function stopSourceTracks() {
  if (sourceStream) sourceStream.getTracks().forEach((track) => track.stop());
  sourceStream = null;
  inputVideo.srcObject = null;
  if (sourceObjectUrl) URL.revokeObjectURL(sourceObjectUrl);
  sourceObjectUrl = null;
}

async function chooseScreen() {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error("Screen sharing is unavailable in this browser.");
  }
  stopSourceTracks();
  sourceStream = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: { ideal: 12, max: 16 } },
    audio: false,
    surfaceSwitching: "include"
  });
  inputVideo.srcObject = sourceStream;
  await inputVideo.play();
  sourceStream.getVideoTracks()[0].addEventListener("ended", () => stopAll());
  setSourceSelected("screen");
}

async function chooseCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera access is unavailable in this browser.");
  }
  stopSourceTracks();
  sourceStream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 16 } },
    audio: false
  });
  inputVideo.srcObject = sourceStream;
  await inputVideo.play();
  setSourceSelected("camera");
}

function chooseVideo() {
  videoFile.click();
}

async function loadVideoFile(file) {
  if (!file) return;
  stopSourceTracks();
  sourceObjectUrl = URL.createObjectURL(file);
  inputVideo.src = sourceObjectUrl;
  inputVideo.loop = true;
  await inputVideo.play();
  setSourceSelected("video");
}

function drawCover(context, media, width, height) {
  const mediaWidth = media.videoWidth || media.naturalWidth || width;
  const mediaHeight = media.videoHeight || media.naturalHeight || height;
  const scale = Math.max(width / mediaWidth, height / mediaHeight);
  const drawWidth = mediaWidth * scale;
  const drawHeight = mediaHeight * scale;
  context.drawImage(media, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}

function renderPreview() {
  if (!running || runtime.inference) return;
  outputContext.save();
  outputContext.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
  outputContext.filter = PREVIEW_FILTERS[selectedStyle];
  drawCover(outputContext, inputVideo, outputCanvas.width, outputCanvas.height);
  outputContext.filter = "none";
  outputContext.globalCompositeOperation = "soft-light";
  const alpha = Number(strength.value) / 500;
  const colors = { clay: "#f28a5b", felt: "#d9b68c", ink: "#1d2b32", dream: "#a586ff" };
  outputContext.fillStyle = `${colors[selectedStyle]}${Math.round(alpha * 255).toString(16).padStart(2, "0")}`;
  outputContext.fillRect(0, 0, outputCanvas.width, outputCanvas.height);
  outputContext.restore();
  previewAnimation = requestAnimationFrame(renderPreview);
}

async function configureSession() {
  if (!sessionId) sessionId = crypto.randomUUID();
  const response = await fetch("api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: sessionId,
      prompt: STYLE_PROMPTS[selectedStyle],
      strength: Number(strength.value) / 100
    })
  });
  if (!response.ok) throw new Error("Could not configure the local session.");
}

async function readableError(response) {
  try {
    const payload = await response.json();
    return payload.detail || `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

async function sendMacFrame() {
  if (!running || !runtime.inference || frameRequestPending || !inputVideo.videoWidth) return;
  frameRequestPending = true;
  captureContext.clearRect(0, 0, captureCanvas.width, captureCanvas.height);
  drawCover(captureContext, inputVideo, captureCanvas.width, captureCanvas.height);
  const blob = await new Promise((resolve) => captureCanvas.toBlob(resolve, "image/jpeg", 0.8));

  try {
    const response = await fetch("api/transform", {
      method: "POST",
      headers: { "X-Session-ID": sessionId },
      body: blob
    });
    if (!response.ok) throw new Error(await readableError(response));

    const inferenceMs = Number(response.headers.get("X-Inference-Ms"));
    const bitmap = await createImageBitmap(await response.blob());
    outputContext.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
    outputContext.drawImage(bitmap, 0, 0, outputCanvas.width, outputCanvas.height);
    bitmap.close();
    generatedFrames += 1;
    const timing = Number.isFinite(inferenceMs) ? `${(inferenceMs / 1000).toFixed(2)}s / frame` : "local MPS";
    outputStatus.textContent = `${timing} · ${generatedFrames} frames`;
    setMessage("Local diffusion is running. Only the newest frame is processed, so latency cannot build up.");
  } catch (error) {
    setMessage(error.message || "Local inference failed.", "error");
    stopTransform();
    return;
  } finally {
    frameRequestPending = false;
  }

  if (running) requestAnimationFrame(sendMacFrame);
}

async function startMacSession() {
  generatedFrames = 0;
  await configureSession();
  outputStatus.textContent = runtime.model_loaded ? "starting MPS" : "loading SD-Turbo";
  setMessage("Starting local AI. The first run downloads model weights and may take a few minutes.");
  requestAnimationFrame(sendMacFrame);
}

async function startTransform() {
  if (running) {
    stopTransform();
    return;
  }
  if (!sourceKind) await chooseScreen();
  if (!inputVideo.videoWidth) {
    await new Promise((resolve) => inputVideo.addEventListener("loadeddata", resolve, { once: true }));
  }

  running = true;
  startButton.querySelector("span").textContent = "Stop transforming";
  startButton.classList.add("is-running");
  outputEmpty.hidden = true;
  liveIndicator.hidden = false;
  recordButton.disabled = false;
  outputStatus.textContent = runtime.inference ? "starting local AI" : "interface preview · not AI";

  try {
    if (runtime.inference) await startMacSession();
    else {
      setMessage("Interface preview is running. Clone and start run_mac.sh for generated frames.");
      renderPreview();
    }
  } catch (error) {
    setMessage(error.message || "The session could not start.", "error");
    stopTransform();
  }
}

function stopTransform() {
  running = false;
  frameRequestPending = false;
  if (previewAnimation) cancelAnimationFrame(previewAnimation);
  previewAnimation = null;
  liveIndicator.hidden = true;
  recordButton.disabled = true;
  startButton.classList.remove("is-running");
  startButton.querySelector("span").textContent = "Start transforming";
  outputStatus.textContent = "stopped";
}

function stopAll() {
  stopTransform();
  stopSourceTracks();
  sourceKind = null;
  sessionId = null;
  inputVideo.removeAttribute("src");
  inputVideo.load();
  inputVideo.hidden = true;
  inputEmpty.hidden = false;
  stopSharingButton.hidden = true;
  sourceStatus.textContent = "nothing selected";
  $$(".source-button").forEach((button) => button.classList.remove("is-active"));
  setMessage("Sharing stopped. Pick a source to begin again.");
}

function supportedRecordingType() {
  const candidates = ["video/mp4;codecs=h264", "video/webm;codecs=vp9", "video/webm"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function startRecording() {
  if (recorder?.state === "recording") return;
  const stream = outputCanvas.captureStream(12);
  const mimeType = supportedRecordingType();
  const chunks = [];
  recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size) chunks.push(event.data);
  });
  recorder.addEventListener("stop", () => {
    const type = recorder.mimeType || mimeType || "video/webm";
    const extension = type.includes("mp4") ? "mp4" : "webm";
    const output = new Blob(chunks, { type });
    const url = URL.createObjectURL(output);
    const link = document.createElement("a");
    link.href = url;
    link.download = `clay-screen-${Date.now()}.${extension}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    recordButton.textContent = "Record 10s";
    setMessage("Recording saved. Keep the strongest short clip for the project page.");
  });
  recorder.start(250);
  let remaining = 10;
  recordButton.textContent = `Recording ${remaining}s`;
  recordingTimer = setInterval(() => {
    remaining -= 1;
    recordButton.textContent = `Recording ${remaining}s`;
    if (remaining <= 0) {
      clearInterval(recordingTimer);
      recorder.stop();
    }
  }, 1000);
}

$$(".source-button").forEach((button) => button.addEventListener("click", async () => {
  try {
    if (button.dataset.source === "screen") await chooseScreen();
    if (button.dataset.source === "camera") await chooseCamera();
    if (button.dataset.source === "video") chooseVideo();
  } catch (error) {
    setMessage(error.message || "The source could not be opened.", "error");
  }
}));

videoFile.addEventListener("change", () => loadVideoFile(videoFile.files?.[0]));
$$(".style-swatch").forEach((button) => button.addEventListener("click", async () => {
  selectedStyle = button.dataset.style;
  $$(".style-swatch").forEach((item) => item.classList.toggle("is-active", item === button));
  if (running && runtime.inference) await configureSession();
}));
strength.addEventListener("input", () => {
  strengthValue.textContent = `${strength.value}%`;
});
strength.addEventListener("change", async () => {
  if (running && runtime.inference) await configureSession();
});
startButton.addEventListener("click", startTransform);
recordButton.addEventListener("click", startRecording);
stopSharingButton.addEventListener("click", stopAll);
window.addEventListener("beforeunload", stopSourceTracks);

boot();
