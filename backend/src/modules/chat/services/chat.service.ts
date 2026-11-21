import { AppError } from "../../../utils/AppError.js"; // adjust to your error class
import { cleanId, isUuid } from "../utils/ids.js";
import {
  areUsersConnected,
  getAcceptedContactIds,
} from "../repositories/connection.repository.js";
import { getUsersByIds } from "../repositories/user.repository.js";
import {
  createChat,
  findChatById,
  getChatMessages,
  getUnreadCounts,
  getUserChats,
  InvalidCursorError,
  createMessage,
  updateLastMessage,
  markMessagesAsRead,
} from "../repositories/chat.repository.js";
import { Types } from "mongoose";
import type { IMessage } from "../models/Message.js";
import { applyPresenceVisibility, toChatDto } from "./chat.mapper.js";

/**
 * Open a chat with another user, or return the existing one.
 * Rules: valid target, not yourself, target exists and is active,
 * and an accepted connection exists between the two users.
 */
//todo=================  Check from chat ; creatre chat or return chat ===================

export const createOrGetChat = async (currentUserId: string, otherUserId: string) => {
  const me = cleanId(currentUserId);
  const other = cleanId(otherUserId);

  if (!isUuid(other)) throw new AppError("Invalid user ID", 400);
  if (me === other) throw new AppError("You cannot start a chat with yourself", 400);

  const [otherUser] = await getUsersByIds([other]);
  if (!otherUser) throw new AppError("User not found", 404);

  if (!(await areUsersConnected(me, other))) {
    throw new AppError("You can only chat with your accepted connections", 403);
  }

  const chat = await createChat(me, other);
  if (!chat) throw new AppError("Could not create the chat", 500);

  // The connection was just verified as accepted, so presence is visible here.
  return { chat, otherUser: applyPresenceVisibility(otherUser, true) };
};

//todo ===  Chat list for the current user: other participant, last message, unread count ====
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 50;


export const getMyChats = async (currentUserId: string, limit = DEFAULT_LIMIT) => {
  const me = cleanId(currentUserId);
  const requestedLimit = Number.isFinite(limit) ? Math.trunc(limit) : DEFAULT_LIMIT;
  const safeLimit = requestedLimit <= 0
    ? DEFAULT_LIMIT
    : Math.min(requestedLimit, MAX_LIMIT);

  const chats = await getUserChats(me, safeLimit);
  if (chats.length === 0) return [];

  const otherIdOf = (c: { user_1_id: string; user_2_id: string }) =>
    c.user_1_id === me ? c.user_2_id : c.user_1_id;

  const otherIds = [...new Set(chats.map(otherIdOf))];
  const [users, unread, contactIds] = await Promise.all([
    getUsersByIds(otherIds),
    getUnreadCounts(me, chats.map((c) => String(c._id))),
    getAcceptedContactIds(me), // one query for the whole list, not one per chat
  ]);
  const userById = new Map(users.map((u) => [u.id, u]));
  const contacts = new Set(contactIds);

  return chats.map((chat) => {
    const otherId = otherIdOf(chat);
    const user = userById.get(otherId);

    // Soft-deleted users are omitted by getUsersByIds, so show a placeholder.
    // Presence (isOnline / lastSeen) is shown only for accepted contacts.
    return toChatDto(
      chat,
      user
        ? applyPresenceVisibility(user, contacts.has(otherId))
        : { id: otherId, deleted: true as const },
      { unreadCount: unread.get(String(chat._id)) ?? 0 }
    );
  });
};

//todo ====== Load a chat and make sure the user is one of its two participants ====

const getChatForParticipant = async (chatId: string, userId: string) => {
  const me = cleanId(userId);

  if (!Types.ObjectId.isValid(chatId)) throw new AppError("Invalid chat ID", 400);

  const chat = await findChatById(chatId);
  // Same 404 for "missing" and "not yours", so chat IDs can't be probed.
  if (!chat || (chat.user_1_id !== me && chat.user_2_id !== me)) {
    throw new AppError("Chat not found", 404);
  }

  return { chat, me };
};

export const assertChatParticipant = async (
  userId: string,
  chatId: string
): Promise<void> => {
  await getChatForParticipant(chatId, userId);
};

const toMessageDto = (m: IMessage & { _id: Types.ObjectId }) => ({
  id: String(m._id),
  chatId: String(m.chat_id),
  senderId: m.sender_id,
  content: m.content,
  clientMessageId: m.client_message_id ?? null,
  isRead: m.is_read,
  readAt: m.read_at,
  createdAt: m.created_at,
});

export type MessageDto = ReturnType<typeof toMessageDto>;

/** Chat details for a participant. Reading stays allowed even when sending is not. */
export const getChatDetails = async (userId: string, chatId: string) => {
  const { chat, me } = await getChatForParticipant(chatId, userId);
  const otherId = chat.user_1_id === me ? chat.user_2_id : chat.user_1_id;

  const [[user], connected] = await Promise.all([
    getUsersByIds([otherId]),
    areUsersConnected(me, otherId),
  ]);

  return {
    chat,
    // Presence is hidden once the connection is gone (the chat stays readable).
    otherUser: user
      ? applyPresenceVisibility(user, connected)
      : { id: otherId, deleted: true as const },
    // False for removed connections and deleted users: the chat becomes read-only.
    canSend: Boolean(user) && connected,
  };
};

/** Mark the OTHER participant's unread messages as read. Own messages are never touched. */
export const markChatAsRead = async (userId: string, chatId: string) => {
  const { chat, me } = await getChatForParticipant(chatId, userId);
  const otherUserId = chat.user_1_id === me ? chat.user_2_id : chat.user_1_id;

  const updated = await markMessagesAsRead(String(chat._id), otherUserId);
  return { updated, otherUserId };
};


//!===============   message  ==================
const MESSAGES_DEFAULT_LIMIT = 30;
const MESSAGES_MAX_LIMIT = 50;


/** One page of messages (newest first) for a chat the user belongs to. */
export const getMessages = async (
  userId: string,
  chatId: string,
  options: { limit?: number; cursor?: string } = {}
) => {
  const { chat } = await getChatForParticipant(chatId, userId);

  const raw = Math.trunc(options.limit ?? MESSAGES_DEFAULT_LIMIT);
  const limit = Number.isFinite(raw) && raw >= 1 ? Math.min(raw, MESSAGES_MAX_LIMIT) : MESSAGES_DEFAULT_LIMIT;

  try {
    const page = await getChatMessages(String(chat._id), { limit, cursor: options.cursor });
    return { messages: page.messages.map(toMessageDto), nextCursor: page.nextCursor };
  } catch (error) {
    if (error instanceof InvalidCursorError) throw new AppError("Invalid cursor", 400);
    throw error;
  }
};

export const sendMessage = async (
  userId: string,
  chatId: string,
  input: { content: unknown; clientMessageId?: unknown }
) => {
  const { chat, me } = await getChatForParticipant(chatId, userId);

  if (typeof input.content !== "string") {
    throw new AppError("Invalid message content", 400);
  }
  const content = input.content.trim();
  if (content.length < 1 || content.length > 2_000) {
    throw new AppError("Invalid message content", 400);
  }

  let clientMessageId: string | undefined;
  if (input.clientMessageId !== undefined && input.clientMessageId !== null) {
    if (typeof input.clientMessageId !== "string") {
      throw new AppError("Invalid client message ID", 400);
    }
    clientMessageId = input.clientMessageId.trim();
    if (clientMessageId.length < 1 || clientMessageId.length > 64) {
      throw new AppError("Invalid client message ID", 400);
    }
  }

  const recipientId = chat.user_1_id === me ? chat.user_2_id : chat.user_1_id;
  const [recipient] = await getUsersByIds([recipientId]);
  if (!recipient || !(await areUsersConnected(me, recipientId))) {
    throw new AppError("You can only message your accepted connections", 403);
  }

  const { message, created } = await createMessage(
    String(chat._id),
    me,
    content,
    clientMessageId
  );

  try {
    await updateLastMessage(String(chat._id), message.content, me, message.created_at);
  } catch (error) {
    console.error(`Failed to update chat preview for chat ${String(chat._id)} and message ${String(message._id)}`, error);
  }

  return { message: toMessageDto(message), created, recipientId };
};