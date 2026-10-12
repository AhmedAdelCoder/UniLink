import { RequestHandler } from "express";

import {
  createPost,
  updatePost,
  deletePost,
  getFeed,
  likePost,
  unlikePost,
  createComment,
  getComments,
  likeComment,
  unlikeComment,
} from "./feed.service.js";

import type {
  CreatePostInput,
  UpdatePostInput,
  GetFeedQuery,
  PostIdParam,
  CreateCommentInput,
  GetCommentsQuery,
  CommentIdParam,
} from "./feed.validation.js";

//!=============== Handl req&res getFeedController ==============
export const getFeedController: RequestHandler = async (req, res) => {
  const { limit, cursor } = req.validated!.query as GetFeedQuery;
  const viewerId = req.user!.userId;

  const data = await getFeed(viewerId, limit, cursor);

  res.status(200).json({
    success: true,
    data,
  });
};
//!============== Handl req&res createPostController ===================
export const createPostController: RequestHandler = async (req, res) => {
  const input = req.body as CreatePostInput;
  const authorId = req.user!.userId;

  const data = await createPost(authorId, input);

  res.status(201).json({
    success: true,
    data,
  });
};


//todo=====> Update Post Controller 

export const updatePostController: RequestHandler = async (req, res) => {
  const { postId } = req.validated!.params as PostIdParam;
  const input = req.body as UpdatePostInput;
  const userId = req.user!.userId;

  const data = await updatePost(userId, postId, input);

  res.status(200).json({
    success: true,
    data,
  });
};
//todo=============> Handl  likePostController 
export const likePostController: RequestHandler = async (req, res) => {
  const { postId } = req.validated!.params as PostIdParam;
  const userId = req.user!.userId;

  const data = await likePost(userId, postId);

  res.status(201).json({
    success: true,
    data,
  });
};

//todo==============> Handl  Delete likePost
export const unlikePostController: RequestHandler = async (req, res) => {
  const { postId } = req.validated!.params as PostIdParam;
  const userId = req.user!.userId;

  const data = await unlikePost(userId, postId);

  res.status(200).json({
    success: true,
    data,
  });
};
//todo==============> Handl  Delete Post
export const deletePostController: RequestHandler = async (req, res) => {
  const { postId } = req.validated!.params as PostIdParam;

  const data = await deletePost(
    req.user!.userId,
    postId
  );

  res.status(200).json({
    success: true,
    data,
  });
};

//!============== Handl req&res createCommentController  ===================
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
  const { limit, cursor } = req.validated!.query as GetCommentsQuery;
  const viewerId = req.user!.userId;

  const data = await getComments(viewerId, postId, limit, cursor);

  res.status(200).json({
    success: true,
    data,
  });
};


//todo ==========>Handel Like Comment  
export const likeCommentController: RequestHandler = async (req, res) => {
  const { commentId } = req.validated!.params as CommentIdParam;
  const userId = req.user!.userId;

  const data = await likeComment(userId, commentId);

  res.status(201).json({
    success: true,
    data,
  });
};

//todo ==========>Handel Unlike Comment 
export const unlikeCommentController: RequestHandler = async (req, res) => {
  const { commentId } = req.validated!.params as CommentIdParam;
  const userId = req.user!.userId;

  const data = await unlikeComment(userId, commentId);

  res.status(200).json({
    success: true,
    data,
  });
};
