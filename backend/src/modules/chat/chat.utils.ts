import { AppError } from "../../utils/AppError.js";

/** Same ordering as the Chat pre('validate') hook: smaller id is always user_1. */
export const normalizeUserPair = (userA: string, userB: string): [string, string] => {
  if (userA === userB) {
    throw new AppError("You cannot start a chat with yourself", 400);
  }
  return userA < userB ? [userA, userB] : [userB, userA];
};

export const otherParticipant = (
  chat: { user_1_id: string; user_2_id: string },
  userId: string
): string | null => {
  if (chat.user_1_id === userId) return chat.user_2_id;
  if (chat.user_2_id === userId) return chat.user_1_id;
  return null;
};