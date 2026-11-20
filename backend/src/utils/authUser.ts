import type { Role } from "@prisma/client";
import prisma from "../config/postgres.js";
import { isUuid } from "./ids.js";

export interface ActiveAuthUser {
  id: string;
  role: Role;
}

/** Returns current auth data for an active user, or null for invalid/inactive IDs. */
export const getActiveAuthUser = async (userId: string): Promise<ActiveAuthUser | null> => {
  if (!isUuid(userId)) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, deletedAt: true, role: true },
  });

  if (!user || user.deletedAt) return null;
  return { id: user.id, role: user.role };
};
