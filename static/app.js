import {
  CLOUD_SESSION_LIMIT_MS,
  FAL_CLIENT_URL,
  FAL_MODEL,
  FLUX_INPUT_SIZE,
  FLUX_JPEG_QUALITY,
  FLUX_OUTPUT_SIZE,
  availableRealRuntimes,
  buildFluxInput,
  chooseRuntime,
  isInterfacePreviewLocation,
} from "./flux-config.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const studio = $("#studio");
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
const runtimeControl = $("#runtimeControl");
const runtimeSelect = $("#runtimeSelect");
const accessControl = $("#accessControl");
const accessCode = $("#accessCode");
const strength = $("#strength");
const strengthValue = $("#strengthValue");

const STYLE_PROMPTS = {
  clay: "Transform the entire interface into handmade stop-motion polymer clay. Preserve the exact composition, browser chrome, roads, controls, cards, and large text placement. Use tactile fingerprints, rounded raised edges, colorful clay markers, matte pastel surfaces, soft contact shadows, and miniature diorama lighting.",
  felt: "Transform the entire interface into layered hand-cut felt. Preserve the exact composition, controls, map structure, cards, and large text placement. Use visible wool fibers, embroidered edges, stacked textile shapes, warm craft-table lighting, and soft dimensional shadows.",
  ink: "Transform the entire interface into an expressive India ink illustration on warm paper. Preserve the exact composition, controls, map structure, cards, and large text placement. Use bold brush edges, restrained watercolor bleed, crisp editorial shapes, and subtle paper texture.",
  dream: "Transform the entire interface into a surreal miniature dream world. Preserve the exact composition, controls, map structure, cards, and large text placement. Use pearlescent glass, soft luminous gradients, playful sculptural forms, and cinematic glow.",
};

const PREVIEW_FILTERS = {
  clay: "saturate(1.28) contrast(1.05) sepia(.12)",
  felt: "saturate(.88) contrast(1.12) sepia(.18)",
  ink: "grayscale(.78) contrast(1.5) sepia(.22)",
  dream: "saturate(1.65) contrast(.94) hue-rotate(12deg)",
};

const state = {
  health: {},
  mode: "preview",
  running: false,
  generation: 0,
  generatedFrames: 0,
  firstOutput: false,
  inFlight: false,
  abortController: null,
  cloudConnection: null,
  cloudPending: null,
  cloudStartedAt: 0,
  outputQueue: [],
  outputBusy: false,
  outputTimer: null,
  previewAnimation: null,
  sessionTimer: null,
  startupTimer: null,
  recording: null,
};

let sourceStream = null;
let sourceKind = null;
let sourceObjectUrl = null;
let selectedStyle = "clay";
let sessionId = null;

async function boot() {
  state.health = await loadHealth();
  populateRuntimeSelector();
  applyRuntime(state.health.default_runtime || chooseRuntime(state.health));
}

async function loadHealth() {
  if (!isInterfacePreviewLocation(window.location)) {
    try {
      const response = await fetch("api/health", { cache: "no-store" });
      if (response.ok) return await response.json();
    } catch {
      // Static hosts do not have a token function.
    }
  }

  try {
    const response = await fetch("api/preview-health.json", { cache: "no-store" });
    if (response.ok) return await response.json();
  } catch {
    // The hard-coded preview fallback below is intentionally non-AI.
  }

  return { runtimes: { preview: { available: true } }, default_runtime: "preview" };
}

function populateRuntimeSelector() {
  const runtimes = availableRealRuntimes(state.health);
  runtimeSelect.replaceChildren();
  for (const mode of runtimes) {
    const option = document.createElement("option");
    option.value = mode;
    option.textContent = mode === "cloud" ? "FLUX.2 Cloud" : "Local Mac";
    runtimeSelect.append(option);
  }
  runtimeControl.hidden = runtimes.length < 2;
}

function applyRuntime(mode, { announce = true } = {}) {
  const available = state.health.runtimes?.[mode]?.available;
  state.mode = available || mode === "preview" ? mode : chooseRuntime(state.health);
  studio.dataset.runtime = state.mode;
  runtimeSelect.value = state.mode;
  runtimeBadge.classList.remove("is-cloud", "is-local");
  accessControl.hidden = state.mode !== "cloud";

  if (state.mode === "cloud") {
    captureCanvas.width = FLUX_INPUT_SIZE;
    captureCanvas.height = FLUX_INPUT_SIZE;
    outputCanvas.width = FLUX_OUTPUT_SIZE;
    outputCanvas.height = FLUX_OUTPUT_SIZE;
    runtimeBadge.textContent = "FLUX.2 · CLOUD READY";
    runtimeBadge.classList.add("is-cloud");
    if (announce) setMessage("FLUX.2 is ready. Enter the demo code, then choose a source.");
    return;
  }

  captureCanvas.width = 512;
  captureCanvas.height = 288;
  outputCanvas.width = 832;
  outputCanvas.height = 480;

  if (state.mode === "local") {
    const local = state.health.runtimes?.local || {};
    runtimeBadge.textContent = "MAC · MPS READY";
    runtimeBadge.classList.add("is-local");
    if (announce) {
      setMessage(local.model_loaded
        ? "Local diffusion is ready. Pick a source to begin."
        : "Local Mac mode is ready. The first frame downloads and warms the model.");
    }
    return;
  }

  runtimeBadge.textContent = "INTERFACE PREVIEW";
  if (announce) {
    setMessage("This static page previews the interface. Deploy it with your own fal key for live FLUX.2.");
  }
}

function setMessage(message, tone = "normal") {
  sessionMessage.textContent = message;
  sessionMessage.dataset.tone = tone;
}

function setSourceSelected(kind) {
  sourceKind = kind;
  $$(".source-button").forEach((button) => {
    const active = button.dataset.source === kind;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  sourceStatus.textContent = kind === "video" ? "video loaded" : `${kind} selected`;
  inputEmpty.hidden = true;
  inputVideo.hidden = false;
  stopSharingButton.hidden = kind === "video";
  setMessage(state.mode === "cloud"
    ? "Source ready. Cloud mode sends sampled frames to fal when you start."
    : "Source ready. Choose a material and start transforming.");
}

function stopSourceTracks() {
  if (sourceStream) sourceStream.getTracks().forEach((track) => track.stop());
  sourceStream = null;
  inputVideo.pause();
  inputVideo.srcObject = null;
  if (sourceObjectUrl) URL.revokeObjectURL(sourceObjectUrl);
  sourceObjectUrl = null;
  inputVideo.removeAttribute("src");
  inputVideo.load();
}

async function chooseScreen() {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error("Screen sharing is unavailable in this browser.");
  }
  if (state.running) stopTransform();
  stopSourceTracks();
  const targetRate = state.mode === "cloud" ? 24 : 16;
  sourceStream = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: { ideal: targetRate, max: state.mode === "cloud" ? 30 : 16 } },
    audio: false,
    surfaceSwitching: "include",
  });
  inputVideo.srcObject = sourceStream;
  await inputVideo.play();
  const track = sourceStream.getVideoTracks()[0];
  track.addEventListener("ended", () => {
    if (sourceStream?.getVideoTracks().includes(track)) stopAll();
  });
  setSourceSelected("screen");
}

async function chooseCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera access is unavailable in this browser.");
  }
  if (state.running) stopTransform();
  stopSourceTracks();
  sourceStream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: state.mode === "cloud" ? 24 : 16 },
    },
    audio: false,
  });
  inputVideo.srcObject = sourceStream;
  await inputVideo.play();
  const track = sourceStream.getVideoTracks()[0];
  track.addEventListener("ended", () => {
    if (sourceStream?.getVideoTracks().includes(track)) stopAll();
  });
  setSourceSelected("camera");
}

function chooseVideo() {
  videoFile.value = "";
  videoFile.click();
}

async function loadVideoFile(file) {
  if (!file) return;
  if (state.running) stopTransform();
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
  context.drawImage(
    media,
    (width - drawWidth) / 2,
    (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
}

function renderPreview() {
  if (!state.running || state.mode !== "preview") return;
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
  state.previewAnimation = requestAnimationFrame(renderPreview);
}

async function readableError(response) {
  try {
    const payload = await response.json();
    return payload.detail || payload.error || `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

async function requestFalToken(app, code, generation) {
  if (app !== FAL_MODEL) throw new Error("Unexpected fal endpoint");
  try {
    const response = await fetch("api/fal/realtime-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app, accessCode: code }),
    });
    if (!response.ok) throw new Error(await readableError(response));
    const payload = await response.json();
    if (!payload.token || typeof payload.token !== "string") {
      throw new Error("The token endpoint returned an invalid response");
    }
    if (generation === state.generation) accessCode.value = "";
    return payload.token;
  } catch (error) {
    if (generation === state.generation) handleCloudError(error, generation);
    throw error;
  }
}

async function startCloudSession(generation) {
  let code = accessCode.value.trim();
  if (!code) throw new Error("Enter the demo access code before starting FLUX.2.");

  outputStatus.textContent = "connecting to FLUX.2";
  setMessage("Authorizing a short FLUX.2 session. Frames are processed by fal.ai.");
  const { fal } = await import(FAL_CLIENT_URL);
  if (!isCurrentRun(generation)) return;

  const provideToken = (app) => {
    const oneTimeCode = code;
    code = "";
    return requestFalToken(app, oneTimeCode, generation);
  };

  state.cloudConnection = fal.realtime.connect(FAL_MODEL, {
    connectionKey: `clay-screen-${crypto.randomUUID()}`,
    tokenProvider: provideToken,
    throttleInterval: 100,
    maxBuffering: 1,
    onResult: (result) => handleCloudResult(result, generation),
    onError: (error) => handleCloudError(error, generation),
  });

  state.startupTimer = setTimeout(() => {
    if (isCurrentRun(generation) && !state.firstOutput) {
      handleCloudError(new Error("FLUX.2 did not return a frame in time."), generation);
    }
  }, 20_000);
  state.sessionTimer = setTimeout(() => {
    if (isCurrentRun(generation)) {
      stopTransform("The 60-second cloud session ended to keep usage bounded.");
    }
  }, CLOUD_SESSION_LIMIT_MS);
  sendCloudFrame(generation);
}

function sendCloudFrame(generation) {
  if (!isCurrentRun(generation) || state.inFlight || !inputVideo.videoWidth) return;
  captureContext.clearRect(0, 0, captureCanvas.width, captureCanvas.height);
  drawCover(captureContext, inputVideo, captureCanvas.width, captureCanvas.height);
  const sourceDataUrl = captureCanvas.toDataURL("image/jpeg", FLUX_JPEG_QUALITY);
  const requestId = crypto.randomUUID();

  state.inFlight = true;
  state.cloudStartedAt = performance.now();
  state.cloudPending = { requestId, sourceDataUrl };
  try {
    state.cloudConnection.send(buildFluxInput({
      imageUrl: sourceDataUrl,
      prompt: STYLE_PROMPTS[selectedStyle],
      requestId,
    }));
  } catch (error) {
    state.inFlight = false;
    state.cloudPending = null;
    handleCloudError(error, generation);
  }
}

function handleCloudResult(result, generation) {
  if (!isCurrentRun(generation)) return;
  const pending = state.cloudPending;
  state.inFlight = false;
  state.cloudPending = null;
  const latencyMs = performance.now() - state.cloudStartedAt;

  if (!Array.isArray(result?.images) || !result.images.length || !pending) {
    handleCloudError(new Error("FLUX.2 returned an empty frame."), generation);
    return;
  }

  for (const image of result.images) {
    state.outputQueue.push({ image, sourceDataUrl: pending.sourceDataUrl, latencyMs, generation });
  }
  while (state.outputQueue.length > 4) state.outputQueue.shift();
  drainOutputQueue();
  requestAnimationFrame(() => sendCloudFrame(generation));
}

function handleCloudError(error, generation) {
  if (!isCurrentRun(generation)) return;
  const rawMessage = error?.message || "The FLUX.2 connection failed.";
  const message = rawMessage === "Unknown error"
    ? "FLUX.2 connection failed. Check the access code and try again."
    : rawMessage;
  stopTransform(message, "error");
}

function drainOutputQueue() {
  if (state.outputBusy || !state.outputQueue.length) return;
  state.outputBusy = true;
  const frame = state.outputQueue.shift();
  paintCloudFrame(frame).finally(() => {
    if (!isCurrentRun(frame.generation)) {
      state.outputBusy = false;
      return;
    }
    state.outputTimer = setTimeout(() => {
      state.outputTimer = null;
      state.outputBusy = false;
      drainOutputQueue();
    }, 45);
  });
}

async function paintCloudFrame({ image, sourceDataUrl, latencyMs, generation }) {
  try {
    const generated = await rawImageBitmap(image);
    if (!isCurrentRun(generation)) {
      generated.close();
      return;
    }

    const effect = Number(strength.value) / 100;
    let source = null;
    if (effect < 1) {
      source = await dataUrlBitmap(sourceDataUrl);
      if (!isCurrentRun(generation)) {
        source.close();
        generated.close();
        return;
      }
    }

    outputContext.save();
    outputContext.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
    if (source) {
      outputContext.drawImage(source, 0, 0, outputCanvas.width, outputCanvas.height);
      source.close();
      outputContext.globalAlpha = effect;
    }
    outputContext.drawImage(generated, 0, 0, outputCanvas.width, outputCanvas.height);
    outputContext.restore();
    generated.close();
    markGeneratedFrame(`FLUX.2 · ${Math.round(latencyMs)}ms`);
  } catch (error) {
    handleCloudError(error, generation);
  }
}

async function rawImageBitmap(image) {
  if (image?.content instanceof Uint8Array) {
    return createImageBitmap(new Blob([image.content], { type: image.content_type || "image/jpeg" }));
  }
  if (image?.content instanceof ArrayBuffer) {
    return createImageBitmap(new Blob([image.content], { type: image.content_type || "image/jpeg" }));
  }
  if (typeof image?.content !== "string") throw new Error("FLUX.2 returned unreadable image bytes");
  const dataUrl = image.content.startsWith("data:")
    ? image.content
    : `data:${image.content_type || "image/jpeg"};base64,${image.content}`;
  return dataUrlBitmap(dataUrl);
}

async function dataUrlBitmap(dataUrl) {
  const response = await fetch(dataUrl);
  return createImageBitmap(await response.blob());
}

async function configureLocalSession() {
  if (!sessionId) sessionId = crypto.randomUUID();
  const response = await fetch("api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: sessionId,
      prompt: STYLE_PROMPTS[selectedStyle],
      strength: Number(strength.value) / 100,
    }),
  });
  if (!response.ok) throw new Error("Could not configure the local session.");
}

async function sendMacFrame(generation) {
  if (!isCurrentRun(generation) || state.inFlight || !inputVideo.videoWidth) return;
  state.inFlight = true;
  captureContext.clearRect(0, 0, captureCanvas.width, captureCanvas.height);
  drawCover(captureContext, inputVideo, captureCanvas.width, captureCanvas.height);
  const blob = await new Promise((resolve) => captureCanvas.toBlob(resolve, "image/jpeg", 0.8));
  if (!isCurrentRun(generation)) return;
  const controller = new AbortController();
  state.abortController = controller;

  try {
    const response = await fetch("api/transform", {
      method: "POST",
      headers: { "X-Session-ID": sessionId },
      body: blob,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(await readableError(response));
    const inferenceMs = Number(response.headers.get("X-Inference-Ms"));
    const bitmap = await createImageBitmap(await response.blob());
    if (!isCurrentRun(generation)) {
      bitmap.close();
      return;
    }
    outputContext.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
    outputContext.drawImage(bitmap, 0, 0, outputCanvas.width, outputCanvas.height);
    bitmap.close();
    const timing = Number.isFinite(inferenceMs) ? `Mac · ${Math.round(inferenceMs)}ms` : "Mac · MPS";
    markGeneratedFrame(timing);
  } catch (error) {
    if (error?.name !== "AbortError" && isCurrentRun(generation)) {
      stopTransform(error.message || "Local inference failed.", "error");
      return;
    }
  } finally {
    if (generation === state.generation) state.inFlight = false;
    if (state.abortController === controller) state.abortController = null;
  }

  if (isCurrentRun(generation)) requestAnimationFrame(() => sendMacFrame(generation));
}

async function startLocalSession(generation) {
  await configureLocalSession();
  outputStatus.textContent = state.health.runtimes?.local?.model_loaded
    ? "starting MPS"
    : "loading SD-Turbo";
  setMessage("Starting local AI. The first run may need to download model weights.");
  requestAnimationFrame(() => sendMacFrame(generation));
}

function markGeneratedFrame(label) {
  state.generatedFrames += 1;
  outputStatus.textContent = `${label} · ${state.generatedFrames} frames`;
  if (!state.firstOutput) {
    state.firstOutput = true;
    clearTimeout(state.startupTimer);
    state.startupTimer = null;
    recordButton.disabled = false;
    setMessage(state.mode === "cloud"
      ? "FLUX.2 is live. The newest source frame is sent only after a result returns."
      : "Local diffusion is live. Only the newest frame is processed.");
  }
}

async function startTransform() {
  if (state.running) {
    stopTransform();
    return;
  }

  try {
    if (!sourceKind) await chooseScreen();
    if (!inputVideo.videoWidth) {
      await new Promise((resolve) => inputVideo.addEventListener("loadeddata", resolve, { once: true }));
    }
    if (state.mode === "cloud" && !accessCode.value.trim()) {
      accessCode.focus();
      throw new Error("Enter the demo access code before starting FLUX.2.");
    }

    const generation = ++state.generation;
    state.running = true;
    state.generatedFrames = 0;
    state.firstOutput = false;
    state.inFlight = false;
    studio.setAttribute("aria-busy", "true");
    startButton.querySelector("span").textContent = "Stop transforming";
    startButton.classList.add("is-running");
    outputEmpty.hidden = true;
    liveIndicator.hidden = false;
    recordButton.disabled = true;
    outputStatus.textContent = "starting";

    if (state.mode === "cloud") await startCloudSession(generation);
    else if (state.mode === "local") await startLocalSession(generation);
    else {
      outputStatus.textContent = "interface preview · not AI";
      setMessage("Interface preview is running. Deploy with a fal key for generated frames.");
      renderPreview();
    }
  } catch (error) {
    if (state.running) stopTransform(error.message || "The session could not start.", "error");
    else setMessage(error.message || "The session could not start.", "error");
  }
}

function isCurrentRun(generation) {
  return state.running && generation === state.generation;
}

function stopTransform(message = "Transformation stopped.", tone = "normal", { saveRecording = true } = {}) {
  state.running = false;
  state.generation += 1;
  state.inFlight = false;
  state.cloudPending = null;
  state.outputQueue = [];
  state.outputBusy = false;
  state.abortController?.abort();
  state.abortController = null;
  state.cloudConnection?.close();
  state.cloudConnection = null;
  if (state.previewAnimation) cancelAnimationFrame(state.previewAnimation);
  state.previewAnimation = null;
  clearTimeout(state.outputTimer);
  clearTimeout(state.sessionTimer);
  clearTimeout(state.startupTimer);
  state.outputTimer = null;
  state.sessionTimer = null;
  state.startupTimer = null;
  stopRecording(saveRecording);
  studio.setAttribute("aria-busy", "false");
  liveIndicator.hidden = true;
  recordButton.disabled = true;
  startButton.classList.remove("is-running");
  startButton.querySelector("span").textContent = "Start transforming";
  outputStatus.textContent = "stopped";
  setMessage(message, tone);
}

function stopAll({ saveRecording = true } = {}) {
  if (state.running) stopTransform("Sharing stopped. Pick a source to begin again.", "normal", { saveRecording });
  else stopRecording(saveRecording);
  stopSourceTracks();
  sourceKind = null;
  sessionId = null;
  inputVideo.hidden = true;
  inputEmpty.hidden = false;
  stopSharingButton.hidden = true;
  sourceStatus.textContent = "nothing selected";
  $$(".source-button").forEach((button) => {
    button.classList.remove("is-active");
    button.setAttribute("aria-pressed", "false");
  });
  setMessage("Sharing stopped. Pick a source to begin again.");
}

function supportedRecordingType() {
  const candidates = ["video/mp4;codecs=h264", "video/webm;codecs=vp9", "video/webm"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function startRecording() {
  if (!state.firstOutput || state.recording) return;
  const stream = outputCanvas.captureStream(state.mode === "cloud" ? 30 : 12);
  const mimeType = supportedRecordingType();
  const chunks = [];
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const recording = { recorder, chunks, save: true, timer: null };
  state.recording = recording;
  recordButton.setAttribute("aria-pressed", "true");

  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size) chunks.push(event.data);
  });
  recorder.addEventListener("stop", () => {
    if (recording.save && chunks.length) {
      const type = recorder.mimeType || mimeType || "video/webm";
      const extension = type.includes("mp4") ? "mp4" : "webm";
      const output = new Blob(chunks, { type });
      const url = URL.createObjectURL(output);
      const link = document.createElement("a");
      link.href = url;
      link.download = `clay-screen-${Date.now()}.${extension}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage("Recording saved. Keep the strongest short clip for the project page.");
    }
    recordButton.textContent = "Record 10s";
    recordButton.setAttribute("aria-pressed", "false");
  });

  recorder.start(250);
  let remaining = 10;
  recordButton.textContent = `Recording ${remaining}s`;
  recording.timer = setInterval(() => {
    remaining -= 1;
    recordButton.textContent = `Recording ${remaining}s`;
    if (remaining <= 0) stopRecording(true);
  }, 1000);
}

function stopRecording(save = true) {
  const recording = state.recording;
  if (!recording) return;
  state.recording = null;
  recording.save = recording.save && save;
  clearInterval(recording.timer);
  if (recording.recorder.state === "recording") recording.recorder.stop();
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

videoFile.addEventListener("change", async () => {
  try {
    await loadVideoFile(videoFile.files?.[0]);
  } catch (error) {
    setMessage(error.message || "The video could not be opened.", "error");
  }
});

$$(".style-swatch").forEach((button) => button.addEventListener("click", async () => {
  selectedStyle = button.dataset.style;
  $$(".style-swatch").forEach((item) => {
    const active = item === button;
    item.classList.toggle("is-active", active);
    item.setAttribute("aria-pressed", String(active));
  });
  if (state.running && state.mode === "local") {
    try {
      await configureLocalSession();
    } catch (error) {
      stopTransform(error.message || "Could not update the local prompt.", "error");
    }
  }
}));

runtimeSelect.addEventListener("change", () => {
  if (state.running) stopTransform("Engine changed. Start again when ready.");
  applyRuntime(runtimeSelect.value);
});

accessControl.addEventListener("submit", (event) => {
  event.preventDefault();
  startTransform();
});

strength.addEventListener("input", () => {
  strengthValue.textContent = `${strength.value}%`;
});
strength.addEventListener("change", async () => {
  if (state.running && state.mode === "local") {
    try {
      await configureLocalSession();
    } catch (error) {
      stopTransform(error.message || "Could not update the local effect.", "error");
    }
  }
});

startButton.addEventListener("click", startTransform);
recordButton.addEventListener("click", startRecording);
stopSharingButton.addEventListener("click", () => stopAll());
document.addEventListener("visibilitychange", () => {
  if (document.hidden && state.running && state.mode === "cloud") {
    stopTransform("Cloud generation stopped because the tab was hidden.");
  }
});
window.addEventListener("pagehide", () => stopAll({ saveRecording: false }));

boot();
