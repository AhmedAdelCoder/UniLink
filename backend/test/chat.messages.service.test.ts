import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { join } from "node:path";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import Chat from "../src/modules/chat/models/Chat.js";
import Message from "../src/modules/chat/models/Message.js";
import { getMessages } from "../src/modules/chat/services/chat.service.js";

const alice = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";
const carol = "33333333-3333-4333-8333-333333333333";
const badRequest = (statusCode: number, message: string) => (error: unknown) =>
  (error as { statusCode?: number; message?: string }).statusCode === statusCode &&
  (error as { message?: string }).message === message;
const cursorFor = (value: string) => Buffer.from(value).toString("base64url");

describe("Get messages service with real MongoDB", () => {
  let server: MongoMemoryServer;

  before(async () => {
    server = await MongoMemoryServer.create({
      binary: { downloadDir: join(process.cwd(), ".cache", "mongodb-binaries") },
      instance: { ip: "127.0.0.1" },
    });
    await mongoose.connect(server.getUri(), { dbName: "unilink-chat-messages-service-tests" });
    await Promise.all([Chat.init(), Message.init()]);
  });
  beforeEach(async () => {
    await Promise.all([Chat.deleteMany({}), Message.deleteMany({})]);
  });
  after(async () => {
    await mongoose.disconnect();
    await server?.stop();
  });

  const makeChat = async (a = alice, b = bob) => {
    const chat = await Chat.create({ user_1_id: a, user_2_id: b });
    return String(chat._id);
  };
  const addMessages = async (chatId: string, count: number, createdAt = (i: number) => new Date(i * 1_000)) => {
    const ids: string[] = [];
    for (let i = 1; i <= count; i++) {
      const message = await Message.create({
        chat_id: new mongoose.Types.ObjectId(chatId),
        sender_id: i % 2 ? alice : bob,
        content: `message-${i}`,
        client_message_id: `client-${i}`,
        created_at: createdAt(i),
      });
      ids.push(String(message._id));
    }
    return ids;
  };

  it("authorizes either participant and returns newest first", async () => {
    const chatId = await makeChat();
    await addMessages(chatId, 3);
    for (const userId of [alice, bob]) {
      const page = await getMessages(userId, chatId);
      assert.deepEqual(page.messages.map((message) => message.content), ["message-3", "message-2", "message-1"]);
    }
  });
  it("returns the same 404 for a nonparticipant and a missing chat", async () => {
    const chatId = await makeChat();
    await Message.create({ chat_id: new mongoose.Types.ObjectId(chatId), sender_id: alice, content: "secret" });
    const missingId = new mongoose.Types.ObjectId().toString();
    const getError = async (id: string) => {
      try { await getMessages(carol, id); } catch (error) { return error as { statusCode: number; message: string }; }
      assert.fail("Expected getMessages to reject");
    };
    const denied = await getError(chatId);
    const missing = await getError(missingId);
    assert.deepEqual([denied.statusCode, denied.message], [404, "Chat not found"]);
    assert.deepEqual([missing.statusCode, missing.message], [denied.statusCode, denied.message]);
  });
  it("rejects malformed and empty chat IDs with 400", async () => {
    for (const id of ["invalid", ""]) {
      await assert.rejects(getMessages(alice, id), badRequest(400, "Invalid chat ID"));
    }
  });
  it("normalizes a whitespace-padded uppercase participant ID", async () => {
    const chatId = await makeChat();
    await addMessages(chatId, 1);
    assert.equal((await getMessages(` ${alice.toUpperCase()} `, chatId)).messages[0].content, "message-1");
  });
  it("paginates consecutive pages without omissions or duplicates", async () => {
    const chatId = await makeChat();
    await addMessages(chatId, 7);
    const first = await getMessages(alice, chatId, { limit: 3 });
    const second = await getMessages(alice, chatId, { limit: 3, cursor: first.nextCursor! });
    const third = await getMessages(alice, chatId, { limit: 3, cursor: second.nextCursor! });
    const ids = [...first.messages, ...second.messages, ...third.messages].map((message) => message.id);
    assert.deepEqual(ids.length, 7);
    assert.equal(new Set(ids).size, 7);
    assert.equal(third.nextCursor, null);
  });
  it("paginates messages with identical timestamps using the ObjectId tiebreaker", async () => {
    const chatId = await makeChat();
    const ids = await addMessages(chatId, 6, () => new Date(1234));
    const first = await getMessages(alice, chatId, { limit: 2 });
    const second = await getMessages(alice, chatId, { limit: 2, cursor: first.nextCursor! });
    const third = await getMessages(alice, chatId, { limit: 2, cursor: second.nextCursor! });
    const actual = [...first.messages, ...second.messages, ...third.messages].map((message) => message.id);
    assert.deepEqual(actual, [...ids].reverse());
    assert.equal(new Set(actual).size, ids.length);
    assert.equal(third.nextCursor, null);
  });
  it("caps the limit at 50, defaults invalid values to 30, and respects a valid limit", async () => {
    const chatId = await makeChat();
    await addMessages(chatId, 60);
    assert.equal((await getMessages(alice, chatId, { limit: 100 })).messages.length, 50);
    for (const limit of [0, -4, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.equal((await getMessages(alice, chatId, { limit })).messages.length, 30);
    }
    assert.equal((await getMessages(alice, chatId, { limit: 10 })).messages.length, 10);
  });
  it("converts malformed cursors into 400 Invalid cursor errors", async () => {
    const chatId = await makeChat();
    await addMessages(chatId, 1);
    const invalid = [
      "random-string",
      cursorFor("2026-01-01T00:00:00.000Z|0123456789abcdef01234567|extra"),
      cursorFor("2026-01-01T00:00:00.000Z|not-an-object-id"),
      cursorFor("not-a-date|0123456789abcdef01234567"),
    ];
    for (const cursor of invalid) {
      await assert.rejects(getMessages(alice, chatId, { cursor }), badRequest(400, "Invalid cursor"));
    }
  });
  it("scopes a cursor to its chat", async () => {
    const chatA = await makeChat(alice, bob);
    const chatB = await makeChat(alice, carol);
    await addMessages(chatA, 3);
    await addMessages(chatB, 2);
    const pageA = await getMessages(alice, chatA, { limit: 1 });
    const pageB = await getMessages(alice, chatB, { limit: 10, cursor: pageA.nextCursor! });
    assert.deepEqual(pageB.messages.map((message) => message.content), ["message-2", "message-1"]);
    assert.ok(pageB.messages.every((message) => message.chatId === chatB));
  });
  it("returns only the DTO keys and string identifiers", async () => {
    const chatId = await makeChat();
    await addMessages(chatId, 1);
    const message = (await getMessages(alice, chatId)).messages[0];
    assert.deepEqual(Object.keys(message), [
      "id", "chatId", "senderId", "content", "clientMessageId", "isRead", "readAt", "createdAt",
    ]);
    assert.equal(typeof message.id, "string");
    assert.equal(typeof message.chatId, "string");
    assert.equal("_id" in message, false);
    assert.equal("__v" in message, false);
    assert.equal("chat_id" in message, false);
    assert.equal("created_at" in message, false);
  });
  it("returns an empty page for a chat with no messages", async () => {
    const chatId = await makeChat();
    assert.deepEqual(await getMessages(alice, chatId), { messages: [], nextCursor: null });
  });
  it("checks membership before validating the cursor", async () => {
    const chatId = await makeChat();
    await assert.rejects(
      getMessages(carol, chatId, { cursor: "invalid" }),
      badRequest(404, "Chat not found"),
    );
  });
});
