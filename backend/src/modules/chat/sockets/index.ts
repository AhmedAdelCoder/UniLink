import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import type { ChatServer } from "./chat.events.js";
import { socketAuth } from "./socket.auth.js";
import { registerChatHandlers } from "./chat.socket.js";
import { startSocketSessionSweeper } from "./session.sweeper.js";
import { PresenceService } from "./presence.service.js";
import { registerPresenceHandlers } from "./presence.socket.js";
import { PresenceStore } from "./presence.store.js";
import { setChatServer } from "./chat.emitter.js";

export interface SocketOptions {
  presenceGraceMs?: number; // tests shorten it; production keeps the 5s default
}

export function initSocket(httpServer: HttpServer, options: SocketOptions = {}): ChatServer {
  const io: ChatServer = new Server(httpServer, {
    cors: {
      origin: "*", // TODO: Restrict origins when web client is configured
      methods: ["GET", "POST"],
    },
  });

  // Lets the REST controllers announce events through the same server.
  setChatServer(io);

  // Every connection is authenticated (and the account checked) before any handler runs.
  io.use(socketAuth);

  // One presence service per server: it owns the per-user device counters.
  // An undefined grace period falls back to the store's 5s default.
  const presence = new PresenceService(io, new PresenceStore(options.presenceGraceMs));

  io.on("connection", (socket) => {
    const userId = socket.data.user.userId;
    console.log(`Socket connected: ${userId}`);

    registerChatHandlers(socket);
    registerPresenceHandlers(socket);
    presence.handleConnect(userId);

    socket.on("disconnect", (reason) => {
      console.log(`Socket disconnected: ${userId}`, reason);
      presence.handleDisconnect(userId);
    });
  });

  // Periodically validate active socket sessions.
  const stopSweeper = startSocketSessionSweeper(io);

  // When the HTTP server closes: stop the sweeper and unregister the server,
  // so REST announcements become a no-op instead of using a closed server.
  httpServer.on("close", () => {
    stopSweeper();
    setChatServer(null);
  });

  return io;
}