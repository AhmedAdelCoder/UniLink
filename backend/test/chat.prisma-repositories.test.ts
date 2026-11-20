import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import prisma from "../src/config/postgres.js";
import {
  areUsersConnected,
  findConnectionBetweenUsers,
} from "../src/modules/chat/repositories/connection.repository.js";
import { getUsersByIds } from "../src/modules/chat/repositories/user.repository.js";

const alice = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";
const deleted = "33333333-3333-4333-8333-333333333333";

describe("Chat PostgreSQL repositories", () => {
  const originals = {
    connection: prisma.connection.findFirst,
    user: prisma.user.findMany,
  };
  let connectionResult: unknown = null;
  let connectionArgs: unknown[] = [];
  let users: Array<Record<string, unknown>> = [];
  let userArgs: unknown[] = [];

  before(() => {
    (prisma.connection as any).findFirst = async (...args: unknown[]) => {
      connectionArgs.push(args[0]);
      return connectionResult;
    };
    (prisma.user as any).findMany = async (...args: unknown[]) => {
      userArgs.push(args[0]);
      const query = args[0] as { where: { id: { in: string[] }; deletedAt: null } };
      return users.filter((user) => query.where.id.in.includes(String(user.id)) && user.deletedAt == null);
    };
  });
  after(() => {
    (prisma.connection as any).findFirst = originals.connection;
    (prisma.user as any).findMany = originals.user;
  });
  beforeEach(() => {
    connectionResult = null;
    connectionArgs = [];
    users = [];
    userArgs = [];
  });

  it("finds a connection in requester to receiver direction and includes both directions in the query", async () => {
    const connection = { id: "c1", requesterId: alice, receiverId: bob, status: "pending" };
    connectionResult = connection;
    assert.equal(await findConnectionBetweenUsers(alice, bob), connection);
    assert.deepEqual(connectionArgs[0], {
      where: { OR: [
        { requesterId: alice, receiverId: bob },
        { requesterId: bob, receiverId: alice },
      ] },
      orderBy: { createdAt: "desc" },
      select: { id: true, requesterId: true, receiverId: true, status: true },
    });
  });

  it("finds a connection stored in receiver to requester direction", async () => {
    const connection = { id: "c2", requesterId: bob, receiverId: alice, status: "accepted" };
    connectionResult = connection;
    assert.equal(await findConnectionBetweenUsers(alice, bob), connection);
  });

  it("returns null for invalid UUIDs and absent connections", async () => {
    assert.equal(await findConnectionBetweenUsers("bad", bob), null);
    assert.equal(connectionArgs.length, 0);
    assert.equal(await findConnectionBetweenUsers(alice, bob), null);
  });

  it("returns true only for an accepted connection with active users", async () => {
    connectionResult = { id: "c1" };
    assert.equal(await areUsersConnected(alice, bob), true);
    assert.deepEqual(connectionArgs[0], {
      where: {
        status: "accepted",
        requester: { deletedAt: null },
        receiver: { deletedAt: null },
        OR: [
          { requesterId: alice, receiverId: bob },
          { requesterId: bob, receiverId: alice },
        ],
      },
      select: { id: true },
    });
  });

  it("returns false for pending, rejected, absent, deleted-user, and invalid-ID cases", async () => {
    for (const status of ["pending", "rejected"]) {
      connectionResult = null; // The query filters these statuses out.
      assert.equal(await areUsersConnected(alice, bob), false, `${status} connections are not accepted`);
    }
    connectionResult = null; // Also represents an accepted relation excluded by deletedAt filters.
    assert.equal(await areUsersConnected(alice, deleted), false);
    const callsBeforeInvalidId = connectionArgs.length;
    assert.equal(await areUsersConnected("invalid", bob), false);
    assert.equal(connectionArgs.length, callsBeforeInvalidId);
  });

  it("returns unique valid users in one query and excludes soft-deleted users", async () => {
    const active = { id: alice, fullName: "Alice", deletedAt: null };
    const softDeleted = { id: deleted, fullName: "Deleted", deletedAt: new Date() };
    users = [active, softDeleted];
    assert.deepEqual(await getUsersByIds([alice, alice.toUpperCase(), deleted, "not-a-uuid"]), [active]);
    assert.equal(userArgs.length, 1);
    assert.deepEqual(userArgs[0], {
      where: { id: { in: [alice, deleted] }, deletedAt: null },
      select: {
        id: true, fullName: true, role: true, photoUrl: true,
        companyName: true, companyLogoUrl: true, isOnline: true, lastSeen: true,
      },
    });
  });

  it("returns an empty list for empty or all-invalid ID input without querying", async () => {
    assert.deepEqual(await getUsersByIds([]), []);
    assert.deepEqual(await getUsersByIds(["bad", "also-bad"]), []);
    assert.equal(userArgs.length, 0);
  });
});
