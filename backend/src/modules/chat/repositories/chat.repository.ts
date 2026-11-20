import { Types } from "mongoose";
import Chat, { normalizePair } from "../models/Chat.js";
import Message from "../models/Message.js";



const isDuplicateKeyError = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { code?: unknown }).code === 11000;
/**
 * Find a chat using its MongoDB ObjectId.
 * Returns null if the ID is invalid or the chat does not exist.
 */
export const findChatById = async (chatId: string) => {
  if (!Types.ObjectId.isValid(chatId)) {
    return null;
  }

  return Chat.findById(chatId).lean();
};

/**
 * Find a chat between two users regardless of their order.
 */
export const findChatBetweenUsers = async (
  userA: string,
  userB: string
) => {
  const [user_1_id, user_2_id] = normalizePair(userA, userB);

  return Chat.findOne({
    user_1_id,
    user_2_id,
  }).lean();
};

/**
 * Create a chat or return the existing one.
 * The unique index protects against concurrent duplicate creation.
 */
export const createChat = async (
  userA: string,
  userB: string
) => {
  const [user_1_id, user_2_id] = normalizePair(userA, userB);

  const filter = {
    user_1_id,
    user_2_id,
  };

  try {
    return await Chat.findOneAndUpdate(
      filter,
      {
        $setOnInsert: {
          ...filter,
          last_message_at: new Date(),
        },
      },
      {
        upsert: true,
        returnDocument: "after",
        lean: true,
        setDefaultsOnInsert: true,
      }
    );
  } catch (error) {
    // Another concurrent request may have created this chat.
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 11000
    ) {
      return Chat.findOne(filter).lean();
    }

    throw error;
  }
};

/**
 * Get all chats that belong to a specific user.
 * Includes empty chats and sorts by latest activity.
 */
export const getUserChats = async (userId: string, limit = 50) => {
  const normalizedUserId = userId.trim().toLowerCase();

  return Chat.find({
    $or: [{ user_1_id: normalizedUserId }, { user_2_id: normalizedUserId }],
  })
    .sort({ last_message_at: -1, _id: -1 })
    .limit(limit)
    .lean();
};

//todo =================== Cursor helpers ===================
interface MessageCursor { createdAt: Date; id: Types.ObjectId }

const encodeCursor = (m: { created_at: Date; _id: Types.ObjectId }) =>
  Buffer.from(`${m.created_at.toISOString()}|${m._id}`).toString("base64url");

const decodeCursor = (cursor: string): MessageCursor => {
  const parts = Buffer.from(cursor, "base64url").toString().split("|");
  if (parts.length !== 2) throw new InvalidCursorError();
  const [iso, id] = parts;
  const createdAt = new Date(iso);
  if (!iso || !id || isNaN(createdAt.getTime()) || !Types.ObjectId.isValid(id)) {
    throw new InvalidCursorError();
  }
  return { createdAt, id: new Types.ObjectId(id) };
};

/**
 * One page of messages, newest first.
 * Pass the returned nextCursor to get the next (older) page.
 */
export const getChatMessages = async (
  chatId: string,
  { limit = 30, cursor }: { limit?: number; cursor?: string } = {}
) => {
  const filter: Record<string, unknown> = {
    chat_id: new Types.ObjectId(chatId),
  };

  if (cursor) {
    const c = decodeCursor(cursor);
    filter.$or = [
      { created_at: { $lt: c.createdAt } },
      { created_at: c.createdAt, _id: { $lt: c.id } },
    ];
  }

  // Fetch one extra document to know if another page exists.
  const rows = await Message.find(filter)
    .sort({ created_at: -1, _id: -1 })
    .limit(limit + 1)
    .lean();

  const hasMore = rows.length > limit;
  const messages = hasMore ? rows.slice(0, limit) : rows;
  const last = messages[messages.length - 1];

  return {
    messages,
    nextCursor: hasMore && last ? encodeCursor(last) : null,
  };
};

/**
 * Mark unread messages sent BY `senderId` in this chat as read.
 * The service passes the OTHER participant, so a user can never
 * mark their own messages. Returns how many were updated.
 */
export const markMessagesAsRead = async (chatId: string, senderId: string) => {
  const res = await Message.updateMany(
    {
      chat_id: new Types.ObjectId(chatId),
      sender_id: senderId.trim().toLowerCase(),
      is_read: false,
    },
    { $set: { is_read: true, read_at: new Date() } }
  );
  return res.modifiedCount;
};

/** Unread counts for many chats in one query (avoids N+1 in the chat list). */
export const getUnreadCounts = async (userId: string, chatIds: string[]) => {
  if (chatIds.length === 0) return new Map<string, number>();

  const rows = await Message.aggregate<{ _id: Types.ObjectId; count: number }>([
    {
      $match: {
        chat_id: { $in: chatIds.map((id) => new Types.ObjectId(id)) },
        sender_id: { $ne: userId.trim().toLowerCase() },
        is_read: false,
      },
    },
    { $group: { _id: "$chat_id", count: { $sum: 1 } } },
  ]);

  return new Map(rows.map((r) => [r._id.toString(), r.count]));
};

//! ================= Message  ======================

//todo ---------- Message creation ----------

export const createMessage = async (
  chatId: string,
  senderId: string,
  content: string,
  clientMessageId?: string | null
) => {
  if (!Types.ObjectId.isValid(chatId)) {
    throw new Error("Invalid chat ID");
  }

  const chat_id = new Types.ObjectId(chatId);
  const sender_id = senderId.trim().toLowerCase();
  const client_message_id = clientMessageId?.trim() || null;

  try {
    const doc = await Message.create({
      chat_id,
      sender_id,
      content: content.trim(),
      client_message_id,
    });

    return { message: doc.toObject(), created: true as const };
  } catch (error) {
    if (client_message_id && isDuplicateKeyError(error)) {
      const existing = await Message.findOne({
        chat_id,
        sender_id,
        client_message_id,
      }).lean();

      if (existing) {
        return { message: existing, created: false as const };
      }
    }

    throw error;
  }
};

//todo---------- Update chat last message ----------

export const updateLastMessage = async (
  chatId: string,
  content: string,
  senderId: string,
  messageCreatedAt: Date
) => {
  if (!Types.ObjectId.isValid(chatId)) {
    throw new Error("Invalid chat ID");
  }

  const normalizedSenderId = senderId.trim().toLowerCase();

  const result = await Chat.updateOne(
    {
      _id: new Types.ObjectId(chatId),
      $or: [
        { user_1_id: normalizedSenderId },
        { user_2_id: normalizedSenderId },
      ],
      $and: [
        {
          $or: [
            { last_message_at: null },
            { last_message_at: { $lte: messageCreatedAt } },
          ],
        },
      ],
    },
    {
      $set: {
        last_message: Array.from(content.trim()).slice(0, 100).join(""),
        last_message_sender_id: normalizedSenderId,
        last_message_at: messageCreatedAt,
      },
    }
  );

  if (result.modifiedCount > 0) return true;

  // Not updated: a newer message already won (normal) or the chat/participant is invalid (error).
  const chatExists = await Chat.exists({
    _id: new Types.ObjectId(chatId),
    $or: [
      { user_1_id: normalizedSenderId },
      { user_2_id: normalizedSenderId },
    ],
  });

  if (chatExists) return false;

  throw new Error("Chat not found or sender is not a participant");
};


export class InvalidCursorError extends Error {
  constructor() {
    super("Invalid cursor");
    this.name = "InvalidCursorError";
  }
}
