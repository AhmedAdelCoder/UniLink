import { cleanId } from "../utils/ids.js";
import { getAcceptedContactIds } from "../repositories/connection.repository.js";
import { getUsersByIds } from "../repositories/user.repository.js";
import { presenceQueryPayloadSchema } from "./chat.socket.validation.js";
import { ClientEvents, type ChatSocket, type PresenceInfo } from "./chat.events.js";
import { assertActiveUser, handle } from "./socket.utils.js";

export function registerPresenceHandlers(socket: ChatSocket): void {
  const me = socket.data.user.userId;

  socket.on(
    ClientEvents.PresenceQuery,
    handle(presenceQueryPayloadSchema, async ({ userIds }) => {
      await assertActiveUser(me);

      // Only accepted contacts are visible. Others are dropped silently (no error),
      // so a client cannot probe which accounts exist.
      const contacts = new Set(await getAcceptedContactIds(me));
      const allowed = [...new Set(userIds.map(cleanId))].filter((id) => contacts.has(id));

      const users = await getUsersByIds(allowed);
      const result: PresenceInfo[] = users.map((u) => ({
        userId: u.id,
        online: u.isOnline,
        lastSeen: u.isOnline || !u.lastSeen ? null : u.lastSeen.toISOString(),
      }));
      return { users: result };
    })
  );
}