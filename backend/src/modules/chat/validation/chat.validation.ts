import { z } from "zod";

const chatId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid chat ID");
const limit = z.coerce.number().int().min(1).max(50).optional();

export const chatIdParamsSchema = z.object({ chatId });

export const createChatBodySchema = z
  .object({ userId: z.string().uuid("Invalid user ID") })
  .strict();

export const listChatsQuerySchema = z.object({ limit });

export const listMessagesQuerySchema = z.object({
  limit,
  cursor: z.string().min(1).max(200).optional(),
});

export const sendMessageBodySchema = z
  .object({
    content: z.string().trim().min(1).max(2000),
    clientMessageId: z.string().trim().min(1).max(64).optional(),
  })
  .strict();

export type ChatIdParam = z.infer<typeof chatIdParamsSchema>;
export type CreateChatInput = z.infer<typeof createChatBodySchema>;
export type ListChatsQuery = z.infer<typeof listChatsQuerySchema>;
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;
export type SendMessageInput = z.infer<typeof sendMessageBodySchema>;