import mongoose, { Schema } from "mongoose";

export interface IChat {
  user_1_id: string;
  user_2_id: string;
  last_message: string | null;
  last_message_sender_id: string | null;
  last_message_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Normalize a pair of user IDs to guarantee
 * the same order regardless of who initiates the chat.
 */
export const normalizePair = (
  a: string,
  b: string
): [string, string] => {
  const userA = a.trim().toLowerCase();
  const userB = b.trim().toLowerCase();

  if (!userA || !userB) {
    throw new Error("Both user IDs are required");
  }

  if (userA === userB) {
    throw new Error("A user cannot create a chat with themselves");
  }

  return userA < userB
    ? [userA, userB]
    : [userB, userA];
};

const chatSchema = new Schema<IChat>(
  {
    user_1_id: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },

    user_2_id: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },

    last_message: {
      type: String,
      default: null,
      maxlength: 100,
    },

    last_message_sender_id: {
      type: String,
      default: null,
      trim: true,
      lowercase: true,
    },

    last_message_at: {
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

// One chat thread per normalized user pair.
chatSchema.index(
  { user_1_id: 1, user_2_id: 1 },
  { unique: true }
);

chatSchema.index({
  user_1_id: 1,
  last_message_at: -1,
  _id: -1,
});

chatSchema.index({
  user_2_id: 1,
  last_message_at: -1,
  _id: -1,
});

// Normalize IDs whenever a document is validated.
chatSchema.pre("validate", function () {
  if (!this.user_1_id || !this.user_2_id) return;

  const [user1, user2] = normalizePair(
    this.user_1_id,
    this.user_2_id
  );

  this.user_1_id = user1;
  this.user_2_id = user2;
});

export default mongoose.model<IChat>("Chat", chatSchema);