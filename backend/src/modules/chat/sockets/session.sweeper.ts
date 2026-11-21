import { getActiveUserIds } from "../../../utils/authUser.js";
import { ServerEvents, type ChatServer } from "./chat.events.js";

const SWEEP_INTERVAL_MS = 60_000;

// Exported separately from the timer so tests can call it with a fake "now".
export async function sweepSocketSessions(io: ChatServer, now = Date.now()): Promise<void> {
  const sockets = [...io.sockets.sockets.values()];
  if (sockets.length === 0) return;

  // 1) Expired tokens need no database access.
  const live = [];
  for (const socket of sockets) {
    const expiresAt = socket.data.user.expiresAt;
    if (expiresAt !== undefined && expiresAt <= now) {
      socket.emit(ServerEvents.AuthExpired);
      socket.disconnect(true);
    } else {
      live.push(socket);
    }
  }

  // 2) Deleted accounts: one query for all distinct connected users.
  const ids = [...new Set(live.map((s) => s.data.user.userId))];
  if (ids.length === 0) return;

  const active = await getActiveUserIds(ids);
  for (const socket of live) {
    if (!active.has(socket.data.user.userId)) socket.disconnect(true);
  }
}

export function startSocketSessionSweeper(io: ChatServer): () => void {
  const timer = setInterval(() => {
    // If the database is down we keep sockets alive: send/read re-check per event
    // and fail closed, so a blip must not disconnect every user.
    sweepSocketSessions(io).catch((err) => console.error("Socket session sweep failed:", err));
  }, SWEEP_INTERVAL_MS);

  timer.unref(); // never keeps the process alive on shutdown
  return () => clearInterval(timer);
}