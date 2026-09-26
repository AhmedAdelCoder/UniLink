import mongoose from 'mongoose';

const chatSchema = new mongoose.Schema(
  {
    // user_1_id is always the lexicographically smaller UUID.
    // This guarantees one thread per pair of users.

    user_1_id: {
      type: String,
      required: true,
    },

    user_2_id: {
      type: String,
      required: true,
    },

    last_message: {
      type: String,
      default: null,
    },

    last_message_sender_id: {
      type: String,
      default: null,
    },

    last_message_at: {
      type: Date,
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

// One chat thread per pair of users
chatSchema.index(
  { user_1_id: 1, user_2_id: 1 },
  { unique: true }
);

// Get all chats for a user, newest first
chatSchema.index({
  user_1_id: 1,
  last_message_at: -1,
});

chatSchema.index({
  user_2_id: 1,
  last_message_at: -1,
});

// Normalize the user pair and prevent self-chat
chatSchema.pre('validate', function (next) {
  if (!this.user_1_id || !this.user_2_id) {
    return next();
  }

  if (this.user_1_id === this.user_2_id) {
    return next(new Error('A user cannot create a chat with themselves'));
  }

  if (this.user_1_id > this.user_2_id) {
    [this.user_1_id, this.user_2_id] = [
      this.user_2_id,
      this.user_1_id,
    ];
  }

  next();
});

export default mongoose.model('Chat', chatSchema);