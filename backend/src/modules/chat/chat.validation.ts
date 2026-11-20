import { z } from "zod";

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid id");
const cursor = z.string().min(1).max(200).optional();

export const createChatBodySchema = z.object({
  other_user_id: z.uuid(),
});

export const chatIdParamsSchema = z.object({
  chatId: objectId,
});

export const listChatsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor,
});

export const listMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor,
});

export const sendMessageBodySchema = z.object({
  content: z.string().trim().min(1).max(2000),
});

// Socket payloads (reused in Phase 5)
export const socketJoinSchema = z.object({ chat_id: objectId });
export const socketSendSchema = z.object({
  chat_id: objectId,
  content: z.string().trim().min(1).max(2000),
  temp_id: z.string().max(64).optional(),
});
export const socketReadSchema = z.object({ chat_id: objectId });