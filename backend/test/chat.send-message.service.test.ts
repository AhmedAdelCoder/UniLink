import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { join } from "node:path";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import prisma from "../src/config/postgres.js";
import Chat from "../src/modules/chat/models/Chat.js";
import Message from "../src/modules/chat/models/Message.js";
import { getUnreadCounts } from "../src/modules/chat/repositories/chat.repository.js";
import { sendMessage } from "../src/modules/chat/services/chat.service.js";

const alice = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";
const carol = "33333333-3333-4333-8333-333333333333";
const expectedKeys = ["id", "chatId", "senderId", "content", "clientMessageId", "isRead", "readAt", "createdAt"];
const appError = (statusCode: number, message: string) => (error: unknown) =>
  (error as { statusCode?: number; message?: string }).statusCode === statusCode &&
  (error as { message?: string }).message === message;

describe("Send message service with real MongoDB", () => {
  let server: MongoMemoryServer;
  const originalFindFirst = prisma.connection.findFirst;
  const originalUserFindMany = prisma.user.findMany;
  let connected: boolean;
  let connectionCalls: unknown[];
  let missingUserIds = new Set<string>();
  let softDeletedUserIds = new Set<string>();

  before(async () => {
    server = await MongoMemoryServer.create({
      binary: { downloadDir: join(process.cwd(), ".cache", "mongodb-binaries") },
      instance: { ip: "127.0.0.1" },
    });
    await mongoose.connect(server.getUri(), { dbName: "unilink-chat-send-message-tests" });
    await Promise.all([Chat.init(), Message.init()]);
    (prisma.connection as any).findFirst = async (...args: unknown[]) => {
      connectionCalls.push(args[0]);
      return connected ? { id: "accepted" } : null;
    };
    (prisma.user as any).findMany = async (args: any) =>
      args.where.id.in.filter((id: string) => !missingUserIds.has(id) && !softDeletedUserIds.has(id)).map((id: string) => ({ id }));
  });
  beforeEach(async () => {
    await Promise.all([Chat.deleteMany({}), Message.deleteMany({})]);
    connected = true;
    connectionCalls = [];
    missingUserIds = new Set();
    softDeletedUserIds = new Set();
  });
  after(async () => {
    (prisma.connection as any).findFirst = originalFindFirst;
    (prisma.user as any).findMany = originalUserFindMany;
    await mongoose.disconnect();
    await server?.stop();
  });

  const makeChat = async () => {
    const chat = await Chat.create({ user_1_id: alice, user_2_id: bob });
    return chat;
  };

  it("sends from either participant and returns the exact DTO", async () => {
    const chat = await makeChat();
    for (const [sender, recipient] of [[alice, bob], [bob, alice]]) {
      const result = await sendMessage(sender, String(chat._id), { content: " hello ", clientMessageId: " c1 " });
      assert.equal(result.created, true);
      assert.equal(result.recipientId, recipient);
      assert.deepEqual(Object.keys(result.message), expectedKeys);
      assert.equal(result.message.senderId, sender);
      assert.equal(result.message.content, "hello");
      assert.equal(typeof result.message.id, "string");
      assert.equal(typeof result.message.chatId, "string");
      assert.equal((await Message.findById(result.message.id).lean())?.sender_id, sender);
    }
    assert.deepEqual(connectionCalls.map((arg: any) => arg.where.OR), [
      [{ requesterId: alice, receiverId: bob }, { requesterId: bob, receiverId: alice }],
      [{ requesterId: bob, receiverId: alice }, { requesterId: alice, receiverId: bob }],
    ]);
  });
  it("updates the chat preview to the saved message", async () => {
    const chat = await makeChat();
    const result = await sendMessage(alice, String(chat._id), { content: "preview text" });
    const stored = await Chat.findById(chat._id).lean();
    assert.equal(stored?.last_message, "preview text");
    assert.equal(stored?.last_message_sender_id, alice);
    assert.equal(stored?.last_message_at?.getTime(), result.message.createdAt.getTime());
  });
  it("truncates previews to 100 Unicode code points", async () => {
    const chat = await makeChat();
    const content = `${"x".repeat(97)}🙂عربي tail`;
    await sendMessage(alice, String(chat._id), { content });
    const stored = await Chat.findById(chat._id).lean();
    assert.equal(Array.from(stored?.last_message ?? "").length, 100);
    assert.equal(stored?.last_message, Array.from(content).slice(0, 100).join(""));
  });
  it("counts recipient unread messages and excludes the sender's own messages", async () => {
    const chat = await makeChat();
    await sendMessage(alice, String(chat._id), { content: "incoming" });
    assert.equal((await getUnreadCounts(bob, [String(chat._id)])).get(String(chat._id)), 1);
    assert.equal((await getUnreadCounts(alice, [String(chat._id)])).get(String(chat._id)) ?? 0, 0);
  });
  it("trims message content before saving", async () => {
    const chat = await makeChat();
    const result = await sendMessage(alice, String(chat._id), { content: "  text  " });
    assert.equal(result.message.content, "text");
    assert.equal((await Message.findById(result.message.id).lean())?.content, "text");
  });
  it("authorizes before content validation and does not check the connection for a nonparticipant", async () => {
    const chat = await makeChat();
    await assert.rejects(sendMessage(carol, String(chat._id), { content: 7 }), appError(404, "Chat not found"));
    assert.equal(connectionCalls.length, 0);
    assert.equal(await Message.countDocuments(), 0);
  });
  it("returns expected errors for a nonexistent or malformed chat", async () => {
    await assert.rejects(sendMessage(alice, new mongoose.Types.ObjectId().toString(), { content: "hi" }), appError(404, "Chat not found"));
    await assert.rejects(sendMessage(alice, "bad", { content: "hi" }), appError(400, "Invalid chat ID"));
    assert.equal(connectionCalls.length, 0);
  });
  it("rejects disconnected users without saving or changing the preview", async () => {
    const chat = await makeChat();
    connected = false;
    await assert.rejects(sendMessage(alice, String(chat._id), { content: "no" }), appError(403, "You can only message your accepted connections"));
    assert.equal(await Message.countDocuments(), 0);
    const stored = await Chat.findById(chat._id).lean();
    assert.equal(stored?.last_message, null);
    assert.equal(stored?.last_message_at, null);
  });
  it("rejects missing or soft-deleted recipients before querying connection state", async () => {
    const chat = await makeChat();
    for (const inactiveUsers of [missingUserIds, softDeletedUserIds]) {
      inactiveUsers.add(bob);
      await assert.rejects(sendMessage(alice, String(chat._id), { content: "must not send" }), appError(403, "You can only message your accepted connections"));
      inactiveUsers.delete(bob);
    }
    assert.equal(connectionCalls.length, 0);
    assert.equal(await Message.countDocuments(), 0);
    const stored = await Chat.findById(chat._id).lean();
    assert.equal(stored?.last_message, null);
  });
  it("rejects invalid content before checking connection and enforces the 2000-unit limit", async () => {
    const chat = await makeChat();
    for (const content of ["", "  ", 123, null, undefined, {}, []]) {
      await assert.rejects(sendMessage(alice, String(chat._id), { content }), appError(400, "Invalid message content"));
    }
    await assert.rejects(sendMessage(alice, String(chat._id), { content: "x".repeat(2_001) }), appError(400, "Invalid message content"));
    await assert.rejects(sendMessage(alice, String(chat._id), { content: "🙂".repeat(1_001) }), appError(400, "Invalid message content"));
    assert.equal(connectionCalls.length, 0);
    assert.equal(await Message.countDocuments(), 0);
    const result = await sendMessage(alice, String(chat._id), { content: "x".repeat(2_000) });
    assert.equal(result.message.content.length, 2_000);
  });
  it("validates client message IDs and accepts nullish or 64-character IDs", async () => {
    const chat = await makeChat();
    for (const clientMessageId of ["  ", 12, "x".repeat(65)]) {
      await assert.rejects(sendMessage(alice, String(chat._id), { content: "hi", clientMessageId }), appError(400, "Invalid client message ID"));
    }
    assert.equal(connectionCalls.length, 0);
    for (const clientMessageId of [undefined, null, "x".repeat(64)]) {
      const result = await sendMessage(alice, String(chat._id), { content: "hi", clientMessageId });
      assert.equal(result.created, true);
    }
  });
  it("reuses a message on retry and keeps the preview correct", async () => {
    const chat = await makeChat();
    const first = await sendMessage(alice, String(chat._id), { content: "retry payload", clientMessageId: "retry" });
    const second = await sendMessage(alice, String(chat._id), { content: "different retry payload", clientMessageId: "retry" });
    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(second.message.id, first.message.id);
    assert.equal(await Message.countDocuments(), 1);
    const stored = await Chat.findById(chat._id).lean();
    assert.equal(stored?.last_message, "retry payload");
    assert.equal(stored?.last_message_sender_id, alice);
  });
  it("repairs a missing chat preview on an idempotent retry", async () => {
    const chat = await makeChat();
    const repo = await import("../src/modules/chat/repositories/chat.repository.js");
    const saved = await repo.createMessage(String(chat._id), alice, "previously saved", "repair");
    assert.equal((await Chat.findById(chat._id).lean())?.last_message, null);
    const result = await sendMessage(alice, String(chat._id), { content: "ignored on retry", clientMessageId: "repair" });
    assert.equal(result.created, false);
    assert.equal(result.message.id, String(saved.message._id));
    assert.equal((await Chat.findById(chat._id).lean())?.last_message, "previously saved");
  });
  it("deduplicates ten concurrent sends with one client message ID", async () => {
    const chat = await makeChat();
    const results = await Promise.all(Array.from({ length: 10 }, () =>
      sendMessage(alice, String(chat._id), { content: "concurrent", clientMessageId: "same-id" })));
    assert.equal(results.filter((result) => result.created).length, 1);
    assert.equal(new Set(results.map((result) => result.message.id)).size, 1);
    assert.equal(await Message.countDocuments(), 1);
  });
  it("keeps the preview at the newest concurrent message from both users", async () => {
    const chat = await makeChat();
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) =>
      sendMessage(i % 2 ? alice : bob, String(chat._id), { content: `message-${i}` })));
    const messages = await Message.find({ chat_id: chat._id }).sort({ created_at: -1, _id: -1 }).lean();
    const stored = await Chat.findById(chat._id).lean();
    assert.equal(messages.length, 12);
    assert.equal(stored?.last_message_at?.getTime(), messages[0].created_at.getTime());
    assert.equal(stored?.last_message, messages[0].content);
    assert.ok(results.every((result) => result.message.chatId === String(chat._id)));
  });
  it("continues successfully and logs when preview update throws", async () => {
    const chat = await makeChat();
    const originalUpdateOne = Chat.updateOne;
    const originalError = console.error;
    const errors: unknown[][] = [];
    (Chat as any).updateOne = async () => { throw new Error("preview update failed"); };
    console.error = (...args: unknown[]) => { errors.push(args); };
    try {
      const result = await sendMessage(alice, String(chat._id), { content: "persisted", clientMessageId: "logged" });
      assert.equal(result.created, true);
      assert.equal(await Message.countDocuments(), 1);
      assert.equal(errors.length, 1);
      assert.match(String(errors[0][0]), new RegExp(String(chat._id)));
      assert.match(String(errors[0][0]), new RegExp(result.message.id));
    } finally {
      (Chat as any).updateOne = originalUpdateOne;
      console.error = originalError;
    }
  });
  it("always uses the authenticated sender and permits the same client ID for different senders", async () => {
    const chat = await makeChat();
    const first = await sendMessage(alice, String(chat._id), { content: "from alice", clientMessageId: "shared" });
    const second = await sendMessage(bob, String(chat._id), { content: "from bob", clientMessageId: "shared" });
    assert.equal(first.message.senderId, alice);
    assert.equal(second.message.senderId, bob);
    assert.equal(await Message.countDocuments(), 2);
    assert.deepEqual((await Message.find({ chat_id: chat._id }).sort({ sender_id: 1 }).lean()).map((message) => message.sender_id), [alice, bob]);
  });
});
