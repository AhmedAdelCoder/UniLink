
import { z } from "zod";
import {
  chatIdSchema,
  sendMessageBodySchema,
} from "../validation/chat.validation.js";

// Join, leave, and read events require only a chat ID.
export const chatRefPayloadSchema = z
  .object({
    chatId: chatIdSchema,
  })
  .strict();

// Socket messages require a clientMessageId for acknowledgment and retry handling.
export const sendMessagePayloadSchema = sendMessageBodySchema
  .extend({
    chatId: chatIdSchema,
    clientMessageId: z.string().trim().min(1).max(64),
  })
  .strict();

export const presenceQueryPayloadSchema = z
  .object({ userIds: z.array(z.string().uuid()).min(1).max(50) })
  .strict();
