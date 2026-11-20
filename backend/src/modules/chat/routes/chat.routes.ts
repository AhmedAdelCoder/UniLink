import { Router } from "express";

import {
  createOrGetChatController,
  getMyChatsController,
  getChatDetailsController,
  getMessagesController,
  sendMessageController,
  markChatAsReadController,
} from "../controllers/chat.controller.js";

import { authMiddleware } from "../../../middlewares/authmiddleware.js";
import { validate } from "../../../middlewares/validation.js";

import {
  chatIdParamsSchema,
  createChatBodySchema,
  listChatsQuerySchema,
  listMessagesQuerySchema,
  sendMessageBodySchema,
} from "../validation/chat.validation.js";

const router = Router();

router.use(authMiddleware());

router.post("/", validate(createChatBodySchema, "body"), createOrGetChatController);

router.get("/", validate(listChatsQuerySchema, "query"), getMyChatsController);

router.get(
  "/:chatId",
  validate(chatIdParamsSchema, "params"),
  getChatDetailsController,
);

router.get(
  "/:chatId/messages",
  validate(chatIdParamsSchema, "params"),
  validate(listMessagesQuerySchema, "query"),
  getMessagesController,
);

router.post(
  "/:chatId/messages",
  validate(chatIdParamsSchema, "params"),
  validate(sendMessageBodySchema, "body"),
  sendMessageController,
);

router.patch(
  "/:chatId/read",
  validate(chatIdParamsSchema, "params"),
  markChatAsReadController,
);

export default router;