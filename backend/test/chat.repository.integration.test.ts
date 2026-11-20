import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { join } from "node:path";
import mongoose, { Types } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import Chat from "../src/modules/chat/models/Chat.js";
import Message from "../src/modules/chat/models/Message.js";
import * as repo from "../src/modules/chat/repositories/chat.repository.js";

describe("Chat repository with real MongoDB", () => {
  let server: MongoMemoryServer;

  before(async () => {
    server = await MongoMemoryServer.create({
      binary: { downloadDir: join(process.cwd(), ".cache", "mongodb-binaries") },
      instance: { ip: "127.0.0.1" },
    });
    await mongoose.connect(server.getUri(), { dbName: "unilink-chat-repository-tests" });
    await Promise.all([Chat.init(), Message.init()]);
  });

  beforeEach(async () => {
    await Promise.all([Chat.deleteMany({}), Message.deleteMany({})]);
  });

  after(async () => {
    await mongoose.disconnect();
    await server?.stop();
  });

  it("creates a chat and reuses it for the same or reversed participant order", async () => {
    const created = await repo.createChat("zed", "Alice");
    assert.ok(created);
    assert.equal(created.user_1_id, "alice");
    assert.equal(created.user_2_id, "zed");

    const sameOrder = await repo.createChat("zed", "alice");
    const reversed = await repo.createChat("ALICE", "ZED");
    assert.equal(String(sameOrder?._id), String(created._id));
    assert.equal(String(reversed?._id), String(created._id));
    assert.equal(await Chat.countDocuments(), 1);
  });

  it("keeps one chat for concurrent create requests", async () => {
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        i % 2 === 0 ? repo.createChat("alice", "bob") : repo.createChat("bob", "alice")
      )
    );
    assert.ok(results.every(Boolean));
    assert.equal(new Set(results.map((chat) => String(chat?._id))).size, 1);
    assert.equal(await Chat.countDocuments(), 1);
  });

  it("enforces the unique participant index through direct inserts", async () => {
    await Chat.create({ user_1_id: "alice", user_2_id: "bob" });
    await assert.rejects(
      Chat.collection.insertOne({ user_1_id: "alice", user_2_id: "bob" }),
      (error: unknown) => (error as { code?: number }).code === 11000
    );
    assert.equal(await Chat.countDocuments(), 1);
  });

  it("finds valid IDs and participant pairs, and returns null for invalid or missing IDs", async () => {
    const chat = await repo.createChat("alice", "bob");
    assert.ok(chat);
    const byId = await repo.findChatById(String(chat._id));
    assert.equal(String(byId?._id), String(chat._id));
    assert.equal(await repo.findChatById("not-an-object-id"), null);
    assert.equal(await repo.findChatById(new Types.ObjectId().toString()), null);
    assert.equal(String((await repo.findChatBetweenUsers("BOB", "alice"))?._id), String(chat._id));
    assert.equal(await repo.findChatBetweenUsers("alice", "carol"), null);
  });

  it("returns only a user's chats sorted by last activity", async () => {
    const older = await repo.createChat("alice", "bob");
    const newer = await repo.createChat("carol", "alice");
    await repo.createChat("dave", "erin");
    assert.ok(older && newer);
    await Chat.updateOne({ _id: older._id }, { $set: { last_message_at: new Date(1_000) } });
    await Chat.updateOne({ _id: newer._id }, { $set: { last_message_at: new Date(2_000) } });

    const chats = await repo.getUserChats("ALICE");
    assert.deepEqual(chats.map((chat) => String(chat._id)), [String(newer._id), String(older._id)]);
  });

  it("creates messages, trims fields, and returns the original on client ID retries", async () => {
    const chat = await repo.createChat("alice", "bob");
    assert.ok(chat);
    const first = await repo.createMessage(String(chat._id), " ALICE ", " hello ", " retry-1 ");
    const retry = await repo.createMessage(String(chat._id), "alice", "different payload", "retry-1");
    assert.equal(first.created, true);
    assert.equal(first.message.content, "hello");
    assert.equal(first.message.sender_id, "alice");
    assert.equal(first.message.client_message_id, "retry-1");
    assert.equal(retry.created, false);
    assert.equal(String(retry.message._id), String(first.message._id));
    assert.equal(await Message.countDocuments(), 1);
  });

  it("deduplicates concurrent message submissions using the unique partial index", async () => {
    const chat = await repo.createChat("alice", "bob");
    assert.ok(chat);
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        repo.createMessage(String(chat._id), "alice", "hello", "same-client-id")
      )
    );
    assert.equal(results.filter((result) => result.created).length, 1);
    assert.equal(new Set(results.map((result) => String(result.message._id))).size, 1);
    assert.equal(await Message.countDocuments(), 1);
  });

  it("enforces the client message ID index and allows multiple messages without client IDs", async () => {
    const chat = await repo.createChat("alice", "bob");
    assert.ok(chat);
    const chatId = new Types.ObjectId(String(chat._id));
    await Message.create({ chat_id: chatId, sender_id: "alice", content: "first", client_message_id: "same" });
    await assert.rejects(
      Message.create({ chat_id: chatId, sender_id: "alice", content: "duplicate", client_message_id: "same" }),
      (error: unknown) => (error as { code?: number }).code === 11000
    );
    await Message.create({ chat_id: chatId, sender_id: "alice", content: "no id one" });
    await Message.create({ chat_id: chatId, sender_id: "alice", content: "no id two" });
    assert.equal(await Message.countDocuments(), 3);
  });

  it("rejects malformed chat IDs and invalid message content", async () => {
    await assert.rejects(repo.createMessage("bad-id", "alice", "hello"), /Invalid chat ID/);
    const chat = await repo.createChat("alice", "bob");
    assert.ok(chat);
    await assert.rejects(repo.createMessage(String(chat._id), "alice", "   "));
    await assert.rejects(repo.createMessage(String(chat._id), "alice", "x".repeat(2_001)));
  });

  it("paginates newest first without duplicates or omissions and validates cursors", async () => {
    const chat = await repo.createChat("alice", "bob");
    assert.ok(chat);
    for (let index = 1; index <= 5; index += 1) {
      const message = await Message.create({
        chat_id: chat._id,
        sender_id: "alice",
        content: `message ${index}`,
        created_at: new Date(index * 1_000),
      });
      assert.ok(message._id);
    }

    const page1 = await repo.getChatMessages(String(chat._id), { limit: 2 });
    const page2 = await repo.getChatMessages(String(chat._id), { limit: 2, cursor: page1.nextCursor! });
    const page3 = await repo.getChatMessages(String(chat._id), { limit: 2, cursor: page2.nextCursor! });
    const ids = [...page1.messages, ...page2.messages, ...page3.messages].map((message) => String(message._id));
    assert.deepEqual([...page1.messages, ...page2.messages, ...page3.messages].map((message) => message.content), [
      "message 5", "message 4", "message 3", "message 2", "message 1",
    ]);
    assert.equal(new Set(ids).size, 5);
    assert.equal(page1.nextCursor !== null, true);
    assert.equal(page2.nextCursor !== null, true);
    assert.equal(page3.nextCursor, null);
    assert.equal((await repo.getChatMessages(String(chat._id), { limit: 0 })).messages.length, 0);
    await assert.rejects(repo.getChatMessages(String(chat._id), { cursor: "bad-cursor" }), /Invalid cursor/);
  });

  it("updates only the intended chat preview and does not move it backward", async () => {
    const target = await repo.createChat("alice", "bob");
    const unrelated = await repo.createChat("carol", "dave");
    assert.ok(target && unrelated);
    await Chat.updateOne({ _id: target._id }, { $set: { last_message_at: null } });
    assert.equal(await repo.updateLastMessage(String(target._id), "latest", "alice", new Date(2_000)), true);
    assert.equal(await repo.updateLastMessage(String(target._id), "older", "bob", new Date(1_000)), false);
    const stored = await Chat.findById(target._id).lean();
    const untouched = await Chat.findById(unrelated._id).lean();
    assert.equal(stored?.last_message, "latest");
    assert.equal(stored?.last_message_sender_id, "alice");
    assert.equal(stored?.last_message_at?.getTime(), 2_000);
    assert.equal(untouched?.last_message, null);
    await assert.rejects(repo.updateLastMessage(new Types.ObjectId().toString(), "x", "alice", new Date()), /Chat not found/);
  });

  it("marks only unread messages from the designated other participant as read", async () => {
    const chat = await repo.createChat("alice", "bob");
    assert.ok(chat);
    const incoming = await Message.create({ chat_id: chat._id, sender_id: "bob", content: "incoming" });
    const own = await Message.create({ chat_id: chat._id, sender_id: "alice", content: "own" });
    const alreadyRead = await Message.create({ chat_id: chat._id, sender_id: "bob", content: "read", is_read: true });
    assert.equal(await repo.markMessagesAsRead(String(chat._id), "bob"), 1);
    assert.equal((await Message.findById(incoming._id).lean())?.is_read, true);
    assert.equal((await Message.findById(own._id).lean())?.is_read, false);
    assert.equal((await Message.findById(alreadyRead._id).lean())?.is_read, true);
    assert.equal(await repo.markMessagesAsRead(new Types.ObjectId().toString(), "bob"), 0);
  });

  it("initializes the repository indexes with the required key and uniqueness options", async () => {
    const chatIndexes = await Chat.collection.indexes();
    const messageIndexes = await Message.collection.indexes();

    assert.ok(chatIndexes.some((index) => index.unique === true && index.key.user_1_id === 1 && index.key.user_2_id === 1));
    assert.ok(messageIndexes.some((index) => index.key.chat_id === 1 && index.key.created_at === -1 && index.key._id === -1));
    assert.ok(messageIndexes.some((index) => index.key.chat_id === 1 && index.key.sender_id === 1 && index.key.is_read === 1));
    assert.ok(messageIndexes.some((index) =>
      index.unique === true && index.key.chat_id === 1 && index.key.sender_id === 1 &&
      index.key.client_message_id === 1 && index.partialFilterExpression?.client_message_id?.$type === "string"
    ));
  });
});
