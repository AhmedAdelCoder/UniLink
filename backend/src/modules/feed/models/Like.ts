import mongoose, { Schema, Types } from 'mongoose';

export interface ILike {
  user_id: string; // app-level ref -> PostgreSQL users.id
  post_id: Types.ObjectId | null;
  comment_id: Types.ObjectId | null;
  created_at: Date;
}

const likeSchema = new Schema<ILike>(
  {
    user_id: {
      type: String,
      required: true,
    },
    post_id: {
      type: Schema.Types.ObjectId,
      ref: 'Post',
      default: null,
    },
    comment_id: {
      type: Schema.Types.ObjectId,
      ref: 'Comment',
      default: null,
    },
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: false,
    },
  }
);

// Exactly one of post_id / comment_id must be set
likeSchema.pre('validate', function () {
  const hasPost = this.post_id != null;
  const hasComment = this.comment_id != null;

  if (hasPost === hasComment) {
    throw new Error(
      'Like must reference exactly one of post_id or comment_id'
    );
  }
});

// One like per user per post
likeSchema.index(
  { user_id: 1, post_id: 1 },
  {
    unique: true,
    partialFilterExpression: {
      post_id: { $type: 'objectId' },
    },
  }
);

// One like per user per comment
likeSchema.index(
  { user_id: 1, comment_id: 1 },
  {
    unique: true,
    partialFilterExpression: {
      comment_id: { $type: 'objectId' },
    },
  }
);

export default mongoose.model<ILike>('Like', likeSchema);