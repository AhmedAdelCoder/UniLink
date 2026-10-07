import { Router } from "express";

import {
  getFeedController,
  createPostController,
  likePostController,
  unlikePostController,
  createCommentController,
  getCommentsController,
} from "./feed.controller.js";

import { authMiddleware } from "../../middlewares/authmiddleware.js";
import { validate } from "../../middlewares/validation.js";

import {
  getFeedQuerySchema,
  createPostSchema,
  postIdParamSchema,
  createCommentSchema,
  getCommentsQuerySchema,
} from "./feed.validation.js";

const router = Router();

router.use(authMiddleware());

router.get(
  "/",
  validate(getFeedQuerySchema, "query"),
  getFeedController
);

router.post(
  "/",
  validate(createPostSchema, "body"),
  createPostController
);

router.post(
  "/:postId/like",
  validate(postIdParamSchema, "params"),
  likePostController
);

router.delete(
  "/:postId/like",
  validate(postIdParamSchema, "params"),
  unlikePostController
);

router.post(
  "/:postId/comments",
  validate(postIdParamSchema, "params"),
  validate(createCommentSchema, "body"),
  createCommentController
);

router.get(
  "/:postId/comments",
  validate(postIdParamSchema, "params"),
  validate(getCommentsQuerySchema, "query"),
  getCommentsController
);

export default router;