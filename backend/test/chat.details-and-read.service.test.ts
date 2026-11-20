import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { join } from "node:path";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import prisma from "../src/config/postgres.js";
import Chat from "../src/modules/chat/models/Chat.js";
import Message from "../src/modules/chat/models/Message.js";
import { toChatDto } from "../src/modules/chat/services/chat.mapper.js";
import { getChatDetails, getMessages, getMyChats, markChatAsRead } from "../src/modules/chat/services/chat.service.js";

const alice = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";
const carol = "33333333-3333-4333-8333-333333333333";
const appError = (statusCode: number, message: string) => (error: unknown) =>
  (error as { statusCode?: number; message?: string }).statusCode === statusCode &&
  (error as { message?: string }).message === message;

describe("Chat details and read service with real MongoDB", () => {
  let server: MongoMemoryServer;
  const originals = { findFirst: prisma.connection.findFirst, findMany: prisma.user.findMany };
  let connected: boolean;
  let users: Array<Record<string, unknown>>;
  let connectionCalls: unknown[];
  let userCalls: unknown[];

  before(async () => {
    server = await MongoMemoryServer.create({
      binary: { downloadDir: join(process.cwd(), ".cache", "mongodb-binaries") },
      instance: { ip: "127.0.0.1" },
    });
    await mongoose.connect(server.getUri(), { dbName: "unilink-chat-details-read-tests" });
    await Promise.all([Chat.init(), Message.init()]);
    (prisma.connection as any).findFirst = async (...args: unknown[]) => {
      connectionCalls.push(args[0]);
      return connected ? { id: "accepted" } : null;
    };
    (prisma.user as any).findMany = async (...args: unknown[]) => {
      userCalls.push(args[0]);
      const query = args[0] as { where: { id: { in: string[] } } };
      return users.filter((user) => query.where.id.in.includes(String(user.id)));
    };
  });
  beforeEach(async () => {
    await Promise.all([Chat.deleteMany({}), Message.deleteMany({})]);
    connected = true;
    users = [{ id: alice, fullName: "Alice" }, { id: bob, fullName: "Bob" }, { id: carol, fullName: "Carol" }];
    connectionCalls = [];
    userCalls = [];
  });
  after(async () => {
    (prisma.connection as any).findFirst = originals.findFirst;
    (prisma.user as any).findMany = originals.findMany;
    await mongoose.disconnect();
    await server?.stop();
  });

  const makeChat = async () => Chat.create({ user_1_id: alice, user_2_id: bob });

  it("returns authorized details for either participant and makes one profile and connection call", async () => {
    const chat = await makeChat();
    for (const [id, other] of [[alice, bob], [bob, alice]]) {
      connectionCalls = [];
      userCalls = [];
      const details = await getChatDetails(id, String(chat._id));
      assert.equal(String(details.chat._id), String(chat._id));
      assert.equal(details.otherUser.id, other);
      assert.equal(details.canSend, true);
      assert.equal(userCalls.length, 1);
      assert.equal(connectionCalls.length, 1);
    }
  });
  it("normalizes the participant ID and passes cleaned IDs to the connection repository", async () => {
    const chat = await makeChat();
    await getChatDetails(` ${alice.toUpperCase()} `, String(chat._id));
    const query = connectionCalls[0] as any;
    assert.deepEqual(query.where.OR, [
      { requesterId: alice, receiverId: bob },
      { requesterId: bob, receiverId: alice },
    ]);
    assert.deepEqual(userCalls[0].where.id.in, [bob]);
  });
  it("disables sending after connection removal but keeps message reads available", async () => {
    const chat = await makeChat();
    await Message.create({ chat_id: chat._id, sender_id: bob, content: "still readable" });
    connected = false;
    const details = await getChatDetails(alice, String(chat._id));
    assert.equal(details.canSend, false);
    assert.equal((await getMessages(alice, String(chat._id))).messages[0].content, "still readable");
  });
  it("uses a deleted-user placeholder and disables sending", async () => {
    const chat = await makeChat();
    users = [{ id: alice }];
    const details = await getChatDetails(alice, String(chat._id));
    assert.deepEqual(details.otherUser, { id: bob, deleted: true });
    assert.equal(details.canSend, false);
  });
  it("returns an identical 404 for nonparticipants and missing chats, and 400 for malformed IDs", async () => {
    const chat = await makeChat();
    const missing = new mongoose.Types.ObjectId().toString();
    const failure = async (chatId: string) => {
      try { await getChatDetails(carol, chatId); } catch (error) { return error as { statusCode: number; message: string }; }
      assert.fail("Expected getChatDetails to reject");
    };
    const forbidden = await failure(String(chat._id));
    const absent = await failure(missing);
    assert.deepEqual([forbidden.statusCode, forbidden.message], [404, "Chat not found"]);
    assert.deepEqual([absent.statusCode, absent.message], [forbidden.statusCode, forbidden.message]);
    await assert.rejects(getChatDetails(alice, "bad"), appError(400, "Invalid chat ID"));
    assert.equal(connectionCalls.length, 0);
    assert.equal(userCalls.length, 0);
  });
  it("marks only unread messages from the other participant in this chat", async () => {
    const chat = await makeChat();
    const otherUnread = await Message.create({ chat_id: chat._id, sender_id: bob, content: "incoming" });
    const ownUnread = await Message.create({ chat_id: chat._id, sender_id: alice, content: "own" });
    const otherRead = await Message.create({ chat_id: chat._id, sender_id: bob, content: "already read", is_read: true });
    const elsewhere = await Chat.create({ user_1_id: alice, user_2_id: carol });
    const otherChatMessage = await Message.create({ chat_id: elsewhere._id, sender_id: bob, content: "other chat" });
    const result = await markChatAsRead(alice, String(chat._id));
    assert.deepEqual(result, { updated: 1, otherUserId: bob });
    const reloaded = await Promise.all([otherUnread, ownUnread, otherRead, otherChatMessage].map((m) => Message.findById(m._id).lean()));
    assert.equal(reloaded[0]?.is_read, true);
    assert.ok(reloaded[0]?.read_at instanceof Date);
    assert.equal(reloaded[1]?.is_read, false);
    assert.equal(reloaded[1]?.read_at, null);
    assert.equal(reloaded[2]?.is_read, true);
    assert.equal(reloaded[3]?.is_read, false);
  });
  it("returns the other participant for either caller and is idempotent", async () => {
    const chat = await makeChat();
    await Message.create([
      { chat_id: chat._id, sender_id: bob, content: "to alice" },
      { chat_id: chat._id, sender_id: alice, content: "to bob" },
    ]);
    assert.deepEqual(await markChatAsRead(alice, String(chat._id)), { updated: 1, otherUserId: bob });
    assert.deepEqual(await markChatAsRead(alice, String(chat._id)), { updated: 0, otherUserId: bob });
    assert.deepEqual(await markChatAsRead(bob, String(chat._id)), { updated: 1, otherUserId: alice });
  });
  it("does not update anything for a nonparticipant and rejects malformed IDs", async () => {
    const chat = await makeChat();
    const unread = await Message.create({ chat_id: chat._id, sender_id: bob, content: "unread" });
    await assert.rejects(markChatAsRead(carol, String(chat._id)), appError(404, "Chat not found"));
    await assert.rejects(markChatAsRead(alice, "bad"), appError(400, "Invalid chat ID"));
    assert.equal((await Message.findById(unread._id).lean())?.is_read, false);
  });
  it("keeps chat DTO fields safe from overriding extras", async () => {
    const chat = await makeChat();
    const actualOther = { id: bob, fullName: "Bob" };
    const dto = toChatDto(chat.toObject() as any, actualOther, {
      id: "spoofed",
      otherUser: { id: carol },
      unreadCount: 4,
    });
    assert.equal(dto.id, String(chat._id));
    assert.equal(dto.otherUser, actualOther);
    assert.equal(dto.unreadCount, 4);
  });
  it("keeps getMyChats core output keys and does not expose Mongo fields", async () => {
    const chat = await makeChat();
    const [dto] = await getMyChats(alice);
    assert.deepEqual(Object.keys(dto).sort(), ["id", "otherUser", "lastMessage", "lastMessageAt", "unreadCount"].sort());
    assert.equal(dto.lastMessage, null);
    for (const key of ["_id", "__v", "user_1_id", "user_2_id", "last_message", "last_message_at"]) {
      assert.equal(key in dto, false, `unexpected raw field: ${key}`);
    }
    assert.equal(dto.id, String(chat._id));
  });
});
