import mongoose from 'mongoose';

const postSchema = new mongoose.Schema(
  {
    author_id: {
      type: String,
      required: true,
    },

    content: {
      type: String,
      required: true,
      maxlength: 3000,
    },

    image_url: {
      type: String,
      default: null,
    },

    skills_tags: [
      {
        type: String,
      },
    ],

    like_count: {
      type: Number,
      default: 0,
    },

    comment_count: {
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

postSchema.index({ author_id: 1, created_at: -1 });
postSchema.index({ created_at: -1 });

export default mongoose.model('Post', postSchema);