import type { RequestHandler } from "express";
import { emitMessageNew, emitMessageRead } from "../sockets/chat.emitter.js";
import {
  createOrGetChat,
  getMyChats,
  getChatDetails,
  getMessages,
  sendMessage,
  markChatAsRead,
} from "../services/chat.service.js";
import { toChatDto } from "../services/chat.mapper.js";

import type {
  ChatIdParam,
  CreateChatInput,
  ListChatsQuery,
  ListMessagesQuery,
  SendMessageInput,
} from "../validation/chat.validation.js";

//!=============== POST /chat : open a chat or return the existing one ==============
export const createOrGetChatController: RequestHandler = async (req, res) => {
  const { userId: otherUserId } = req.body as CreateChatInput;
  const userId = req.user!.userId;

  const { chat, otherUser } = await createOrGetChat(userId, otherUserId);

  res.status(200).json({
    success: true,
    data: { chat: toChatDto(chat, otherUser) },
  });
};

//!=============== GET /chat : chat list ==============
export const getMyChatsController: RequestHandler = async (req, res) => {
  const { limit } = req.validated!.query as ListChatsQuery;
  const userId = req.user!.userId;

  const chats = await getMyChats(userId, limit);

  res.status(200).json({
    success: true,
    data: { chats },
  });
};

//!=============== GET /chat/:chatId : chat details (+ canSend) ==============
export const getChatDetailsController: RequestHandler = async (req, res) => {
  const { chatId } = req.validated!.params as ChatIdParam;
  const userId = req.user!.userId;

  const { chat, otherUser, canSend } = await getChatDetails(userId, chatId);

  res.status(200).json({
    success: true,
    data: { chat: toChatDto(chat, otherUser, { canSend }) },
  });
};

//!=============== GET /chat/:chatId/messages ==============
export const getMessagesController: RequestHandler = async (req, res) => {
  const { chatId } = req.validated!.params as ChatIdParam;
  const { limit, cursor } = req.validated!.query as ListMessagesQuery;
  const userId = req.user!.userId;

  const data = await getMessages(userId, chatId, { limit, cursor });

  res.status(200).json({
    success: true,
    data,
  });
};
//!=============== POST /chat/:chatId/messages ==============
export const sendMessageController: RequestHandler = async (req, res) => {
  const { chatId } = req.validated!.params as ChatIdParam;
  const input = req.body as SendMessageInput;
  const userId = req.user!.userId;

  const { message, created, recipientId } = await sendMessage(userId, chatId, input);

  // Same announcement the socket path makes: only for a newly created message, never on a retry.
  if (created) emitMessageNew(message, userId, recipientId);

  // 201 for a new message, 200 when it was a retry of an already saved one.
  res.status(created ? 201 : 200).json({
    success: true,
    data: { message },
  });
};

//!=============== PATCH /chat/:chatId/read ==============
export const markChatAsReadController: RequestHandler = async (req, res) => {
  const { chatId } = req.validated!.params as ChatIdParam;
  const userId = req.user!.userId;

  const { updated, otherUserId } = await markChatAsRead(userId, chatId);

  // Notify the other participant only when something actually changed.
  if (updated) emitMessageRead(chatId, userId, otherUserId);

  res.status(200).json({
    success: true,
    data: { updated },
  });
};