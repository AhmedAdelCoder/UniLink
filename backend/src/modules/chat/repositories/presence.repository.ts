import prisma from "../../../config/postgres.js";

// updateMany (not update): a missing or soft-deleted user must not throw inside a socket event.
export const markUserOnline = async (userId: string): Promise<void> => {
  await prisma.user.updateMany({
    where: { id: userId, deletedAt: null },
    data: { isOnline: true },
  });
};

export const markUserOffline = async (userId: string, lastSeen: Date): Promise<void> => {
  await prisma.user.updateMany({
    where: { id: userId, deletedAt: null },
    data: { isOnline: false, lastSeen },
  });
};

// A crash or restart skips every disconnect handler, so no one may stay "online" across a boot.
export const resetAllPresence = async (): Promise<void> => {
  await prisma.user.updateMany({
    where: { isOnline: true },
    data: { isOnline: false, lastSeen: new Date() },
  });
};