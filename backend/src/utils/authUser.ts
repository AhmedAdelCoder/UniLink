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

/**
 * Returns the IDs (from the given list) that belong to active users, in one query.
 * Used by the socket session sweeper instead of one lookup per connected user.
 */
export const getActiveUserIds = async (userIds: string[]): Promise<Set<string>> => {
  const valid = userIds.filter(isUuid);
  if (valid.length === 0) return new Set();

  const rows = await prisma.user.findMany({
    where: { id: { in: valid }, deletedAt: null },
    select: { id: true },
  });

  return new Set(rows.map((row) => row.id));
};