import mongoose, { Document, Model } from 'mongoose';

interface ILike extends Document {
  user_id: string;
  post_id: mongoose.Types.ObjectId | null;
  comment_id: mongoose.Types.ObjectId | null;
  created_at: Date;
}

const likeSchema = new mongoose.Schema<ILike>(
  {
    user_id: {
      type: String,
      required: true,
    }, // app-level ref -> PostgreSQL users.id

    post_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post',
      default: null,
    },

    comment_id: {
      type: mongoose.Schema.Types.ObjectId,
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
      post_id: { $exists: true },
    },
  }
);

// One like per user per comment
likeSchema.index(
  { user_id: 1, comment_id: 1 },
  {
    unique: true,
    partialFilterExpression: {
      comment_id: { $exists: true },
    },
  }
);

const Like: Model<ILike> = mongoose.model<ILike>('Like', likeSchema);

export default Like;