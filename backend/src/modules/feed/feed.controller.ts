import { RequestHandler } from "express";

import {
  createPost,
  getFeed,
  likePost,
  unlikePost,
  createComment,
  getComments,
} from "./feed.service.js";

import type {
  CreatePostInput,
  GetFeedQuery,
  PostIdParam,
  CreateCommentInput,
  GetCommentsQuery,
} from "./feed.validation.js";

//=============== Handl req&res getFeedController ==============
export const getFeedController: RequestHandler = async (req, res) => {
  const { limit, cursor } = req.validated!.query as GetFeedQuery;
  const viewerId = req.user!.userId;

  const data = await getFeed(viewerId, limit, cursor);

  res.status(200).json({
    success: true,
    data,
  });
};
//============== Handl req&res createPostController ===================
export const createPostController: RequestHandler = async (req, res) => {
  const input = req.body as CreatePostInput;
  const authorId = req.user!.userId;

  const data = await createPost(authorId, input);

  res.status(201).json({
    success: true,
    data,
  });
};
//============== Handl req&res likePostController ===================
export const likePostController: RequestHandler = async (req, res) => {
  const { postId } = req.validated!.params as PostIdParam;
  const userId = req.user!.userId;

  const data = await likePost(userId, postId);

  res.status(201).json({
    success: true,
    data,
  });
};

//============== Handl req&res DeletelikePostController ===================
export const unlikePostController: RequestHandler = async (req, res) => {
  const { postId } = req.validated!.params as PostIdParam;
  const userId = req.user!.userId;

  const data = await unlikePost(userId, postId);

  res.status(200).json({
    success: true,
    data,
  });
};

//============== Handl req&res createCommentController  ===================
export const createCommentController: RequestHandler = async (req, res) => {
  const { postId } = req.validated!.params as PostIdParam;
  const input = req.body as CreateCommentInput;
  const authorId = req.user!.userId;

  const data = await createComment(
    authorId,
    postId,
    input
  );

  res.status(201).json({
    success: true,
    data,
  });
};

export const getCommentsController: RequestHandler = async (req, res) => {
  const { postId } = req.validated!.params as PostIdParam;
  const { limit, cursor } =
    req.validated!.query as GetCommentsQuery;

  const data = await getComments(
    postId,
    limit,
    cursor
  );

  res.status(200).json({
    success: true,
    data,
  });
};