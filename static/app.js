import {
  CLOUD_CAPTURE_INTERVAL_MS,
  CLOUD_PENDING_LIMIT,
  CLOUD_PENDING_TTL_MS,
  CLOUD_SESSION_LIMIT_MS,
  CLOUD_STARTUP_TIMEOUT_MS,
  FAL_CLIENT_URL,
  FAL_MODEL,
  FLUX_INPUT_SIZE,
  FLUX_JPEG_QUALITY,
  FLUX_OUTPUT_SIZE,
  availableRealRuntimes,
  buildFluxInput,
  buildRecordingOptions,
  chooseRuntime,
} from "./flux-config.js?v=0.3.4";
import { CloudFramePump } from "./cloud-frame-pump.js?v=0.3.4";
import { startDemoSource } from "./demo-source.js?v=0.3.4";
import { installFalSocketGuard } from "./fal-socket-guard.js?v=0.3.4";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const studio = $("#studio");
const inputVideo = $("#inputVideo");
const inputEmpty = $("#inputEmpty");
const demoCanvas = $("#demoCanvas");
const outputFrame = $("#outputFrame");
const outputCanvas = $("#outputCanvas");
const outputContext = outputCanvas.getContext("2d");
const outputEmpty = $("#outputEmpty");
const captureCanvas = $("#captureCanvas");
const captureContext = captureCanvas.getContext("2d");
const recordingCanvas = $("#recordingCanvas");
const recordingContext = recordingCanvas.getContext("2d");
const videoFile = $("#videoFile");
const sourceStatus = $("#sourceStatus");
const outputStatus = $("#outputStatus");
const sessionMessage = $("#sessionMessage");
const startButton = $("#startButton");
const recordButton = $("#recordButton");
const scrollButton = $("#scrollButton");
const showcaseButton = $("#showcaseButton");
const exitShowcaseButton = $("#exitShowcaseButton");
const stopSharingButton = $("#stopSharingButton");
const liveIndicator = $("#liveIndicator");
const performanceBadge = $("#performanceBadge");
const runtimeBadge = $("#runtimeBadge");
const runtimeControl = $("#runtimeControl");
const runtimeSelect = $("#runtimeSelect");
const accessControl = $("#accessControl");
const accessCode = $("#accessCode");
const strength = $("#strength");
const strengthValue = $("#strengthValue");

const STYLE_PROMPTS = {
  clay: "Restyle this exact frame as one coherent handmade stop-motion polymer-clay browser diorama, photographed head-on with a fixed camera. Preserve the composition, browser chrome, roads, cards, controls, large text placement, and scroll position. Use fingerprints, imperfect rounded edges, colorful raised clay markers, matte pastel surfaces, soft contact shadows, and miniature studio lighting. Do not add another browser, screen, device, window, border, or frame.",
  felt: "Restyle this exact frame as one coherent layered hand-cut felt interface. Preserve the composition, controls, map structure, cards, large text placement, and scroll position. Use visible wool fibers, embroidered edges, stacked textile shapes, warm craft-table lighting, and soft dimensional shadows. Do not add another window or device.",
  ink: "Restyle this exact frame as an expressive India-ink interface on warm paper. Preserve the composition, controls, map structure, cards, large text placement, and scroll position. Use bold brush edges, restrained watercolor bleed, crisp editorial shapes, and subtle paper texture. Do not add another window or device.",
  dream: "Restyle this exact frame as one coherent surreal miniature interface. Preserve the composition, controls, map structure, cards, large text placement, and scroll position. Use pearlescent glass, soft luminous gradients, playful sculptural forms, and cinematic glow. Do not add another window or device.",
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
  cloudAccessCode: "",
  cloudPump: null,
  latestOutputBatch: null,
  outputBusy: false,
  outputTimer: null,
  activeOutput: null,
  previewAnimation: null,
  sessionTimer: null,
  startupTimer: null,
  recording: null,
  recordingArmed: false,
  captureController: null,
  forwardingWheel: false,
  demoStop: null,
  stats: null,
};

let sourceStream = null;
let sourceKind = null;
let sourceObjectUrl = null;
let selectedStyle = "clay";
let sessionId = null;
let falSocketGuard = null;

async function boot() {
  state.health = await loadHealth();
  populateRuntimeSelector();
  applyRuntime(state.health.default_runtime || chooseRuntime(state.health));
}

async function loadHealth() {
  try {
    const response = await fetch("api/health", { cache: "no-store" });
    if (response.ok) return await response.json();
  } catch {
    // The hard-coded fallback below is intentionally non-AI.
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
    if (announce) setMessage("FLUX.2 is ready. Choose Demo or a browser tab, then enter your local access code.");
    return;
  }

  captureCanvas.width = 512;
  captureCanvas.height = 288;
  outputCanvas.width = 832;
  outputCanvas.height = 480;
  performanceBadge.hidden = true;

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
  if (announce) setMessage("No AI runtime is configured. Add your own fal key locally for live FLUX.2.");
}

function setMessage(message, tone = "normal") {
  sessionMessage.textContent = message;
  sessionMessage.dataset.tone = tone;
}

function getSourceMedia() {
  return sourceKind === "demo" ? demoCanvas : inputVideo;
}

function sourceIsReady() {
  if (sourceKind === "demo") return Boolean(demoCanvas.width && demoCanvas.height);
  return Boolean(inputVideo.videoWidth && inputVideo.readyState >= 2);
}

function setSourceSelected(kind) {
  sourceKind = kind;
  studio.dataset.source = kind;
  $$(".source-button").forEach((button) => {
    const active = button.dataset.source === kind;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  const labels = {
    demo: "animated demo ready",
    screen: "screen selected",
    camera: "camera selected",
    video: "video loaded",
  };
  sourceStatus.textContent = labels[kind] || `${kind} selected`;
  inputEmpty.hidden = true;
  inputVideo.hidden = kind === "demo";
  demoCanvas.hidden = kind !== "demo";
  stopSharingButton.hidden = ["demo", "video"].includes(kind);
  setMessage(state.mode === "cloud"
    ? "Source ready. Start FLUX.2; capture will keep sampling while the source moves."
    : "Source ready. Choose a material and start transforming.");
}

function stopWheelForwarding() {
  if (state.forwardingWheel && state.captureController?.forwardWheel) {
    void state.captureController.forwardWheel(null).catch(() => {});
  }
  state.forwardingWheel = false;
  studio.classList.remove("is-scroll-forwarding");
  scrollButton.setAttribute("aria-pressed", "false");
  scrollButton.textContent = "Scroll captured tab";
  scrollButton.hidden = true;
}

function stopSourceTracks() {
  stopWheelForwarding();
  state.captureController = null;
  state.demoStop?.();
  state.demoStop = null;
  if (sourceStream) sourceStream.getTracks().forEach((track) => track.stop());
  sourceStream = null;
  inputVideo.pause();
  inputVideo.srcObject = null;
  if (sourceObjectUrl) URL.revokeObjectURL(sourceObjectUrl);
  sourceObjectUrl = null;
  inputVideo.removeAttribute("src");
  inputVideo.load();
  demoCanvas.hidden = true;
}

function chooseDemo() {
  if (state.running) stopTransform();
  stopSourceTracks();
  state.demoStop = startDemoSource(demoCanvas);
  setSourceSelected("demo");
  setMessage("Animated map and gallery ready. This source is designed to make motion easy to judge.");
}

async function chooseScreen() {
  if (!navigator.mediaDevices?.getDisplayMedia) throw new Error("Screen sharing is unavailable in this browser.");
  if (state.running) stopTransform();
  stopSourceTracks();

  const targetRate = state.mode === "cloud" ? 30 : 16;
  const controller = typeof window.CaptureController === "function"
    ? new window.CaptureController()
    : null;
  const options = {
    video: { frameRate: { ideal: targetRate, max: targetRate } },
    audio: false,
    selfBrowserSurface: "exclude",
    preferCurrentTab: false,
    surfaceSwitching: "include",
    monitorTypeSurfaces: "exclude",
  };
  if (controller) options.controller = controller;

  sourceStream = await navigator.mediaDevices.getDisplayMedia(options);
  inputVideo.srcObject = sourceStream;
  await inputVideo.play();
  const track = sourceStream.getVideoTracks()[0];
  try {
    track.contentHint = "motion";
  } catch {
    // contentHint is an optimization hint and is not supported everywhere.
  }
  track.addEventListener("ended", () => {
    if (sourceStream?.getVideoTracks().includes(track)) stopAll();
  });
  state.captureController = controller;
  setSourceSelected("screen");

  const displaySurface = track.getSettings?.().displaySurface || "unknown";
  const canForwardWheel = displaySurface === "browser" && Boolean(controller?.forwardWheel);
  scrollButton.hidden = !canForwardWheel;
  if (canForwardWheel) {
    setMessage("Browser tab selected. Click “Scroll captured tab,” then scroll directly over the generated output.");
  } else if (displaySurface !== "browser") {
    setMessage("For a clean responsive demo, share one browser tab—not the whole monitor—and keep both windows visible.", "error");
  }
}

async function chooseCamera() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera access is unavailable in this browser.");
  if (state.running) stopTransform();
  stopSourceTracks();
  sourceStream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: state.mode === "cloud" ? 30 : 16 },
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

function mediaDimensions(media, fallbackWidth, fallbackHeight) {
  return {
    width: media.videoWidth || media.naturalWidth || media.width || fallbackWidth,
    height: media.videoHeight || media.naturalHeight || media.height || fallbackHeight,
  };
}

function drawCover(context, media, width, height) {
  const mediaSize = mediaDimensions(media, width, height);
  const scale = Math.max(width / mediaSize.width, height / mediaSize.height);
  const drawWidth = mediaSize.width * scale;
  const drawHeight = mediaSize.height * scale;
  context.drawImage(media, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}

function drawFramedScreen(context, media, width, height) {
  const mediaSize = mediaDimensions(media, width, height);
  const margin = width * 0.055;
  const scale = Math.min((width - margin * 2) / mediaSize.width, (height - margin * 2) / mediaSize.height);
  const drawWidth = mediaSize.width * scale;
  const drawHeight = mediaSize.height * scale;
  const x = (width - drawWidth) / 2;
  const y = (height - drawHeight) / 2;
  const radius = Math.max(14, width * 0.026);

  context.fillStyle = "#d6c2b2";
  context.fillRect(0, 0, width, height);
  context.save();
  context.shadowColor = "rgba(58,35,21,.25)";
  context.shadowBlur = width * 0.035;
  context.shadowOffsetY = width * 0.018;
  context.fillStyle = "#f7eee3";
  context.beginPath();
  context.roundRect(x, y, drawWidth, drawHeight, radius);
  context.fill();
  context.restore();
  context.save();
  context.beginPath();
  context.roundRect(x, y, drawWidth, drawHeight, radius);
  context.clip();
  context.drawImage(media, x, y, drawWidth, drawHeight);
  context.restore();
}

function drawSourceToCapture() {
  const media = getSourceMedia();
  captureContext.clearRect(0, 0, captureCanvas.width, captureCanvas.height);
  if (sourceKind === "screen" && state.mode === "cloud") {
    drawFramedScreen(captureContext, media, captureCanvas.width, captureCanvas.height);
  } else {
    drawCover(captureContext, media, captureCanvas.width, captureCanvas.height);
  }
}

function renderPreview() {
  if (!state.running || state.mode !== "preview") return;
  outputContext.save();
  outputContext.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
  outputContext.filter = PREVIEW_FILTERS[selectedStyle];
  drawCover(outputContext, getSourceMedia(), outputCanvas.width, outputCanvas.height);
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
    if (!payload.token || typeof payload.token !== "string") throw new Error("The token endpoint returned an invalid response");
    if (generation === state.generation) accessCode.value = "";
    return payload.token;
  } catch (error) {
    if (generation === state.generation) handleCloudError(error, generation);
    throw error;
  }
}

function freshStats(startedAt = performance.now()) {
  return {
    startedAt,
    nativeResults: 0,
    displayedFrames: 0,
    lastNativeAt: 0,
    nativeIntervalEwma: 320,
    latencies: [],
    displayedAges: [],
  };
}

async function startCloudSession(generation) {
  state.cloudAccessCode = accessCode.value.trim();
  if (!state.cloudAccessCode) throw new Error("Enter your local access code before starting FLUX.2.");

  const startedAt = performance.now();
  const deadlineAt = startedAt + CLOUD_SESSION_LIMIT_MS;
  state.stats = freshStats(startedAt);
  performanceBadge.hidden = false;
  performanceBadge.textContent = "warming FLUX.2";
  outputStatus.textContent = "connecting to FLUX.2";
  setMessage("Authorizing one bounded FLUX.2 session. Frames are processed by fal.ai.");
  falSocketGuard ||= installFalSocketGuard(window);
  const { fal } = await import(FAL_CLIENT_URL);
  if (!isCurrentRun(generation)) return;

  const provideToken = (app) => {
    const oneTimeCode = state.cloudAccessCode;
    state.cloudAccessCode = "";
    return requestFalToken(app, oneTimeCode, generation);
  };

  state.cloudConnection = fal.realtime.connect(FAL_MODEL, {
    connectionKey: `clay-screen-${generation}-${crypto.randomUUID()}`,
    tokenProvider: provideToken,
    throttleInterval: 0,
    maxBuffering: 1,
    onResult: (result) => handleCloudResult(result, generation),
    onError: (error) => handleCloudError(error, generation),
  });

  state.cloudPump = new CloudFramePump({
    intervalMs: CLOUD_CAPTURE_INTERVAL_MS,
    pendingLimit: CLOUD_PENDING_LIMIT,
    pendingTtlMs: CLOUD_PENDING_TTL_MS,
    capture: async () => {
      if (!isCurrentRun(generation) || !sourceIsReady()) return null;
      drawSourceToCapture();
      return { sourceDataUrl: captureCanvas.toDataURL("image/jpeg", FLUX_JPEG_QUALITY) };
    },
    send: ({ requestId, sourceDataUrl }) => {
      state.cloudConnection.send(buildFluxInput({
        imageUrl: sourceDataUrl,
        prompt: STYLE_PROMPTS[selectedStyle],
        requestId,
      }));
    },
    onDeadline: () => {
      if (isCurrentRun(generation)) stopTransform("The 15-second cloud session ended to keep usage bounded.");
    },
    onError: (error) => handleCloudError(error, generation),
  });

  state.startupTimer = setTimeout(() => {
    if (isCurrentRun(generation) && !state.firstOutput) {
      handleCloudError(new Error("FLUX.2 did not return a frame in time."), generation);
    }
  }, CLOUD_STARTUP_TIMEOUT_MS);
  state.sessionTimer = setTimeout(() => {
    if (isCurrentRun(generation)) stopTransform("The 15-second cloud session ended to keep usage bounded.");
  }, CLOUD_SESSION_LIMIT_MS);
  state.cloudPump.start({ generation, deadlineAt });
}

function handleCloudResult(result, generation) {
  if (!isCurrentRun(generation)) return;
  if (!Array.isArray(result?.images) || !result.images.length) {
    handleCloudError(new Error("FLUX.2 returned an empty frame."), generation);
    return;
  }

  const pending = state.cloudPump?.resolve(result);
  if (!pending) return;
  const stats = state.stats;
  if (stats.lastNativeAt) {
    const interval = pending.receivedAt - stats.lastNativeAt;
    stats.nativeIntervalEwma = stats.nativeIntervalEwma * 0.72 + interval * 0.28;
  }
  stats.lastNativeAt = pending.receivedAt;
  stats.nativeResults += 1;
  stats.latencies.push(pending.latencyMs);
  if (stats.latencies.length > 120) stats.latencies.shift();

  state.latestOutputBatch = {
    ...pending,
    images: result.images.slice(-2),
    generation,
  };
  updatePerformanceBadge();
  drainOutputBatch();
}

function handleCloudError(error, generation) {
  if (!isCurrentRun(generation)) return;
  const rawMessage = error?.message || "The FLUX.2 connection failed.";
  const message = rawMessage === "Unknown error"
    ? "FLUX.2 connection failed. Check the access code and try again."
    : rawMessage;
  stopTransform(message, "error");
}

function closeActiveOutput() {
  if (!state.activeOutput) return;
  for (const bitmap of state.activeOutput.bitmaps || []) bitmap.close?.();
  state.activeOutput.source?.close?.();
  state.activeOutput = null;
}

function finishOutputBatch(generation) {
  closeActiveOutput();
  state.outputBusy = false;
  if (isCurrentRun(generation)) drainOutputBatch();
}

function drainOutputBatch() {
  if (state.outputBusy || !state.latestOutputBatch) return;
  const batch = state.latestOutputBatch;
  state.latestOutputBatch = null;
  state.outputBusy = true;
  void prepareOutputBatch(batch);
}

async function prepareOutputBatch(batch) {
  try {
    const bitmaps = await Promise.all(batch.images.map((image) => rawImageBitmap(image)));
    let source = null;
    if (Number(strength.value) < 100) source = await dataUrlBitmap(batch.sourceDataUrl);
    if (!isCurrentRun(batch.generation)) {
      bitmaps.forEach((bitmap) => bitmap.close());
      source?.close();
      state.outputBusy = false;
      return;
    }

    state.activeOutput = { bitmaps, source };
    paintCloudBitmap(bitmaps[0], source, batch);
    if (bitmaps.length === 1) {
      finishOutputBatch(batch.generation);
      return;
    }

    const delay = Math.max(45, Math.min(190, state.stats.nativeIntervalEwma / 2));
    state.outputTimer = setTimeout(() => {
      state.outputTimer = null;
      if (isCurrentRun(batch.generation)) paintCloudBitmap(bitmaps.at(-1), source, batch);
      finishOutputBatch(batch.generation);
    }, delay);
  } catch (error) {
    finishOutputBatch(batch.generation);
    handleCloudError(error, batch.generation);
  }
}

function paintCloudBitmap(generated, source, batch) {
  const effect = Number(strength.value) / 100;
  outputContext.save();
  outputContext.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
  if (source) {
    outputContext.drawImage(source, 0, 0, outputCanvas.width, outputCanvas.height);
    outputContext.globalAlpha = effect;
  }
  outputContext.drawImage(generated, 0, 0, outputCanvas.width, outputCanvas.height);
  outputContext.restore();

  const displayAge = performance.now() - batch.capturedAt;
  state.stats.displayedFrames += 1;
  state.stats.displayedAges.push(displayAge);
  if (state.stats.displayedAges.length > 120) state.stats.displayedAges.shift();
  markGeneratedFrame(`FLUX.2 · ${Math.round(batch.latencyMs)}ms`);
  updatePerformanceBadge();
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

function percentile(values, fraction) {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.min(ordered.length - 1, Math.floor((ordered.length - 1) * fraction))];
}

function updatePerformanceBadge() {
  if (!state.stats || state.mode !== "cloud") return;
  const elapsed = Math.max(0.1, (performance.now() - state.stats.startedAt) / 1000);
  const sampleFps = (state.cloudPump?.capturedCount || 0) / elapsed;
  const nativeFps = state.stats.nativeResults / elapsed;
  const viewFps = state.stats.displayedFrames / elapsed;
  const p95 = percentile(state.stats.displayedAges, 0.95) || percentile(state.stats.latencies, 0.95);
  performanceBadge.textContent = `${sampleFps.toFixed(1)} sample · ${nativeFps.toFixed(1)} native · ${viewFps.toFixed(1)} view · ${Math.round(p95)}ms`;
  performanceBadge.title = "sampled fps · native FLUX.2 fps · displayed fps · p95 displayed-frame age";
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
  if (!isCurrentRun(generation) || state.inFlight || !sourceIsReady()) return;
  state.inFlight = true;
  drawSourceToCapture();
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
    markGeneratedFrame(Number.isFinite(inferenceMs) ? `Mac · ${Math.round(inferenceMs)}ms` : "Mac · MPS");
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
  outputStatus.textContent = state.health.runtimes?.local?.model_loaded ? "starting MPS" : "loading SD-Turbo";
  setMessage("Starting local AI. The first run may need to download model weights.");
  requestAnimationFrame(() => sendMacFrame(generation));
}

function markGeneratedFrame(label) {
  state.generatedFrames += 1;
  outputStatus.textContent = `${label} · ${state.generatedFrames} shown`;
  if (!state.firstOutput) {
    const beginArmedRecording = state.recordingArmed;
    state.firstOutput = true;
    clearTimeout(state.startupTimer);
    state.startupTimer = null;
    recordButton.disabled = false;
    showcaseButton.disabled = false;
    setMessage(state.mode === "cloud"
      ? "FLUX.2 is live. Capture continues while you scroll; stale frames are discarded automatically."
      : "The transformation is live. Only the newest source frame is processed.");
    if (beginArmedRecording) {
      state.recordingArmed = false;
      startRecording();
    }
  }
}

async function waitForSource() {
  if (sourceIsReady()) return;
  await new Promise((resolve) => inputVideo.addEventListener("loadeddata", resolve, { once: true }));
}

async function startTransform() {
  if (state.running) {
    stopTransform();
    return;
  }

  try {
    if (!sourceKind) chooseDemo();
    await waitForSource();
    if (state.mode === "cloud" && !accessCode.value.trim()) {
      accessCode.focus();
      throw new Error("Enter your local access code before starting FLUX.2.");
    }

    const generation = ++state.generation;
    state.running = true;
    state.generatedFrames = 0;
    state.firstOutput = false;
    state.inFlight = false;
    state.latestOutputBatch = null;
    state.outputBusy = false;
    studio.setAttribute("aria-busy", "true");
    startButton.querySelector("span").textContent = "Stop transforming";
    startButton.classList.add("is-running");
    outputEmpty.hidden = true;
    liveIndicator.hidden = false;
    recordButton.disabled = false;
    recordButton.textContent = "Record";
    recordButton.setAttribute("aria-pressed", "false");
    showcaseButton.disabled = true;
    outputStatus.textContent = "starting";

    if (state.mode === "cloud") await startCloudSession(generation);
    else if (state.mode === "local") await startLocalSession(generation);
    else {
      outputStatus.textContent = "interface preview · not AI";
      setMessage("Interface preview is running without AI. Clone the repo and add your own fal key for generated frames.");
      state.firstOutput = true;
      recordButton.disabled = false;
      showcaseButton.disabled = false;
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
  state.cloudAccessCode = "";
  state.recordingArmed = false;
  state.cloudPump?.stop();
  state.cloudPump = null;
  state.latestOutputBatch = null;
  state.outputBusy = false;
  state.abortController?.abort();
  state.abortController = null;
  state.cloudConnection?.close();
  state.cloudConnection = null;
  falSocketGuard?.closeAll();
  if (state.previewAnimation) cancelAnimationFrame(state.previewAnimation);
  state.previewAnimation = null;
  clearTimeout(state.outputTimer);
  clearTimeout(state.sessionTimer);
  clearTimeout(state.startupTimer);
  state.outputTimer = null;
  state.sessionTimer = null;
  state.startupTimer = null;
  closeActiveOutput();
  stopRecording(saveRecording);
  studio.setAttribute("aria-busy", "false");
  liveIndicator.hidden = true;
  recordButton.disabled = true;
  recordButton.textContent = "Record";
  recordButton.setAttribute("aria-pressed", "false");
  showcaseButton.disabled = !state.firstOutput;
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
  delete studio.dataset.source;
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

async function toggleWheelForwarding() {
  const controller = state.captureController;
  if (!controller?.forwardWheel) return;
  try {
    const enable = !state.forwardingWheel;
    await controller.forwardWheel(enable ? outputFrame : null);
    state.forwardingWheel = enable;
    studio.classList.toggle("is-scroll-forwarding", enable);
    scrollButton.setAttribute("aria-pressed", String(enable));
    scrollButton.textContent = enable ? "Stop scroll control" : "Scroll captured tab";
    setMessage(enable
      ? "Scroll over the generated output now; Chrome forwards the movement to the captured browser tab."
      : "Scroll forwarding stopped. The browser tab is still being captured.");
  } catch (error) {
    setMessage(error.message || "Chrome could not enable captured-tab scrolling.", "error");
  }
}

function setShowcase(enabled) {
  studio.classList.toggle("is-showcase", enabled);
  document.body.classList.toggle("has-showcase", enabled);
  showcaseButton.setAttribute("aria-pressed", String(enabled));
  showcaseButton.textContent = enabled ? "Exit showcase" : "Showcase";
  exitShowcaseButton.hidden = !enabled;
}

function supportedRecordingType() {
  const candidates = ["video/mp4;codecs=h264", "video/webm;codecs=vp9", "video/webm"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function drawRecordingFrame(recording) {
  const width = recordingCanvas.width;
  const height = recordingCanvas.height;
  const inset = 48;
  const size = width - inset * 2;
  const gradient = recordingContext.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#e0cec0");
  gradient.addColorStop(1, "#cbb5a6");
  recordingContext.fillStyle = gradient;
  recordingContext.fillRect(0, 0, width, height);

  recordingContext.save();
  recordingContext.shadowColor = "rgba(54,34,21,.28)";
  recordingContext.shadowBlur = 42;
  recordingContext.shadowOffsetY = 24;
  recordingContext.fillStyle = "#f4e9dc";
  recordingContext.beginPath();
  recordingContext.roundRect(inset, inset, size, size, 42);
  recordingContext.fill();
  recordingContext.restore();
  recordingContext.save();
  recordingContext.beginPath();
  recordingContext.roundRect(inset, inset, size, size, 42);
  recordingContext.clip();
  recordingContext.fillStyle = "#d6c2b2";
  recordingContext.fillRect(inset, inset, size, size);
  const outputAspect = outputCanvas.width / outputCanvas.height;
  const drawWidth = outputAspect >= 1 ? size : size * outputAspect;
  const drawHeight = outputAspect >= 1 ? size / outputAspect : size;
  const drawX = inset + (size - drawWidth) / 2;
  const drawY = inset + (size - drawHeight) / 2;
  recordingContext.drawImage(outputCanvas, drawX, drawY, drawWidth, drawHeight);
  recordingContext.restore();

  recordingContext.fillStyle = "rgba(20,20,18,.72)";
  recordingContext.beginPath();
  recordingContext.roundRect(74, 74, 246, 42, 21);
  recordingContext.fill();
  recordingContext.fillStyle = "#fffaf3";
  recordingContext.font = "600 16px 'DM Mono', monospace";
  recordingContext.textAlign = "left";
  recordingContext.textBaseline = "middle";
  recordingContext.fillText("●  CLAY SCREEN / LIVE", 94, 95);

  const elapsed = Math.floor((performance.now() - recording.startedAt) / 1000);
  recordButton.textContent = `Stop · ${elapsed}s`;
}

function startRecording() {
  if (state.recording) {
    stopRecording(true);
    return;
  }
  if (state.recordingArmed) {
    state.recordingArmed = false;
    recordButton.textContent = "Record";
    recordButton.setAttribute("aria-pressed", "false");
    setMessage("Recording is no longer armed.");
    return;
  }
  if (!state.firstOutput) {
    if (!state.running) return;
    state.recordingArmed = true;
    recordButton.textContent = "Recording armed";
    recordButton.setAttribute("aria-pressed", "true");
    setMessage("Recording armed. The clean 1080×1080 take will begin on the first generated frame.");
    return;
  }
  if (typeof MediaRecorder === "undefined" || !recordingCanvas.captureStream) {
    setMessage("This browser cannot record the generated canvas.", "error");
    return;
  }

  const mimeType = supportedRecordingType();
  const chunks = [];
  const recording = {
    recorder: null,
    chunks,
    save: true,
    renderTimer: null,
    startedAt: performance.now(),
  };
  drawRecordingFrame(recording);
  const stream = recordingCanvas.captureStream(30);
  const recorder = new MediaRecorder(stream, buildRecordingOptions({
    mimeType,
    cloud: state.mode === "cloud",
  }));
  recording.recorder = recorder;
  state.recording = recording;
  recordButton.setAttribute("aria-pressed", "true");
  recordButton.textContent = "Stop · 0s";

  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size) chunks.push(event.data);
  });
  recorder.addEventListener("stop", () => {
    stream.getTracks().forEach((track) => track.stop());
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
      setMessage("1080×1080 recording saved. The bounded session is stopped and the take uses a steady 30 fps presentation cadence.");
    }
    recordButton.textContent = "Record";
    recordButton.setAttribute("aria-pressed", "false");
  });

  recorder.start(250);
  recording.renderTimer = setInterval(() => drawRecordingFrame(recording), 1000 / 30);
  setMessage("Recording the clean generated stage. Click Record again to stop, or let the bounded session finish.");
}

function stopRecording(save = true) {
  const recording = state.recording;
  if (!recording) return;
  state.recording = null;
  recording.save = recording.save && save;
  clearInterval(recording.renderTimer);
  if (recording.recorder.state === "recording") recording.recorder.stop();
}

$$(".source-button").forEach((button) => button.addEventListener("click", async () => {
  try {
    if (button.dataset.source === "demo") chooseDemo();
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
scrollButton.addEventListener("click", toggleWheelForwarding);
showcaseButton.addEventListener("click", () => setShowcase(!studio.classList.contains("is-showcase")));
exitShowcaseButton.addEventListener("click", () => setShowcase(false));
stopSharingButton.addEventListener("click", () => stopAll());
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && studio.classList.contains("is-showcase")) setShowcase(false);
});
window.addEventListener("pagehide", () => stopAll({ saveRecording: false }));

boot();
