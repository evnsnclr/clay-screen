const defaultNow = () => performance.now();

export class CloudFramePump {
  constructor({
    capture,
    send,
    onDeadline = () => {},
    onError = () => {},
    intervalMs = 100,
    maxInFlight = 1,
    pendingLimit = 16,
    pendingTtlMs = 5_000,
    now = defaultNow,
    schedule = (callback, delay) => setInterval(callback, delay),
    cancel = (timer) => clearInterval(timer),
    createRequestId = () => crypto.randomUUID(),
  }) {
    this.capture = capture;
    this.send = send;
    this.onDeadline = onDeadline;
    this.onError = onError;
    this.intervalMs = intervalMs;
    this.maxInFlight = Math.max(1, Math.min(maxInFlight, pendingLimit));
    this.pendingLimit = pendingLimit;
    this.pendingTtlMs = pendingTtlMs;
    this.now = now;
    this.schedule = schedule;
    this.cancel = cancel;
    this.createRequestId = createRequestId;
    this.pending = new Map();
    this.latestFrame = null;
    this.timer = null;
    this.running = false;
    this.capturing = false;
    this.runToken = 0;
    this.generation = 0;
    this.deadlineAt = Infinity;
    this.sentCount = 0;
    this.capturedCount = 0;
    this.skippedCount = 0;
  }

  start({ generation, deadlineAt }) {
    this.stop();
    this.running = true;
    this.generation = generation;
    this.deadlineAt = deadlineAt;
    this.sentCount = 0;
    this.capturedCount = 0;
    this.skippedCount = 0;
    this.runToken += 1;
    const token = this.runToken;
    void this.sample(token);
    this.timer = this.schedule(() => void this.sample(token), this.intervalMs);
  }

  async sample(token = this.runToken) {
    if (!this.running || token !== this.runToken) return;
    if (this.now() >= this.deadlineAt) {
      this.stop();
      this.onDeadline();
      return;
    }
    if (this.capturing) {
      this.skippedCount += 1;
      return;
    }

    this.capturing = true;
    try {
      const frame = await this.capture();
      if (!this.running || token !== this.runToken || !frame) return;
      const capturedAt = this.now();
      if (capturedAt >= this.deadlineAt) {
        this.stop();
        this.onDeadline();
        return;
      }

      const latestFrame = {
        ...frame,
        generation: this.generation,
        capturedAt,
      };
      this.capturedCount += 1;
      if (this.latestFrame) this.skippedCount += 1;
      this.latestFrame = latestFrame;
      this.dispatchLatest();
    } catch (error) {
      if (this.running && token === this.runToken) this.onError(error);
    } finally {
      if (token === this.runToken) this.capturing = false;
    }
  }

  resolve(result) {
    if (!this.running) return null;
    const requestId = result?.request_id;
    const pending = requestId
      ? this.pending.get(requestId) || null
      : this.pending.values().next().value || null;
    if (!pending) return null;
    this.pending.delete(pending.requestId);
    const receivedAt = this.now();
    this.prunePending(receivedAt);
    const resolved = {
      ...pending,
      receivedAt,
      latencyMs: Math.max(0, receivedAt - pending.sentAt),
    };
    this.dispatchLatest();
    return resolved;
  }

  dispatchLatest() {
    if (!this.running || !this.latestFrame) return;
    const sentAt = this.now();
    this.prunePending(sentAt);
    if (this.pending.size >= this.maxInFlight) return;
    const requestId = this.createRequestId();
    const pending = {
      ...this.latestFrame,
      requestId,
      sentAt,
    };
    this.latestFrame = null;
    this.pending.set(requestId, pending);
    this.prunePending(sentAt);
    try {
      this.send(pending);
      this.sentCount += 1;
    } catch (error) {
      this.pending.delete(requestId);
      this.onError(error);
    }
  }

  prunePending(now = this.now()) {
    for (const [requestId, pending] of this.pending) {
      if (now - pending.sentAt > this.pendingTtlMs) this.pending.delete(requestId);
    }
    while (this.pending.size > this.pendingLimit) {
      this.pending.delete(this.pending.keys().next().value);
      this.skippedCount += 1;
    }
  }

  stop() {
    this.running = false;
    this.runToken += 1;
    this.capturing = false;
    if (this.timer !== null) this.cancel(this.timer);
    this.timer = null;
    this.pending.clear();
    this.latestFrame = null;
  }

  get pendingCount() {
    return this.pending.size;
  }
}
