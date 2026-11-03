import mongoose, { Schema } from 'mongoose';

export type CleanupStatus = 'pending' | 'cleaning' | 'failed';

export interface ICleanupState {
  status: CleanupStatus;
  claimed_by: string | null;
  claim_token: string | null;
  lease_expires_at: Date | null;
  attempt_count: number;
  last_error: string | null;
  last_attempt_at: Date | null;
  next_retry_at: Date | null;
}

export interface IPost {
  author_id: string;
  content: string;
  image_url: string | null;
  skills_tags: string[];
  like_count: number;
  comment_count: number;
  deleted_at: Date | null;
  cleanup_state?: ICleanupState | null;
  created_at: Date;
  updated_at: Date;
}

const cleanupStateSchema = new Schema<ICleanupState>(
  {
    status: {
      type: String,
      enum: ['pending', 'cleaning', 'failed'],
      default: 'pending',
    },
    claimed_by: { type: String, default: null },
    claim_token: { type: String, default: null },
    lease_expires_at: { type: Date, default: null },
    attempt_count: { type: Number, default: 0 },
    last_error: { type: String, default: null },
    last_attempt_at: { type: Date, default: null },
    next_retry_at: { type: Date, default: null },
  },
  { _id: false }
);

const postSchema = new Schema<IPost>(
  {
    author_id: { type: String, required: true },
    content: { type: String, required: true, maxlength: 3000 },
    image_url: { type: String, default: null },
    skills_tags: [{ type: String }],
    like_count: { type: Number, default: 0, min: 0 },
    comment_count: { type: Number, default: 0, min: 0 },
    deleted_at: { type: Date, default: null },
    cleanup_state: {
      type: cleanupStateSchema,
      default: null,
    },
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  }
);

postSchema.index({ author_id: 1, created_at: -1 });
postSchema.index({ created_at: -1, _id: -1 });
postSchema.index({ deleted_at: 1, created_at: -1, _id: -1 });

// Partial index for tombstoned posts undergoing or awaiting cleanup
postSchema.index(
  {
    'cleanup_state.status': 1,
    'cleanup_state.next_retry_at': 1,
    'cleanup_state.lease_expires_at': 1,
  },
  {
    partialFilterExpression: {
      deleted_at: { $type: 'date' },
    },
  }
);

export default mongoose.model<IPost>('Post', postSchema);
