import { Router } from "express";

import {
  getFeedController,
  createPostController,
  updatePostController,
  likePostController,
  unlikePostController,
  createCommentController,
  getCommentsController,
  likeCommentController,
  unlikeCommentController,
  deletePostController,
} from "./feed.controller.js";

import { authMiddleware } from "../../middlewares/authmiddleware.js";
import { validate } from "../../middlewares/validation.js";

import {
  getFeedQuerySchema,
  createPostSchema,
  updatePostSchema,
  postIdParamSchema,
  createCommentSchema,
  getCommentsQuerySchema,
  commentIdParamSchema,
} from "./feed.validation.js";

const router = Router();

router.use(authMiddleware());
//============= Post ==================
router.get("/", validate(getFeedQuerySchema, "query"), getFeedController);

router.post("/", validate(createPostSchema, "body"), createPostController);

router.post(
  "/:postId/like",
  validate(postIdParamSchema, "params"),
  likePostController,
);

router.delete(
  "/:postId/like",
  validate(postIdParamSchema, "params"),
  unlikePostController,
);

router.patch(
  "/:postId",
  validate(postIdParamSchema, "params"),
  validate(updatePostSchema, "body"),
  updatePostController,
);

router.delete(
  "/:postId",
  validate(postIdParamSchema, "params"),
  deletePostController
);

//============= Comment ===============

router.post(
  "/:postId/comments",
  validate(postIdParamSchema, "params"),
  validate(createCommentSchema, "body"),
  createCommentController,
);

router.get(
  "/:postId/comments",
  authMiddleware(),
  validate(postIdParamSchema, "params"),
  validate(getCommentsQuerySchema, "query"),
  getCommentsController,
);
//======= like and Unilike ==========
router.post(
  "/comments/:commentId/like",
  validate(commentIdParamSchema, "params"),
  likeCommentController,
);

router.delete(
  "/comments/:commentId/like",
  validate(commentIdParamSchema, "params"),
  unlikeCommentController,
);

export default router;
