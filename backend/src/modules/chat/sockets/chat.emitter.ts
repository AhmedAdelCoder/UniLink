import type { MessageDto } from "../services/chat.service.js";
import { ServerEvents, userRoom, type ChatServer, type ChatSocket } from "./chat.events.js";

// The REST controller has no socket in hand, so initSocket registers the server here once.
let server: ChatServer | null = null;
export const setChatServer = (io: ChatServer | null): void => {
  server = io;
};

/**
 * Single place that announces a new message to both participants' devices.
 * Socket path: pass the sending socket so it is skipped (it gets the ack instead).
 * REST path: no socket, so every device of the sender receives it too; clients dedupe by message id.
 * A no-op when no server is registered, so REST works (and tests run) without Socket.IO.
 */
export function emitMessageNew(
  message: MessageDto,
  senderId: string,
  recipientId: string,
  fromSocket?: ChatSocket
): void {
  const rooms = [userRoom(senderId), userRoom(recipientId)];
  const target = fromSocket ? fromSocket.to(rooms) : server?.to(rooms);
  target?.emit(ServerEvents.MessageNew, { message });
}

/** Tells the other participant that readerId has read the chat (socket and REST share this). */
export function emitMessageRead(chatId: string, readerId: string, otherUserId: string): void {
  server?.to(userRoom(otherUserId)).emit(ServerEvents.MessageRead, { chatId, readerId });
}