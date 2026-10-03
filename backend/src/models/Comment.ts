import mongoose, { Document, Model } from 'mongoose';

interface IComment extends Document {
  post_id: mongoose.Types.ObjectId;
  author_id: string;
  parent_comment_id: mongoose.Types.ObjectId | null;
  content: string;
  like_count: number;
  created_at: Date;
  updated_at: Date;
}

const commentSchema = new mongoose.Schema<IComment>(
  {
    post_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post',
      required: true,
    },

    author_id: {
      type: String,
      required: true,
    }, // app-level ref -> PostgreSQL users.id

    parent_comment_id: {
      type: mongoose.Schema.Types.ObjectId,
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
    }, // cache — source of truth is the likes collection
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

const Comment: Model<IComment> = mongoose.model<IComment>(
  'Comment',
  commentSchema
);

export default Comment;