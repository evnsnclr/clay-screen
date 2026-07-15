import assert from "node:assert/strict";
import test from "node:test";

import {
  installFalSocketGuard,
  isFalRealtimeSocket,
} from "../static/fal-socket-guard.js";

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor(url) {
    this.url = url;
    this.readyState = FakeWebSocket.CONNECTING;
    this.closeCalls = 0;
    this.listeners = new Map();
    this.onopen = null;
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  close() {
    this.closeCalls += 1;
    // Deliberately stay CONNECTING to reproduce the pinned SDK edge case.
    if (this.readyState === FakeWebSocket.OPEN) {
      this.readyState = FakeWebSocket.CLOSED;
      this.listeners.get("close")?.();
    }
  }
}

test("only the fal realtime WebSocket origin is tracked", () => {
  assert.equal(isFalRealtimeSocket("wss://fal.run/model/realtime"), true);
  assert.equal(isFalRealtimeSocket("wss://example.com/model/realtime"), false);
  assert.equal(isFalRealtimeSocket("https://fal.run/model/realtime"), false);
  assert.equal(isFalRealtimeSocket("not a url"), false);
});

test("Stop prevents a queued frame after a CONNECTING fal socket later opens", () => {
  const host = { WebSocket: FakeWebSocket };
  const guard = installFalSocketGuard(host);
  const socket = new host.WebSocket("wss://fal.run/model/realtime");
  let sdkOpenCalls = 0;
  socket.onopen = () => {
    sdkOpenCalls += 1;
  };

  guard.closeAll();
  assert.equal(socket.closeCalls, 1);

  socket.readyState = FakeWebSocket.OPEN;
  socket.onopen();

  assert.equal(sdkOpenCalls, 0);
  assert.equal(socket.closeCalls, 2);
  assert.equal(socket.readyState, FakeWebSocket.CLOSED);
  guard.restore();
  assert.equal(host.WebSocket, FakeWebSocket);
});

test("non-fal sockets are untouched", () => {
  const host = { WebSocket: FakeWebSocket };
  const guard = installFalSocketGuard(host);
  const socket = new host.WebSocket("wss://example.com/socket");

  guard.closeAll();

  assert.equal(socket.closeCalls, 0);
  guard.restore();
});
