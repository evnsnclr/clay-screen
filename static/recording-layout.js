export const RECORDING_PRESETS = Object.freeze({
  live: Object.freeze({
    mode: "live",
    width: 1920,
    height: 1080,
    label: "Compare · live source + output",
  }),
  audit: Object.freeze({
    mode: "audit",
    width: 1920,
    height: 1080,
    label: "Lab · exact native pairs",
  }),
  output: Object.freeze({
    mode: "output",
    width: 1080,
    height: 1080,
    label: "Create · clean output",
  }),
  compare: Object.freeze({
    mode: "compare",
    width: 1920,
    height: 1080,
    label: "Lab · exact native pairs",
  }),
});

export function recordingPreset(mode) {
  return RECORDING_PRESETS[mode] || RECORDING_PRESETS.live;
}

export function containRect(sourceWidth, sourceHeight, x, y, width, height) {
  const safeWidth = Number(sourceWidth) > 0 ? Number(sourceWidth) : width;
  const safeHeight = Number(sourceHeight) > 0 ? Number(sourceHeight) : height;
  const scale = Math.min(width / safeWidth, height / safeHeight);
  const drawWidth = safeWidth * scale;
  const drawHeight = safeHeight * scale;
  return {
    x: x + (width - drawWidth) / 2,
    y: y + (height - drawHeight) / 2,
    width: drawWidth,
    height: drawHeight,
  };
}

export function recordingIsReady(mode, { firstOutput = false, matchedPairReady = false } = {}) {
  return mode === "audit" || mode === "compare" ? matchedPairReady : firstOutput;
}

export function shouldStartArmedRecording(armedMode, event) {
  return (
    ((armedMode === "audit" || armedMode === "compare") && event === "matched-pair")
    || ((armedMode === "live" || armedMode === "output") && event === "display-frame")
  );
}

export function shouldPublishPair(currentCapturedAt, candidateCapturedAt) {
  if (!Number.isFinite(currentCapturedAt) || !Number.isFinite(candidateCapturedAt)) return true;
  return candidateCapturedAt >= currentCapturedAt;
}
