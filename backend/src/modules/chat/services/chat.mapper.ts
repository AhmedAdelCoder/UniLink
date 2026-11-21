import type { Types } from "mongoose";

interface ChatLike {
  _id: Types.ObjectId;
  last_message: string | null;
  last_message_sender_id: string | null;
  last_message_at: Date | null;
}

interface WithPresence {
  isOnline: boolean;
  lastSeen: Date | null;
}

/** Public shape of a chat. No raw Mongo fields (_id, __v, user_1_id, ...) leave the API. */
export const toChatDto = <T extends { id: string }>(
  chat: ChatLike,
  otherUser: T | { id: string; deleted: true },
  extras: Record<string, unknown> = {}
) => ({
  ...extras,
  id: String(chat._id),
  otherUser,
  lastMessage: chat.last_message
    ? {
        content: chat.last_message,
        senderId: chat.last_message_sender_id,
        createdAt: chat.last_message_at,
      }
    : null,
  lastMessageAt: chat.last_message_at,
});

export const applyPresenceVisibility = <T extends WithPresence>(user: T, visible: boolean) => {
  const { isOnline, lastSeen, ...rest } = user;
  return visible ? { ...rest, isOnline, lastSeen: isOnline ? null : lastSeen } : rest;
};
