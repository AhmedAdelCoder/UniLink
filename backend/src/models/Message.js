import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    chat_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Chat',
      required: true,
    },

    sender_id: {
      type: String,
      required: true,
    }, // app-level ref -> PostgreSQL users.id

    content: {
      type: String,
      required: true,
      maxlength: 2000,
    },

    is_read: {
      type: Boolean,
      default: false,
    },

    read_at: {
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

// Chat messages: newest first
// _id makes cursor pagination deterministic
messageSchema.index({
  chat_id: 1,
  created_at: -1,
  _id: -1,
});

// Enforced in the service layer:
// sender_id must belong to the chat.
// When creating a message, update the parent Chat:
// last_message, last_message_sender_id, last_message_at.

export default mongoose.model('Message', messageSchema);