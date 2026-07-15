const FAL_REALTIME_HOST = "fal.run";

export function isFalRealtimeSocket(urlLike) {
  try {
    const url = new URL(String(urlLike));
    return url.protocol === "wss:" && url.hostname === FAL_REALTIME_HOST;
  } catch {
    return false;
  }
}

export function installFalSocketGuard(host = globalThis) {
  const NativeWebSocket = host.WebSocket;
  if (typeof NativeWebSocket !== "function") {
    return { closeAll() {}, restore() {} };
  }

  const sockets = new Set();
  const closeSocket = (socket) => {
    try {
      socket.close(1000, "Clay Screen stopped");
    } catch {
      // A CONNECTING socket is closed again from its guarded onopen handler.
    }
  };

  const GuardedWebSocket = new Proxy(NativeWebSocket, {
    construct(Target, args) {
      const socket = Reflect.construct(Target, args, Target);
      if (isFalRealtimeSocket(args[0])) {
        sockets.add(socket);
        socket.addEventListener?.("close", () => sockets.delete(socket), { once: true });
      }
      return socket;
    },
  });

  host.WebSocket = GuardedWebSocket;

  return {
    closeAll() {
      for (const socket of sockets) {
        if (socket.readyState === NativeWebSocket.CONNECTING) {
          // @fal-ai/client 1.10.1 otherwise sends its queued frame if this
          // handshake opens after connection.close(). Replace that handler so
          // Stop and the session cap cannot leave an orphaned billable socket.
          socket.onopen = () => closeSocket(socket);
          closeSocket(socket);
        } else if (socket.readyState === NativeWebSocket.OPEN) {
          closeSocket(socket);
        }
      }
    },
    restore() {
      this.closeAll();
      if (host.WebSocket === GuardedWebSocket) host.WebSocket = NativeWebSocket;
    },
  };
}
