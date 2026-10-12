import mongoose, { Schema } from 'mongoose';

export interface IChat {
  user_1_id: string;
  user_2_id: string;
  last_message: string | null;
  last_message_sender_id: string | null;
  last_message_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

const chatSchema = new Schema<IChat>(
  {
    // user_1_id is always the lexicographically smaller UUID.
    // This guarantees one thread per pair of users.
    user_1_id: { type: String, required: true },
    user_2_id: { type: String, required: true },
    last_message: { type: String, default: null },
    last_message_sender_id: { type: String, default: null },
    last_message_at: { type: Date, default: null },
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
chatSchema.pre('validate', function () {
  if (!this.user_1_id || !this.user_2_id) return;

  if (this.user_1_id === this.user_2_id) {
    throw new Error('A user cannot create a chat with themselves');
  }

  if (this.user_1_id > this.user_2_id) {
    [this.user_1_id, this.user_2_id] = [
      this.user_2_id,
      this.user_1_id,
    ];
  }
});

export default mongoose.model<IChat>('Chat', chatSchema);