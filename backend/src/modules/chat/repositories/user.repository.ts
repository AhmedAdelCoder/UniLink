import  prisma  from "../../../config/postgres.js"; // same client
import { cleanId, isUuid } from "../utils/ids.js";

const USER_FIELDS = {
  id: true,
  fullName: true,
  role: true,
  photoUrl: true,
  companyName: true,
  companyLogoUrl: true,
  isOnline: true,
  lastSeen: true,
} as const;

/** Public profile fields for many users in ONE query. Soft-deleted users are omitted. */
export const getUsersByIds = async (ids: string[]) => {
  const valid = [...new Set(ids.map(cleanId))].filter(isUuid);
  if (valid.length === 0) return [];

  return prisma.user.findMany({
    where: { id: { in: valid }, deletedAt: null },
    select: USER_FIELDS,
  });
};