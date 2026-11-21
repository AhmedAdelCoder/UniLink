import { AppError } from "../../../utils/AppError.js";
import {
  assertChatParticipant,
  markChatAsRead,
  sendMessage,
} from "../services/chat.service.js";
import {
  chatRefPayloadSchema,
  sendMessagePayloadSchema,
} from "./chat.socket.validation.js";
import {
  ClientEvents,
  ServerEvents,
  chatRoom,
  userRoom,
  type ChatSocket,
} from "./chat.events.js";
import { emitMessageNew, emitMessageRead } from "./chat.emitter.js";
import { assertActiveUser, handle } from "./socket.utils.js";

export function registerChatHandlers(socket: ChatSocket): void {
  // The identity always comes from the verified JWT, never from client payloads.
  const me = socket.data.user.userId;

  // State-changing events re-check the session: the connection can outlive both the
  // token and the account. Expiry is rejected immediately instead of waiting for the
  // next sweep; the client gets auth:expired and must reconnect with a fresh token.
  const requireActiveSession = async (): Promise<void> => {
    const expiresAt = socket.data.user.expiresAt;
    if (expiresAt !== undefined && expiresAt <= Date.now()) {
      socket.emit(ServerEvents.AuthExpired);
      // The ack for this call is still delivered: disconnect only cuts the connection afterwards.
      socket.disconnect(true);
      throw new AppError("Unauthorized", 401);
    }
    await assertActiveUser(me);
  };

  // Personal room: events sent to user:{id} reach all of the user's devices.
  void socket.join(userRoom(me));

  socket.on(
    ClientEvents.ChatJoin,
    handle(chatRefPayloadSchema, async ({ chatId }) => {
      await assertChatParticipant(me, chatId);
      await socket.join(chatRoom(chatId));
      return { chatId };
    })
  );

  // Leaving a room exposes nothing, so no participant check is needed.
  socket.on(
    ClientEvents.ChatLeave,
    handle(chatRefPayloadSchema, async ({ chatId }) => {
      await socket.leave(chatRoom(chatId));
      return { chatId };
    })
  );

  socket.on(
    ClientEvents.MessageSend,
    handle(
      sendMessagePayloadSchema,
      async ({ chatId, content, clientMessageId }) => {
        await requireActiveSession();

        // The message is persisted inside sendMessage before we ack or emit.
        const { message, created, recipientId } = await sendMessage(me, chatId, {
          content,
          clientMessageId,
        });

        // Emit only for newly created messages so retries never duplicate events.
        // Passing the socket skips it (it gets the ack) but reaches the sender's
        // other devices and the recipient's devices.
        if (created) emitMessageNew(message, me, recipientId, socket);

        return { message, created };
      }
    )
  );

  socket.on(
    ClientEvents.MessageRead,
    handle(chatRefPayloadSchema, async ({ chatId }) => {
      await requireActiveSession();

      const { updated, otherUserId } = await markChatAsRead(me, chatId);

      // Notify the other participant only when something actually changed.
      if (updated) emitMessageRead(chatId, me, otherUserId);

      return { updated: Boolean(updated) };
    })
  );
}