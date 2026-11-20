import mongoose, { Schema, Types } from "mongoose";

export interface IMessage {
  chat_id: Types.ObjectId;
  sender_id: string;
  content: string;
  client_message_id?: string | null;
  is_read: boolean;
  read_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

const messageSchema = new Schema<IMessage>(
  {
    chat_id: {
      type: Schema.Types.ObjectId,
      ref: "Chat",
      required: true,
    },

    sender_id: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },

    content: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 2000,
    },

    client_message_id: {
      type: String,
      default: null,
      trim: true,
      maxlength: 64,
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
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  }
);

// Cursor pagination: created_at + _id.
messageSchema.index({
  chat_id: 1,
  created_at: -1,
  _id: -1,
});

// Unread messages lookup.
messageSchema.index({
  chat_id: 1,
  sender_id: 1,
  is_read: 1,
});

// Prevent duplicate messages when a client retries sending.
messageSchema.index(
  {
    chat_id: 1,
    sender_id: 1,
    client_message_id: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      client_message_id: { $type: "string" },
    },
  }
);

export default mongoose.model<IMessage>("Message", messageSchema);