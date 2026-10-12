import { z } from "zod";
import { Types } from "mongoose";

const objectIdSchema = z.string().refine(
  (value) => Types.ObjectId.isValid(value),
  { message: "Invalid id" }
);

export const getFeedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
});

//============== part post ===============
export const createPostSchema = z.object({
  content: z.string().trim().min(1).max(3000),
  image_url: z.url().nullish(),
  skills_tags: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
});

// ================= Update Post =================

export const updatePostSchema = z
  .object({
    content: z.string().trim().min(1).max(3000).optional(),
    image_url: z.url().nullable().optional(),
    skills_tags: z
      .array(z.string().trim().min(1).max(30))
      .max(10)
      .optional(),
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    { message: "At least one field must be provided" }
  );

export type UpdatePostInput = z.infer<typeof updatePostSchema>;

//=========== part Likes ==============
export const postIdParamSchema = z.object({
  postId: objectIdSchema,
});

// ============ part Comments ==============

export const createCommentSchema = z.object({
  content: z.string().trim().min(1).max(1500),
  parent_comment_id: objectIdSchema.nullish(),
});

export const getCommentsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
});

// ============ postIdParamSchema ==============

export const commentIdParamSchema = z.object({
  commentId: objectIdSchema,
});

export type CommentIdParam = z.infer<
  typeof commentIdParamSchema
>;

export type CreatePostInput = z.infer<typeof createPostSchema>;
export type GetFeedQuery = z.infer<typeof getFeedQuerySchema>;
export type PostIdParam = z.infer<typeof postIdParamSchema>;
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type GetCommentsQuery = z.infer<typeof getCommentsQuerySchema>;