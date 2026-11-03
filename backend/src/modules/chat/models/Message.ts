import mongoose, { Schema, Types } from 'mongoose';

export interface IMessage {
  chat_id: Types.ObjectId;
  sender_id: string; // app-level ref -> PostgreSQL users.id
  content: string;
  is_read: boolean;
  read_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

const messageSchema = new Schema<IMessage>(
  {
    chat_id: { type: Schema.Types.ObjectId, ref: 'Chat', required: true },
    sender_id: { type: String, required: true },
    content: { type: String, required: true, trim: true, minlength: 1, maxlength: 2000 },
    is_read: { type: Boolean, default: false },
    read_at: { type: Date, default: null },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

// History pagination: newest first, _id makes the cursor deterministic
messageSchema.index({ chat_id: 1, created_at: -1, _id: -1 });

// Unread counts and mark-as-read: unread messages from the other user in a chat
messageSchema.index({ chat_id: 1, sender_id: 1, is_read: 1 });

export default mongoose.model<IMessage>('Message', messageSchema);