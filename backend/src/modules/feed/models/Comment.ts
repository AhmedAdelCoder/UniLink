import mongoose, { Schema, Types } from 'mongoose';

export interface IComment {
  post_id: Types.ObjectId;
  author_id: string; // app-level ref -> PostgreSQL users.id
  parent_comment_id: Types.ObjectId | null;
  content: string;
  like_count: number; // cache — source of truth is the likes collection
  created_at: Date;
  updated_at: Date;
}

const commentSchema = new Schema<IComment>(
  {
    post_id: {
      type: Schema.Types.ObjectId,
      ref: 'Post',
      required: true,
    },
    author_id: {
      type: String,
      required: true,
    },
    parent_comment_id: {
      type: Schema.Types.ObjectId,
      ref: 'Comment',
      default: null,
    },
    content: {
      type: String,
      required: true,
      maxlength: 1500,
    },
    like_count: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  }
);

commentSchema.index({
  post_id: 1,
  parent_comment_id: 1,
  created_at: 1,
});

commentSchema.index({
  post_id: 1,
  created_at: -1,
});

// Replies are limited to one level deep.
// Enforced in the service layer:
// if parent_comment_id is set, the parent comment must have
// parent_comment_id === null.

export default mongoose.model<IComment>('Comment', commentSchema);