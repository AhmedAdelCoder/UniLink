import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { createServer, type Server } from "node:http";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import prisma from "../src/config/postgres.js";
import env from "../src/config/env.js";
import app from "../src/app.js";
import Chat from "../src/modules/chat/models/Chat.js";
import Message from "../src/modules/chat/models/Message.js";
import { generateAccessToken } from "../src/utils/jwt.js";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const usersSeed = [A, B, C].map((id, i) => ({ id, fullName: ["Alice", "Bob", "Carol"][i], role: "student", photoUrl: null, companyName: null, companyLogoUrl: null, isOnline: false, lastSeen: null, deletedAt: null }));

describe("chat REST over HTTP", () => {
  let mongo: MongoMemoryServer;
  let http: Server;
  let origin: string;
  const originalConnectionFindFirst = prisma.connection.findFirst;
  const originalConnectionFindMany = prisma.connection.findMany;
  const originalUserFindMany = prisma.user.findMany;
  const originalUserFindUnique = prisma.user.findUnique;
  let connectedPairs: Set<string>;
  let users: typeof usersSeed;
  let connectionCalls: unknown[];
  let userCalls: unknown[];
  const pairKey = (x: string, y: string) => [x, y].sort().join(":");

  before(async () => {
    mongo = await MongoMemoryServer.create({ binary: { downloadDir: join(process.cwd(), ".cache", "mongodb-binaries") }, instance: { ip: "127.0.0.1" } });
    await mongoose.connect(mongo.getUri(), { dbName: "unilink-chat-http-tests" });
    await Promise.all([Chat.init(), Message.init()]);
    (prisma.connection as any).findFirst = async (...args: unknown[]) => {
      connectionCalls.push(args[0]);
      const where = (args[0] as any).where;
      const directions: Array<{ requesterId: string; receiverId: string }> = where.OR ?? [];
      return directions.some((p) => connectedPairs.has(pairKey(p.requesterId, p.receiverId))) ? { id: "accepted" } : null;
    };
    (prisma.connection as any).findMany = async (...args: unknown[]) => {
      const query = args[0] as any;
      return [...connectedPairs].map((pair) => {
        const [requesterId, receiverId] = pair.split(":");
        return { requesterId, receiverId, status: "accepted" };
      }).filter((row) => row.status === query.where.status && query.where.OR.some((clause: any) =>
        Object.entries(clause).every(([key, value]) => (row as any)[key] === value)))
        .map(({ requesterId, receiverId }) => ({ requesterId, receiverId }));
    };
    (prisma.user as any).findMany = async (...args: unknown[]) => {
      userCalls.push(args[0]);
      const query = args[0] as { where: { id: { in: string[] }; deletedAt?: null } };
      return users.filter((user) => query.where.id.in.includes(user.id) && (query.where.deletedAt === null ? user.deletedAt == null : true))
        .map(({ deletedAt: _deletedAt, ...user }) => user);
    };
    (prisma.user as any).findUnique = async (...args: unknown[]) => {
      const id = (args[0] as any).where.id;
      const user = users.find((candidate) => candidate.id === id && candidate.deletedAt == null);
      return user ? { id: user.id, deletedAt: null, role: user.role } : null;
    };
    http = createServer(app);
    await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
    const address = http.address();
    assert.ok(address && typeof address !== "string");
    origin = `http://127.0.0.1:${address.port}`;
  });
  beforeEach(async () => {
    await Promise.all([Chat.deleteMany({}), Message.deleteMany({})]);
    users = [...usersSeed];
    connectedPairs = new Set([pairKey(A, B), pairKey(A, C), pairKey(B, C)]);
    connectionCalls = [];
    userCalls = [];
  });
  after(async () => {
    (prisma.connection as any).findFirst = originalConnectionFindFirst;
    (prisma.connection as any).findMany = originalConnectionFindMany;
    (prisma.user as any).findMany = originalUserFindMany;
    (prisma.user as any).findUnique = originalUserFindUnique;
    await new Promise<void>((resolve, reject) => http.close((error) => error ? reject(error) : resolve()));
    await mongoose.disconnect();
    await mongo?.stop();
  });

  const token = (id = A) => generateAccessToken({ userId: id, role: "student" as any });
  const request = (path: string, options: { method?: string; user?: string; auth?: string | null; body?: unknown } = {}) => {
    const headers: Record<string, string> = {};
    if (options.auth !== null) headers.authorization = options.auth ?? `Bearer ${token(options.user)}`;
    if (options.body !== undefined) headers["content-type"] = "application/json";
    return fetch(`${origin}/api/v1/chat${path}`, { method: options.method ?? "GET", headers, body: options.body === undefined ? undefined : JSON.stringify(options.body), signal: AbortSignal.timeout(5_000) });
  };
  const json = async (response: Response) => response.json() as Promise<any>;
  const assertHygienic = (value: unknown, location = "response") => {
    const forbidden = new Set(["_id", "__v", "user_1_id", "user_2_id", "password", "email"]);
    const visit = (current: unknown, path: string) => {
      if (Array.isArray(current)) {
        current.forEach((item, index) => visit(item, `${path}[${index}]`));
      } else if (typeof current === "object" && current !== null) {
        for (const [key, child] of Object.entries(current)) {
          assert.equal(forbidden.has(key), false, `forbidden response key ${path}.${key}`);
          visit(child, `${path}.${key}`);
        }
      }
    };
    visit(value, location);
  };
  const assertNoPresence = (value: unknown, location = "response") => {
    const visit = (current: unknown, path: string) => {
      if (Array.isArray(current)) current.forEach((item, index) => visit(item, `${path}[${index}]`));
      else if (typeof current === "object" && current !== null) {
        for (const [key, child] of Object.entries(current)) {
          assert.equal(["isOnline", "lastSeen"].includes(key), false, `unexpected presence key ${path}.${key}`);
          visit(child, `${path}.${key}`);
        }
      }
    };
    visit(value, location);
  };
  const makeChat = async (user1 = A, user2 = B) => Chat.create({ user_1_id: user1, user_2_id: user2 });
  const addMessage = async (chatId: string, senderId: string, content: string, createdAt: Date) =>
    Message.create({ chat_id: new mongoose.Types.ObjectId(chatId), sender_id: senderId, content, created_at: createdAt });
  const cursorFor = (createdAt: Date, id = new mongoose.Types.ObjectId()) =>
    Buffer.from(`${createdAt.toISOString()}|${id}`).toString("base64url");

  it(`reports Express ${JSON.parse(readFileSync(join(process.cwd(), "node_modules", "express", "package.json"), "utf8")).version} and forwards async AppErrors through errorMiddleware`, async () => {
    const started = Date.now();
    const missing = await request("/000000000000000000000000");
    assert.equal(missing.status, 404);
    assert.deepEqual(await json(missing), { success: false, message: "Chat not found" });
    assert.ok(Date.now() - started < 5_000, "async controller AppError response completed before the request timeout");
  });

  it("returns 401 with the expected JSON for each invalid auth form on every chat endpoint", async () => {
    const valid = token();
    const tampered = `${valid.slice(0, -1)}${valid.endsWith("a") ? "b" : "a"}`;
    const expired = jwt.sign({ userId: A, role: "student" }, env.jwtSecret, { expiresIn: -1 });
    const wrongSecret = jwt.sign({ userId: A, role: "student" }, "wrong-secret");
    const none = `${Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ userId: A, role: "student" })).toString("base64url")}.`;
    const badTokens: Array<[string, string | null, string]> = [
      ["missing header", null, "Unauthorized"], ["empty bearer token", "Bearer ", "Unauthorized"], ["malformed token", "Bearer malformed", "Invalid token"],
      ["wrong secret", `Bearer ${wrongSecret}`, "Invalid token"], ["tampered token", `Bearer ${tampered}`, "Invalid token"],
      ["expired token", `Bearer ${expired}`, "Token expired"], ["alg none token", `Bearer ${none}`, "Invalid token"],
    ];
    const targets: Array<[string, string, unknown?]> = [
      ["POST /", "POST", { userId: B }], ["GET /", "GET"], ["GET /:chatId", "GET"],
      ["GET /:chatId/messages", "GET"], ["POST /:chatId/messages", "POST", { content: "hi" }], ["PATCH /:chatId/read", "PATCH"],
    ];
    for (const [label, method, body] of targets) for (const [authLabel, auth, expectedMessage] of badTokens) {
      // Resolve the templated endpoint paths explicitly to keep each real route covered.
      const actualPath = label === "GET /:chatId/messages" ? "/000000000000000000000000/messages"
        : label === "POST /:chatId/messages" ? "/000000000000000000000000/messages"
        : label === "PATCH /:chatId/read" ? "/000000000000000000000000/read"
        : label === "GET /:chatId" ? "/000000000000000000000000" : "/";
      const response = await request(actualPath, { method, auth, ...(body === undefined ? {} : { body }) });
      const result = await json(response);
      assert.equal(response.status, 401, `${method} ${label}: ${authLabel}`);
      assert.deepEqual(result, { success: false, message: expectedMessage }, `${method} ${label}: ${authLabel}`);
      assertHygienic(result, `${method} ${label} ${authLabel}`);
    }
  });

  it("creates chats, validates input and identity, checks users/connections, and returns a stable public DTO", async () => {
    let response = await request("/", { method: "POST", body: { userId: B } });
    assert.equal(response.status, 200);
    const first = await json(response);
    assert.deepEqual(Object.keys(first.data.chat).sort(), ["id", "otherUser", "lastMessage", "lastMessageAt"].sort());
    const id = first.data.chat.id;
    assert.equal(typeof id, "string");
    assert.equal("_id" in first.data.chat, false);
    response = await request("/", { method: "POST", body: { userId: B } });
    assert.equal((await json(response)).data.chat.id, id);
    response = await request("/", { method: "POST", user: B, body: { userId: A } });
    assert.equal((await json(response)).data.chat.id, id);
    assert.equal(await Chat.countDocuments(), 1);
    for (const [body, status] of [[{ userId: "bad" }, 400], [{ userId: A }, 400], [{ userId: B, extra: 1 }, 400], [undefined, 400]] as const) {
      response = await request("/", { method: "POST", body });
      assert.equal(response.status, status);
      assert.equal((await json(response)).success, false);
    }
    users = users.filter((user) => user.id !== C);
    response = await request("/", { method: "POST", body: { userId: C } });
    assert.equal(response.status, 404);
    users = [...usersSeed];
    connectedPairs.delete(pairKey(A, C));
    response = await request("/", { method: "POST", body: { userId: C } });
    assert.equal(response.status, 403);
    assert.ok(connectionCalls.length >= 4);
    assert.ok(userCalls.length >= 4);
  });

  it("resolves simultaneous chat creation requests to one shared chat", async () => {
    const responses = await Promise.all([
      request("/", { method: "POST", user: A, body: { userId: B } }),
      request("/", { method: "POST", user: B, body: { userId: A } }),
    ]);
    assert.deepEqual(responses.map((response) => response.status), [200, 200]);
    const bodies = await Promise.all(responses.map(json));
    assert.equal(bodies[0].data.chat.id, bodies[1].data.chat.id);
    assert.equal(await Chat.countDocuments({}), 1);
  });

  it("lists chats by last activity with per-chat unread counts and deleted-user placeholders", async () => {
    const empty = await request("/");
    assert.equal(empty.status, 200);
    assert.deepEqual((await json(empty)).data.chats, []);
    const older = await Chat.create({ user_1_id: A, user_2_id: B, last_message_at: new Date(1000), last_message: "old", last_message_sender_id: B });
    const newer = await Chat.create({ user_1_id: C, user_2_id: A, last_message_at: new Date(2000), last_message: "new", last_message_sender_id: C });
    await Chat.create({ user_1_id: B, user_2_id: C, last_message_at: new Date(3000) });
    await Message.create([
      { chat_id: older._id, sender_id: B, content: "unread" },
      { chat_id: older._id, sender_id: A, content: "mine" },
      { chat_id: older._id, sender_id: B, content: "read", is_read: true },
      { chat_id: newer._id, sender_id: C, content: "incoming" },
    ]);
    users = users.filter((user) => user.id !== C);
    const response = await request("/");
    assert.equal(response.status, 200);
    const { chats } = (await json(response)).data;
    assert.deepEqual(chats.map((chat: any) => chat.id), [String(newer._id), String(older._id)]);
    assert.equal(chats[0].unreadCount, 1);
    assert.deepEqual(chats[0].otherUser, { id: C, deleted: true });
    assert.equal(chats[1].unreadCount, 1);
    assert.deepEqual(chats[1].otherUser, { id: B, fullName: "Bob", role: "student", photoUrl: null, companyName: null, companyLogoUrl: null, isOnline: false, lastSeen: null });
    for (const limit of ["0", "51", "-1", "abc"]) {
      const invalid = await request(`/?limit=${limit}`);
      assert.equal(invalid.status, 400, `limit=${limit}`);
      const body = await json(invalid);
      assert.deepEqual({ success: body.success, message: body.message }, { success: false, message: "Validation error" });
      assert.ok(Array.isArray(body.errors));
    }
  });

  it("serves chat details, paged messages, idempotent sends, and read receipts over HTTP", async () => {
    const chat = await Chat.create({ user_1_id: A, user_2_id: B });
    const chatId = String(chat._id);
    let response = await request(`/${chatId}`);
    assert.equal(response.status, 200);
    let payload = await json(response);
    assert.equal(payload.success, true);
    assert.equal(payload.data.chat.id, chatId);
    assert.equal(payload.data.chat.canSend, true);
    assert.equal(payload.data.chat.otherUser.id, B);

    response = await request(`/${chatId}/messages?limit=1`);
    assert.equal(response.status, 200);
    assert.deepEqual((await json(response)).data, { messages: [], nextCursor: null });

    response = await request(`/${chatId}/messages`, { method: "POST", body: { content: " hello ", clientMessageId: "client-1" } });
    assert.equal(response.status, 201);
    payload = await json(response);
    assert.equal(payload.success, true);
    assert.equal(payload.data.message.senderId, A);
    assert.equal(payload.data.message.content, "hello");
    const sentId = payload.data.message.id;
    response = await request(`/${chatId}/messages`, { method: "POST", body: { content: "ignored retry", clientMessageId: "client-1" } });
    assert.equal(response.status, 200);
    assert.equal((await json(response)).data.message.id, sentId);
    assert.equal(await Message.countDocuments({ chat_id: chat._id }), 1);

    response = await request(`/${chatId}/messages`);
    assert.equal(response.status, 200);
    payload = await json(response);
    assert.equal(payload.data.messages.length, 1);
    assert.equal(payload.data.messages[0].id, sentId);
    assert.equal(payload.data.messages[0].content, "hello");
    response = await request(`/${chatId}/read`, { method: "PATCH", user: B });
    assert.equal(response.status, 200);
    assert.deepEqual((await json(response)).data, { updated: 1 });
    assert.equal((await Message.findById(sentId).lean())?.is_read, true);
  });

  it("rejects REST sends to a soft-deleted recipient without revealing account state", async () => {
    const chat = await Chat.create({ user_1_id: A, user_2_id: B });
    users = users.filter((user) => user.id !== B);
    const response = await request(`/${chat._id}/messages`, {
      method: "POST",
      body: { content: "must not be delivered", clientMessageId: "deleted-recipient" },
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await json(response), {
      success: false,
      message: "You can only message your accepted connections",
    });
    assert.equal(await Message.countDocuments({ chat_id: chat._id }), 0);
    assert.equal((await Chat.findById(chat._id).lean())?.last_message, null);
  });

  it("uses the default 30-message page, sorts newest first, and returns a next cursor only when more messages exist", async () => {
    const chat = await makeChat();
    const chatId = String(chat._id);
    for (let i = 1; i <= 35; i++) await addMessage(chatId, i % 2 ? A : B, `m${i}`, new Date(i * 1_000));

    const firstResponse = await request(`/${chatId}/messages`);
    assert.equal(firstResponse.status, 200);
    const first = (await json(firstResponse)).data;
    assert.equal(first.messages.length, 30);
    assert.deepEqual(first.messages.map((message: any) => message.content), Array.from({ length: 30 }, (_, i) => `m${35 - i}`));
    assert.equal(typeof first.nextCursor, "string");

    const secondResponse = await request(`/${chatId}/messages?cursor=${encodeURIComponent(first.nextCursor)}`);
    assert.equal(secondResponse.status, 200);
    const second = (await json(secondResponse)).data;
    assert.deepEqual(second.messages.map((message: any) => message.content), ["m5", "m4", "m3", "m2", "m1"]);
    assert.equal(second.nextCursor, null);
  });

  it("validates message pagination limits at the HTTP endpoint", async () => {
    const chat = await makeChat();
    for (const limit of ["0", "-1", "51", "abc"]) {
      const response = await request(`/${chat._id}/messages?limit=${limit}`);
      assert.equal(response.status, 400, `limit=${limit}`);
      const body = await json(response);
      assert.deepEqual({ success: body.success, message: body.message }, { success: false, message: "Validation error" });
      assert.ok(Array.isArray(body.errors));
    }
    const maximum = await request(`/${chat._id}/messages?limit=50`);
    assert.equal(maximum.status, 200);
    assert.deepEqual((await json(maximum)).data, { messages: [], nextCursor: null });
    assert.equal(await Message.countDocuments({ chat_id: chat._id }), 0);
  });

  it("paginates by a valid returned cursor without duplicates or omissions", async () => {
    const chat = await makeChat();
    const chatId = String(chat._id);
    for (let i = 1; i <= 5; i++) await addMessage(chatId, A, `m${i}`, new Date(i * 1_000));

    const firstResponse = await request(`/${chatId}/messages?limit=2`);
    assert.equal(firstResponse.status, 200);
    const first = (await json(firstResponse)).data;
    assert.deepEqual(first.messages.map((message: any) => message.content), ["m5", "m4"]);
    assert.equal(typeof first.nextCursor, "string");

    const secondResponse = await request(`/${chatId}/messages?limit=2&cursor=${encodeURIComponent(first.nextCursor)}`);
    assert.equal(secondResponse.status, 200);
    const second = (await json(secondResponse)).data;
    assert.deepEqual(second.messages.map((message: any) => message.content), ["m3", "m2"]);
    assert.equal(typeof second.nextCursor, "string");

    const thirdResponse = await request(`/${chatId}/messages?limit=2&cursor=${encodeURIComponent(second.nextCursor)}`);
    assert.equal(thirdResponse.status, 200);
    const third = (await json(thirdResponse)).data;
    assert.deepEqual(third.messages.map((message: any) => message.content), ["m1"]);
    assert.equal(third.nextCursor, null);
    assert.deepEqual([...first.messages, ...second.messages, ...third.messages].map((message: any) => message.content), ["m5", "m4", "m3", "m2", "m1"]);
  });

  it("rejects malformed cursor formats with the validation error response", async () => {
    const chat = await makeChat();
    const chatId = String(chat._id);
    for (const cursor of ["not-a-cursor", Buffer.from("bad-date|0123456789abcdef01234567").toString("base64url"), Buffer.from("2026-01-01T00:00:00.000Z|not-an-object-id").toString("base64url")]) {
      const response = await request(`/${chatId}/messages?cursor=${encodeURIComponent(cursor)}`);
      assert.equal(response.status, 400);
      const body = await json(response);
      assert.equal(body.success, false);
      assert.equal(body.message, "Invalid cursor");
    }
  });

  it("applies cross-chat and missing-message cursors as timestamp and ID boundaries in the requested chat", async () => {
    const sourceChat = await makeChat(A, B);
    const targetChat = await makeChat(A, C);
    const sourceId = String(sourceChat._id);
    const targetId = String(targetChat._id);
    for (let i = 1; i <= 4; i++) await addMessage(sourceId, A, `source-${i}`, new Date(i * 1_000));
    for (let i = 1; i <= 4; i++) await addMessage(targetId, C, `target-${i}`, new Date(i * 1_000));

    const sourcePageResponse = await request(`/${sourceId}/messages?limit=1`);
    assert.equal(sourcePageResponse.status, 200);
    const sourcePage = (await json(sourcePageResponse)).data;
    assert.equal(sourcePage.messages[0].content, "source-4");
    const crossChatResponse = await request(`/${targetId}/messages?cursor=${encodeURIComponent(sourcePage.nextCursor)}`);
    assert.equal(crossChatResponse.status, 200);
    const crossChatPage = (await json(crossChatResponse)).data;
    assert.deepEqual(crossChatPage.messages.map((message: any) => message.content), ["target-3", "target-2", "target-1"]);
    assert.equal(crossChatPage.nextCursor, null);

    const missingMessageCursor = cursorFor(new Date(2_500));
    const missingMessageResponse = await request(`/${targetId}/messages?cursor=${encodeURIComponent(missingMessageCursor)}`);
    assert.equal(missingMessageResponse.status, 200);
    const missingMessagePage = (await json(missingMessageResponse)).data;
    assert.deepEqual(missingMessagePage.messages.map((message: any) => message.content), ["target-2", "target-1"]);
    assert.equal(missingMessagePage.nextCursor, null);
  });

  it("returns 404 for unknown, deleted, and non-participant chat details", async () => {
    const chat = await makeChat();
    const chatId = String(chat._id);
    const unknownId = new mongoose.Types.ObjectId().toString();
    const unknown = await request(`/${unknownId}`);
    assert.equal(unknown.status, 404);
    assert.deepEqual(await json(unknown), { success: false, message: "Chat not found" });

    const nonParticipant = await request(`/${chatId}`, { user: C });
    assert.equal(nonParticipant.status, 404);
    assert.deepEqual(await json(nonParticipant), { success: false, message: "Chat not found" });

    await Chat.deleteOne({ _id: chat._id });
    const deleted = await request(`/${chatId}`);
    assert.equal(deleted.status, 404);
    assert.deepEqual(await json(deleted), { success: false, message: "Chat not found" });
  });

  it("hides presence throughout list and detail REST responses after connection removal", async () => {
    const chat = await makeChat(A, B);
    connectedPairs.delete(pairKey(A, B));

    const listResponse = await request("/");
    assert.equal(listResponse.status, 200);
    const listBody = await json(listResponse);
    assertHygienic(listBody, "GET /chat");
    const listed = listBody.data.chats.find((item: any) => item.id === String(chat._id));
    assert.ok(listed);
    assert.equal("isOnline" in listed.otherUser, false);
    assert.equal("lastSeen" in listed.otherUser, false);
    assertNoPresence(listBody, "GET /chat");

    const detailResponse = await request(`/${chat._id}`);
    assert.equal(detailResponse.status, 200);
    const detailBody = await json(detailResponse);
    assertHygienic(detailBody, "GET /chat/:id");
    assert.equal(detailBody.data.chat.canSend, false);
    assert.equal("isOnline" in detailBody.data.chat.otherUser, false);
    assert.equal("lastSeen" in detailBody.data.chat.otherUser, false);
    assertNoPresence(detailBody, "GET /chat/:id");
  });

  it("returns a deleted participant placeholder and disables sending in chat details", async () => {
    const chat = await makeChat();
    users = users.filter((user) => user.id !== B);
    const response = await request(`/${chat._id}`);
    assert.equal(response.status, 200);
    const { chat: details } = (await json(response)).data;
    assert.deepEqual(details.otherUser, { id: B, deleted: true });
    assert.equal(details.canSend, false);
  });

  it("marks unread incoming messages as read and returns zero for already-read or absent unread messages", async () => {
    const chat = await makeChat();
    const chatId = String(chat._id);
    const unread = await addMessage(chatId, A, "incoming", new Date(1_000));
    const alreadyRead = await Message.create({ chat_id: chat._id, sender_id: A, content: "already read", is_read: true, created_at: new Date(2_000) });
    const ownMessage = await addMessage(chatId, B, "own message", new Date(3_000));

    const first = await request(`/${chatId}/read`, { method: "PATCH", user: B });
    assert.equal(first.status, 200);
    assert.deepEqual((await json(first)).data, { updated: 1 });
    assert.equal((await Message.findById(unread._id).lean())?.is_read, true);
    assert.equal((await Message.findById(alreadyRead._id).lean())?.is_read, true);
    assert.equal((await Message.findById(ownMessage._id).lean())?.is_read, false);

    const repeat = await request(`/${chatId}/read`, { method: "PATCH", user: B });
    assert.equal(repeat.status, 200);
    assert.deepEqual((await json(repeat)).data, { updated: 0 });

    const noUnreadChat = await makeChat(A, C);
    const noUnread = await request(`/${noUnreadChat._id}/read`, { method: "PATCH" });
    assert.equal(noUnread.status, 200);
    assert.deepEqual((await json(noUnread)).data, { updated: 0 });
  });

  it("returns 404 when marking an unknown chat or another user's chat as read", async () => {
    const chat = await makeChat();
    const unknownId = new mongoose.Types.ObjectId().toString();
    for (const [chatId, user] of [[unknownId, A], [String(chat._id), C]]) {
      const response = await request(`/${chatId}/read`, { method: "PATCH", user });
      assert.equal(response.status, 404);
      assert.deepEqual(await json(response), { success: false, message: "Chat not found" });
    }
  });

  it("rejects invalid chat IDs and empty or invalid message content with 400", async () => {
    const malformedPath = await request("/invalid/messages", { method: "POST", body: { content: "hi" } });
    assert.equal(malformedPath.status, 400);
    const malformedBody = await json(malformedPath);
    assert.equal(malformedBody.success, false);
    assert.equal(malformedBody.message, "Validation error");
    assert.ok(Array.isArray(malformedBody.errors));

    const chat = await makeChat();
    for (const content of ["", "   ", 123, null, "x".repeat(2_001)]) {
      const response = await request(`/${chat._id}/messages`, { method: "POST", body: { content } });
      assert.equal(response.status, 400, `content=${String(content).slice(0, 20)}`);
      const body = await json(response);
      assert.equal(body.success, false);
      assert.equal(body.message, "Validation error");
      assert.ok(Array.isArray(body.errors));
    }
    assert.equal(await Message.countDocuments({ chat_id: chat._id }), 0);
  });

  it("returns 404 and creates no message when a non-participant posts to the chat", async () => {
    const chat = await makeChat();
    const response = await request(`/${chat._id}/messages`, { method: "POST", user: C, body: { content: "not allowed" } });
    assert.equal(response.status, 404);
    assert.deepEqual(await json(response), { success: false, message: "Chat not found" });
    assert.equal(await Message.countDocuments({ chat_id: chat._id }), 0);
  });

  it("returns 201 for a new message and 200 with the same message on idempotent retry", async () => {
    const chat = await makeChat();
    const path = `/${chat._id}/messages`;
    const first = await request(path, { method: "POST", body: { content: "first payload", clientMessageId: "retry-key" } });
    assert.equal(first.status, 201);
    const firstBody = await json(first);
    assert.equal(firstBody.success, true);
    const messageId = firstBody.data.message.id;

    const retry = await request(path, { method: "POST", body: { content: "different retry payload", clientMessageId: "retry-key" } });
    assert.equal(retry.status, 200);
    const retryBody = await json(retry);
    assert.equal(retryBody.success, true);
    assert.equal(retryBody.data.message.id, messageId);
    assert.equal(retryBody.data.message.content, "first payload");
    assert.equal(await Message.countDocuments({ chat_id: chat._id }), 1);
    assert.equal((await Message.findById(messageId).lean())?.sender_id, A);
  });

  it("deduplicates simultaneous HTTP sends with the same client message ID", async () => {
    const chat = await makeChat();
    const path = `/${chat._id}/messages`;
    const responses = await Promise.all([
      request(path, { method: "POST", body: { content: "concurrent original", clientMessageId: "parallel-key" } }),
      request(path, { method: "POST", body: { content: "concurrent retry", clientMessageId: "parallel-key" } }),
    ]);
    assert.deepEqual(responses.map((response) => response.status).sort(), [200, 201]);
    const bodies = await Promise.all(responses.map(json));
    assert.equal(bodies[0].data.message.id, bodies[1].data.message.id);
    assert.equal(await Message.countDocuments({ chat_id: chat._id, sender_id: A, client_message_id: "parallel-key" }), 1);
    const storedMessage = await Message.findOne({ chat_id: chat._id, sender_id: A, client_message_id: "parallel-key" }).lean();
    const storedChat = await Chat.findById(chat._id).lean();
    assert.equal(storedChat?.last_message, storedMessage?.content);
    assert.equal(storedChat?.last_message_sender_id, A);
    assert.equal(storedChat?.last_message_at?.getTime(), storedMessage?.created_at.getTime());
  });

  it("prevents user C from reading, sending to, or marking read chat A-B without changing MongoDB", async () => {
    const chat = await makeChat(A, B);
    const incoming = await addMessage(String(chat._id), A, "unread incoming", new Date(1_000));
    const before = {
      chats: await Chat.countDocuments({}),
      messages: await Message.countDocuments({}),
      unread: (await Message.findById(incoming._id).lean())?.is_read,
    };
    assert.equal(before.unread, false);

    const details = await request(`/${chat._id}`, { user: C });
    assert.equal(details.status, 404);
    assert.deepEqual(await json(details), { success: false, message: "Chat not found" });
    const send = await request(`/${chat._id}/messages`, { method: "POST", user: C, body: { content: "unauthorized" } });
    assert.equal(send.status, 404);
    assert.deepEqual(await json(send), { success: false, message: "Chat not found" });
    const read = await request(`/${chat._id}/read`, { method: "PATCH", user: C });
    assert.equal(read.status, 404);
    assert.deepEqual(await json(read), { success: false, message: "Chat not found" });

    const after = {
      chats: await Chat.countDocuments({}),
      messages: await Message.countDocuments({}),
      unread: (await Message.findById(incoming._id).lean())?.is_read,
    };
    assert.deepEqual(after, before);
  });

  it("keeps all six endpoint response bodies free of Mongo internals and private profile fields", async () => {
    const chat = await makeChat();
    const chatId = String(chat._id);
    const bodies: Array<[string, unknown]> = [];
    const capture = async (label: string, path: string, options: Parameters<typeof request>[1] = {}) => {
      const response = await request(path, options);
      assert.ok(response.status >= 200 && response.status < 300, `${label}: ${response.status}`);
      bodies.push([label, await json(response)]);
    };

    await capture("POST /chat", "/", { method: "POST", body: { userId: B } });
    await capture("GET /chat", "/");
    await capture("GET /chat/:chatId", `/${chatId}`);
    await capture("GET /chat/:chatId/messages", `/${chatId}/messages`);
    await capture("POST /chat/:chatId/messages", `/${chatId}/messages`, { method: "POST", body: { content: "hygiene check" } });
    await capture("PATCH /chat/:chatId/read", `/${chatId}/read`, { method: "PATCH" });

    assert.equal(bodies.length, 6);
    for (const [label, body] of bodies) assertHygienic(body, label);

    const errors: Array<[string, Response]> = [
      ["POST /chat validation error", await request("/", { method: "POST", body: { userId: "invalid" } })],
      ["GET /chat validation error", await request("/?limit=abc")],
      ["GET /chat/:chatId not found", await request(`/${new mongoose.Types.ObjectId()}`)],
      ["GET /chat/:chatId/messages cursor error", await request(`/${chatId}/messages?cursor=not-a-cursor`)],
      ["POST /chat/:chatId/messages validation error", await request(`/${chatId}/messages`, { method: "POST", body: { content: "" } })],
      ["PATCH /chat/:chatId/read not found", await request(`/${new mongoose.Types.ObjectId()}/read`, { method: "PATCH" })],
    ];
    for (const [label, response] of errors) {
      assert.ok(response.status >= 400, `${label}: expected an error response`);
      assertHygienic(await json(response), label);
    }
  });

  it("rejects senderId in an HTTP message body and stores successful sends under the authenticated user", async () => {
    const chat = await makeChat();
    const chatId = String(chat._id);
    const injected = await request(`/${chatId}/messages`, {
      method: "POST",
      body: { content: "spoofed sender", senderId: B },
    });
    assert.equal(injected.status, 400);
    const injectedBody = await json(injected);
    assert.equal(injectedBody.success, false);
    assert.equal(injectedBody.message, "Validation error");
    assert.ok(Array.isArray(injectedBody.errors));
    assert.equal(await Message.countDocuments({ chat_id: chat._id }), 0);

    const sent = await request(`/${chatId}/messages`, { method: "POST", body: { content: "auth owns sender" } });
    assert.equal(sent.status, 201);
    const sentBody = await json(sent);
    assert.equal(sentBody.data.message.senderId, A);
    const stored = await Message.findById(sentBody.data.message.id).lean();
    assert.equal(stored?.sender_id, A);
    assert.equal(await Message.countDocuments({ chat_id: chat._id }), 1);
  });
});
