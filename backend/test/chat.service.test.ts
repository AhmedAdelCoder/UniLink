import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { join } from "node:path";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import prisma from "../src/config/postgres.js";
import Chat from "../src/modules/chat/models/Chat.js";
import Message from "../src/modules/chat/models/Message.js";
import { createOrGetChat, getMyChats } from "../src/modules/chat/services/chat.service.js";

const me = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";
const carol = "33333333-3333-4333-8333-333333333333";

describe("Chat service with real MongoDB", () => {
  let server: MongoMemoryServer;
  const originals = { findFirst: prisma.connection.findFirst, findMany: prisma.user.findMany };
  let connection: unknown;
  let users: Array<Record<string, unknown>>;
  let connectionCalls: unknown[];
  let userCalls: unknown[];

  before(async () => {
    server = await MongoMemoryServer.create({
      binary: { downloadDir: join(process.cwd(), ".cache", "mongodb-binaries") },
      instance: { ip: "127.0.0.1" },
    });
    await mongoose.connect(server.getUri(), { dbName: "unilink-chat-service-tests" });
    await Promise.all([Chat.init(), Message.init()]);
    (prisma.connection as any).findFirst = async (...args: unknown[]) => {
      connectionCalls.push(args[0]);
      return connection;
    };
    (prisma.user as any).findMany = async (...args: unknown[]) => {
      userCalls.push(args[0]);
      const query = args[0] as { where: { id: { in: string[] } } };
      return users.filter((user) => query.where.id.in.includes(String(user.id)));
    };
  });
  beforeEach(async () => {
    await Promise.all([Chat.deleteMany({}), Message.deleteMany({})]);
    connection = { id: "connection" };
    users = [
      { id: me, fullName: "Me" },
      { id: bob, fullName: "Bob" },
      { id: carol, fullName: "Carol" },
    ];
    connectionCalls = [];
    userCalls = [];
  });
  after(async () => {
    (prisma.connection as any).findFirst = originals.findFirst;
    (prisma.user as any).findMany = originals.findMany;
    await mongoose.disconnect();
    await server?.stop();
  });

  it("rejects malformed and self IDs before a query", async () => {
    await assert.rejects(createOrGetChat(me, "bad"), { statusCode: 400 });
    await assert.rejects(createOrGetChat(me, ` ${me.toUpperCase()} `), { statusCode: 400 });
    assert.equal(userCalls.length, 0);
    assert.equal(connectionCalls.length, 0);
    assert.equal(await Chat.countDocuments(), 0);
  });
  it("rejects absent or soft-deleted users and unconnected users without creating chats", async () => {
    users = [];
    await assert.rejects(createOrGetChat(me, bob), { statusCode: 404 });
    users = [{ id: me }, { id: bob }];
    connection = null;
    await assert.rejects(createOrGetChat(me, bob), { statusCode: 403 });
    assert.equal(await Chat.countDocuments(), 0);
  });
  it("cleans IDs, checks connectivity with cleaned values, and creates one ordered chat", async () => {
    const result = await createOrGetChat(` ${me.toUpperCase()} `, ` ${bob.toUpperCase()} `);
    assert.equal(result.otherUser.id, bob);
    assert.deepEqual(connectionCalls[0], {
      where: {
        status: "accepted", requester: { deletedAt: null }, receiver: { deletedAt: null },
        OR: [{ requesterId: me, receiverId: bob }, { requesterId: bob, receiverId: me }],
      },
      select: { id: true },
    });
    assert.equal(result.chat.user_1_id, me);
    assert.equal(result.chat.user_2_id, bob);
    const reverse = await createOrGetChat(bob, me);
    assert.equal(String(reverse.chat._id), String(result.chat._id));
    assert.equal(await Chat.countDocuments(), 1);
  });
  it("keeps one chat under 20 concurrent calls in both argument orders", async () => {
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) =>
      i % 2 ? createOrGetChat(me, bob) : createOrGetChat(bob, me)));
    assert.equal(new Set(results.map((result) => String(result.chat._id))).size, 1);
    assert.equal(await Chat.countDocuments(), 1);
  });

  it("returns no chats without profile or unread lookups", async () => {
    assert.deepEqual(await getMyChats(me), []);
    assert.equal(userCalls.length, 0);
  });
  it("maps chats, deduplicates profile IDs, and calculates only incoming unread counts", async () => {
    const first = await Chat.create({ user_1_id: me, user_2_id: bob, last_message_at: new Date(1000) });
    const second = await Chat.create({ user_1_id: carol, user_2_id: me, last_message_at: new Date(2000) });
    const otherChat = await Chat.create({ user_1_id: bob, user_2_id: carol, last_message_at: new Date(3000) });
    await Message.create([
      { chat_id: first._id, sender_id: bob, content: "incoming" },
      { chat_id: first._id, sender_id: me, content: "own" },
      { chat_id: first._id, sender_id: bob, content: "read", is_read: true },
      { chat_id: second._id, sender_id: carol, content: "incoming" },
    ]);
    await Chat.updateOne({ _id: first._id }, { last_message: "preview", last_message_sender_id: bob });
    const result = await getMyChats(me);
    assert.deepEqual(result.map((item) => item.id), [String(second._id), String(first._id)]);
    assert.deepEqual(userCalls, [{
      where: { id: { in: [carol, bob] }, deletedAt: null },
      select: { id: true, fullName: true, role: true, photoUrl: true, companyName: true, companyLogoUrl: true, isOnline: true, lastSeen: true },
    }]);
    assert.equal(result[0].otherUser.id, carol);
    assert.equal(result[0].unreadCount, 1);
    assert.equal(result[0].lastMessage, null);
    assert.equal(result[1].otherUser.id, bob);
    assert.equal(result[1].unreadCount, 1);
    assert.deepEqual(result[1].lastMessage, { content: "preview", senderId: bob, createdAt: result[1].lastMessageAt });
    assert.equal(result.some((item) => item.id === String(otherChat._id)), false);
  });
  it("keeps chats with deleted users using a placeholder", async () => {
    users = [{ id: me }];
    await Chat.create({ user_1_id: me, user_2_id: bob });
    assert.deepEqual((await getMyChats(me))[0].otherUser, { id: bob, deleted: true });
  });
  it("orders equal timestamps by descending _id", async () => {
    const a = await Chat.create({ user_1_id: me, user_2_id: bob, last_message_at: new Date(5) });
    const b = await Chat.create({ user_1_id: me, user_2_id: carol, last_message_at: new Date(5) });
    const result = await getMyChats(me);
    assert.deepEqual(result.map((item) => item.id), [String(b._id), String(a._id)]);
  });
  it("defaults invalid limits to 30 and caps large limits at 50", async () => {
    for (let i = 0; i < 60; i++) {
      await Chat.create({ user_1_id: me, user_2_id: `user-${String(i).padStart(3, "0")}` });
    }
    assert.equal((await getMyChats(me)).length, 30);
    assert.equal((await getMyChats(me, 1e9)).length, 50);
    for (const limit of [0, -1, Number.NaN]) assert.equal((await getMyChats(me, limit)).length, 30);
  });
});
