import prisma  from "../../../config/postgres.js"; // adjust to your Prisma client
import { cleanId, isUuid } from "../utils/ids.js";

/** Latest connection between two users (either direction, any status). */
export const findConnectionBetweenUsers = async (userA: string, userB: string) => {
  const a = cleanId(userA);
  const b = cleanId(userB);
  if (!isUuid(a) || !isUuid(b)) return null;

  return prisma.connection.findFirst({
    where: {
      OR: [
        { requesterId: a, receiverId: b },
        { requesterId: b, receiverId: a },
      ],
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, requesterId: true, receiverId: true, status: true },
  });
};

/** True only if the users have an accepted connection and both are active. */
export const areUsersConnected = async (userA: string, userB: string) => {
  const a = cleanId(userA);
  const b = cleanId(userB);
  if (!isUuid(a) || !isUuid(b)) return false;

  const connection = await prisma.connection.findFirst({
    where: {
      status: "accepted",
      requester: { deletedAt: null },
      receiver: { deletedAt: null },
      OR: [
        { requesterId: a, receiverId: b },
        { requesterId: b, receiverId: a },
      ],
    },
    select: { id: true },
  });

  return connection !== null;
};

// Accepted contacts in ONE query. A pair can exist twice (A->B and B->A), so IDs go through a Set.
export const getAcceptedContactIds = async (userId: string): Promise<string[]> => {
  const me = cleanId(userId);
  if (!isUuid(me)) return [];

  const rows = await prisma.connection.findMany({
    where: { status: "accepted", OR: [{ requesterId: me }, { receiverId: me }] },
    select: { requesterId: true, receiverId: true },
  });

  const ids = new Set<string>();
  for (const row of rows) ids.add(row.requesterId === me ? row.receiverId : row.requesterId);
  return [...ids];
};