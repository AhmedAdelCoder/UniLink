import mongoose from 'mongoose';

const commentSchema = new mongoose.Schema(
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

export default mongoose.model('Comment', commentSchema);