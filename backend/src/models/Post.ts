import mongoose, { Schema } from 'mongoose';

export interface IPost {
  author_id: string;
  content: string;
  image_url: string | null;
  skills_tags: string[];
  like_count: number;
  comment_count: number;
  created_at: Date;
  updated_at: Date;
}

const postSchema = new Schema<IPost>(
  {
    author_id: { type: String, required: true },
    content: { type: String, required: true, maxlength: 3000 },
    image_url: { type: String, default: null },
    skills_tags: [{ type: String }],
    like_count: { type: Number, default: 0 },
    comment_count: { type: Number, default: 0 },
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  }
);

postSchema.index({ author_id: 1, created_at: -1 });
postSchema.index({ created_at: -1 });

export default mongoose.model<IPost>('Post', postSchema);