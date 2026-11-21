import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import type { TestContext } from "node:test";
import { createServer, type Server as HttpServer } from "node:http";
import { join } from "node:path";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { MongoMemoryServer } from "mongodb-memory-server";
import { io as createClient, type Socket as ClientSocket } from "socket.io-client";
import prisma from "../src/config/postgres.js";
import Chat from "../src/modules/chat/models/Chat.js";
import Message from "../src/modules/chat/models/Message.js";
import { initSocket } from "../src/modules/chat/sockets/index.js";
import { sweepSocketSessions } from "../src/modules/chat/sockets/session.sweeper.js";
import { ClientEvents, ServerEvents, type SocketAck } from "../src/modules/chat/sockets/chat.events.js";
import { getMessages } from "../src/modules/chat/services/chat.service.js";
import { generateAccessToken } from "../src/utils/jwt.js";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const D = "44444444-4444-4444-8444-444444444444";
const E = "55555555-5555-4555-8555-555555555555";
const F = "66666666-6666-4666-8666-666666666666";
const P1 = "77777777-7777-4777-8777-777777777777";
const P2 = "88888888-8888-4888-8888-888888888888";
const P3 = "99999999-9999-4999-8999-999999999999";
const P4 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const P5 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const P6 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const P7 = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const P8 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const usersSeed = [A, B, C, D].map((id, index) => ({
  id,
  fullName: ["Alice", "Bob", "Carol", "Dana"][index],
  role: "student",
  photoUrl: null,
  companyName: null,
  companyLogoUrl: null,
  isOnline: false,
  lastSeen: null,
  deletedAt: null as Date | null,
}));
const expectedDtoKeys = ["id", "chatId", "senderId", "content", "clientMessageId", "isRead", "readAt", "createdAt"];
type Ack<T = any> = SocketAck<T>;

const waitForEvent = <T = any>(socket: ClientSocket, name: string, ms = 2_000): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(name, listener);
      reject(new Error(`Timed out waiting for ${name}`));
    }, ms);
    const listener = (payload: T) => {
      clearTimeout(timer);
      socket.off(name, listener);
      resolve(payload);
    };
    socket.on(name, listener);
  });

const emitAck = <T = any>(socket: ClientSocket, name: string, payload: unknown, ms = 2_000): Promise<Ack<T>> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ack to ${name}`)), ms);
    socket.emit(name, payload, (result: Ack<T>) => {
      clearTimeout(timer);
      resolve(result);
    });
  });

describe("live Socket.IO chat contract", () => {
  let mongo: MongoMemoryServer;
  let http: HttpServer;
  let io: ReturnType<typeof initSocket>;
  let origin: string;
  const clients = new Set<ClientSocket>();
  let findManyQueries: Array<{ where: { id: { in: string[] }; deletedAt: null }; select: { id: true } }> = [];
  let presenceUpdateManyCalls: any[] = [];
  const originalConnectionFindFirst = prisma.connection.findFirst;
  const originalConnectionFindMany = prisma.connection.findMany;
  const originalUserFindMany = prisma.user.findMany;
  const originalUserUpdateMany = prisma.user.updateMany;
  const originalUserFindUnique = prisma.user.findUnique;
  let users = [...usersSeed];
  let connectedPairs = new Set<string>();
  let presenceConnections: Array<{ requesterId: string; receiverId: string; status: string }> = [];
  let throwPresenceConnections: Error | undefined;
  let throwFindUnique: Error | undefined;
  let throwFindMany: Error | undefined;
  let throwConnection: Error | undefined;
  const pairKey = (x: string, y: string) => [x, y].sort().join(":");

  before(async () => {
    mongo = await MongoMemoryServer.create({ binary: { downloadDir: join(process.cwd(), ".cache", "mongodb-binaries") }, instance: { ip: "127.0.0.1" } });
    await mongoose.connect(mongo.getUri(), { dbName: "unilink-chat-socket-tests" });
    await Promise.all([Chat.init(), Message.init()]);
    (prisma.connection as any).findFirst = async (...args: unknown[]) => {
      if (throwConnection) throw throwConnection;
      const where = (args[0] as any).where;
      const directions: Array<{ requesterId: string; receiverId: string }> = where.OR ?? [];
      return directions.some((pair) => connectedPairs.has(pairKey(pair.requesterId, pair.receiverId))) ? { id: "accepted" } : null;
    };
    (prisma.connection as any).findMany = async (...args: unknown[]) => {
      if (throwPresenceConnections) throw throwPresenceConnections;
      const query = args[0] as any;
      return presenceConnections.filter((row) => row.status === query.where.status && query.where.OR.some((clause: any) =>
        Object.entries(clause).every(([key, value]) => (row as any)[key] === value)))
        .map(({ requesterId, receiverId }) => ({ requesterId, receiverId }));
    };
    (prisma.user as any).findMany = async (...args: unknown[]) => {
      if (throwFindMany) throw throwFindMany;
      const query = args[0] as any;
      const valid = users.filter((user) => query.where.id.in.includes(user.id) && (query.where.deletedAt === null ? user.deletedAt == null : true));
      if (Object.keys(query.select).length === 1 && query.select.id === true) {
        findManyQueries.push(query);
        return valid.map((user) => ({ id: user.id }));
      }
      return valid.map(({ deletedAt: _deletedAt, ...user }) => user);
    };
    (prisma.user as any).updateMany = async (...args: unknown[]) => {
      const query = args[0] as any;
      presenceUpdateManyCalls.push(query);
      let count = 0;
      for (const user of users) {
        if (query.where.id !== undefined && query.where.id !== user.id) continue;
        if (query.where.deletedAt === null && user.deletedAt !== null) continue;
        if (query.where.isOnline !== undefined && query.where.isOnline !== user.isOnline) continue;
        Object.assign(user, query.data);
        count++;
      }
      return { count };
    };
    (prisma.user as any).findUnique = async (...args: unknown[]) => {
      if (throwFindUnique) throw throwFindUnique;
      const id = (args[0] as any).where.id;
      const user = users.find((candidate) => candidate.id === id);
      return user ? { id: user.id, deletedAt: user.deletedAt, role: user.role } : null;
    };
    http = createServer();
    io = initSocket(http);
    await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
    const address = http.address();
    assert.ok(address && typeof address !== "string");
    origin = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(async () => {
    const connectedClients = [...clients].filter((socket) => socket.connected);
    const disconnects = connectedClients.map((socket) => waitForEvent(socket, "disconnect"));
    for (const socket of clients) socket.disconnect();
    await Promise.all(disconnects);
    clients.clear();
    findManyQueries = [];
    presenceUpdateManyCalls = [];
    await Promise.all([Chat.deleteMany({}), Message.deleteMany({})]);
    users = usersSeed.map((user) => ({ ...user }));
    connectedPairs = new Set([pairKey(A, B), pairKey(A, C), pairKey(B, C)]);
    presenceConnections = [...connectedPairs].map((pair) => {
      const [requesterId, receiverId] = pair.split(":");
      return { requesterId, receiverId, status: "accepted" };
    });
    throwPresenceConnections = undefined;
    throwFindUnique = undefined;
    throwConnection = undefined;
  });

  after(async () => {
    for (const client of clients) {
      client.disconnect();
      client.removeAllListeners();
    }
    clients.clear();
    (prisma.connection as any).findFirst = originalConnectionFindFirst;
    (prisma.connection as any).findMany = originalConnectionFindMany;
    (prisma.user as any).findMany = originalUserFindMany;
    (prisma.user as any).updateMany = originalUserUpdateMany;
    (prisma.user as any).findUnique = originalUserFindUnique;
    await new Promise<void>((resolve) => io.close(() => resolve()));
    if (http.listening) await new Promise<void>((resolve, reject) => http.close((error) => error ? reject(error) : resolve()));
    await mongoose.disconnect();
    await mongo?.stop();
  });

  const token = (userId = A, role = "student") => generateAccessToken({ userId, role: role as any });
  const client = (authToken?: string, extraAuth: Record<string, unknown> = {}) => {
    const socket = createClient(origin, {
      autoConnect: false,
      reconnection: false,
      forceNew: true,
      transports: ["websocket"],
      auth: { ...extraAuth, ...(authToken === undefined ? {} : { token: authToken }) },
      timeout: 2_000,
    });
    clients.add(socket);
    return socket;
  };
  const connect = (userId = A, role = "student") => connectSocket(client(token(userId, role)));
  const connectSocket = (socket: ClientSocket) => new Promise<ClientSocket>((resolve, reject) => {
    const timer = setTimeout(() => { socket.disconnect(); reject(new Error("Timed out connecting socket")); }, 2_000);
    socket.once("connect", () => { clearTimeout(timer); resolve(socket); });
    socket.once("connect_error", (error) => { clearTimeout(timer); reject(error); });
    socket.connect();
  });
  const connectError = (socket: ClientSocket) => new Promise<Error>((resolve, reject) => {
    const timer = setTimeout(() => { socket.disconnect(); reject(new Error("Expected connect_error")); }, 2_000);
    socket.once("connect", () => { clearTimeout(timer); reject(new Error("Unexpected successful connection")); });
    socket.once("connect_error", (error) => { clearTimeout(timer); resolve(error); });
    socket.connect();
  });
  const createChat = async (user1 = A, user2 = B) => Chat.create({ user_1_id: user1, user_2_id: user2 });
  const assertAckError = (ack: Ack, code: string, message?: string) => {
    assert.equal(ack.ok, false);
    if (!ack.ok) {
      assert.equal(ack.error.code, code);
      if (message !== undefined) assert.equal(ack.error.message, message);
    }
  };

  const withPresenceServer = async (userIds: string[], run: (testIo: ReturnType<typeof initSocket>) => Promise<void>) => {
    const previousOrigin = origin;
    const previousClients = new Set(clients);
    const testHttp = createServer();
    const testIo = initSocket(testHttp, { presenceGraceMs: 50 });
    try {
      await new Promise<void>((resolve) => testHttp.listen(0, "127.0.0.1", resolve));
      const address = testHttp.address();
      assert.ok(address && typeof address !== "string");
      origin = `http://127.0.0.1:${address.port}`;
      for (const [index, id] of userIds.entries()) {
        users.push({ ...usersSeed[index % usersSeed.length], id, fullName: `Presence ${index}`, deletedAt: null });
      }
      await run(testIo);
    } finally {
      origin = previousOrigin;
      const testClients = [...clients].filter((socket) => !previousClients.has(socket));
      const connected = testClients.filter((socket) => socket.connected);
      const disconnects = connected.map((socket) => waitForEvent(socket, "disconnect"));
      for (const socket of connected) socket.disconnect();
      await Promise.all(disconnects);
      for (const socket of testClients) clients.delete(socket);
      await new Promise<void>((resolve) => testIo.close(() => resolve()));
    }
  };

  it("A1 rejects absent, empty, malformed, wrong-secret, expired, and alg-none tokens as Unauthorized", async () => {
    const expired = (() => {
      return jwt.sign({ userId: A, role: "student", exp: Math.floor(Date.now() / 1000) - 60 }, "test-secret");
    })();
    const noSignature = `${Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ userId: A, role: "student" })).toString("base64url")}.`;
    const malformedCases: Array<[string, ClientSocket]> = [
      ["no token", client()], ["empty token", client("  ")], ["malformed", client("nope")],
      ["wrong secret", client(jwt.sign({ userId: A, role: "student" }, "wrong-secret"))],
      ["expired", client(expired)], ["alg none", client(noSignature)],
    ];
    for (const [label, socket] of malformedCases) {
      const error = await connectError(socket);
      assert.equal(error.message, "Unauthorized", label);
      socket.disconnect();
    }
  });

  it("A2 rejects valid tokens for missing and soft-deleted users", async () => {
    users = users.filter((user) => user.id !== C);
    users.find((user) => user.id === B)!.deletedAt = new Date();
    for (const id of [B, C]) {
      const error = await connectError(client(token(id)));
      assert.equal(error.message, "Unauthorized");
    }
  });

  it("A3 reports Prisma lookup failures as Internal error rather than Unauthorized", async () => {
    throwFindUnique = new Error("database secret detail");
    const error = await connectError(client(token()));
    assert.equal(error.message, "Internal error");
    assert.notEqual(error.message, "Unauthorized");
  });

  it("A4 connects with the database role rather than the token role", async () => {
    users[0] = { ...users[0], role: "student" };
    const socket = await connect(A, "recruiter");
    const serverSocket = io.sockets.sockets.get(socket.id);
    assert.equal(serverSocket?.data.user.userId, A);
    assert.equal(serverSocket?.data.user.role, "student");
  });

  it("A5 disconnects cleanly and leaves the server healthy", async () => {
    const socket = await connect();
    const disconnected = waitForEvent(socket, "disconnect");
    socket.disconnect();
    await disconnected;
    const healthy = await connect(B);
    assert.equal(healthy.connected, true);
  });

  it("B6 acknowledges participant chat:join", async () => {
    const chat = await createChat();
    const socket = await connect(A);
    assert.deepEqual(await emitAck(socket, ClientEvents.ChatJoin, { chatId: String(chat._id) }), { ok: true, data: { chatId: String(chat._id) } });
  });

  it("B7 gives nonparticipants and missing chats the same CHAT_NOT_FOUND response", async () => {
    const chat = await createChat();
    const socket = await connect(C);
    const denied = await emitAck(socket, ClientEvents.ChatJoin, { chatId: String(chat._id) });
    const missing = await emitAck(socket, ClientEvents.ChatJoin, { chatId: new mongoose.Types.ObjectId().toString() });
    assertAckError(denied, "CHAT_NOT_FOUND", "Chat not found");
    assert.deepEqual(missing, denied);
  });

  it("B8 maps malformed, missing, and extra chat reference fields to VALIDATION_ERROR", async () => {
    const socket = await connect();
    for (const payload of [{ chatId: "bad" }, {}, { chatId: "0123456789abcdef01234567", extra: true }]) {
      assertAckError(await emitAck(socket, ClientEvents.ChatJoin, payload), "VALIDATION_ERROR");
    }
  });

  it("B9 acknowledges leave and tolerates events without an ack callback", async () => {
    const chat = await createChat();
    const socket = await connect(A);
    assert.equal((await emitAck(socket, ClientEvents.ChatLeave, { chatId: String(chat._id) })).ok, true);
    socket.emit(ClientEvents.ChatJoin, { chatId: String(chat._id) });
    assert.equal((await emitAck(socket, ClientEvents.ChatJoin, { chatId: String(chat._id) })).ok, true);
  });

  it("C10 persists before ack and updates the chat preview", async () => {
    const chat = await createChat();
    const socket = await connect(A);
    const result = await new Promise<Ack<any>>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("send ack timeout")), 2_000);
      socket.emit(ClientEvents.MessageSend, { chatId: String(chat._id), content: " hello ", clientMessageId: "c10" }, async (ack: Ack<any>) => {
        try {
          clearTimeout(timer);
          assert.equal(await Message.countDocuments({ _id: ack.ok ? ack.data.message.id : undefined }), 1);
          resolve(ack);
        } catch (error) { reject(error); }
      });
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.created, true);
      assert.equal(result.data.message.senderId, A);
      assert.equal(result.data.message.content, "hello");
      const stored = await Chat.findById(chat._id).lean();
      assert.equal(stored?.last_message, "hello");
      assert.deepEqual(Object.keys(result.data.message), expectedDtoKeys);
      assert.equal(typeof result.data.message.createdAt, "string");
      assert.ok(Number.isFinite(Date.parse(result.data.message.createdAt)));
    }
  });

  it("C11 delivers message:new to the recipient without requiring chat:join", async () => {
    const chat = await createChat();
    const sender = await connect(A);
    const recipient = await connect(B);
    const received = waitForEvent<any>(recipient, ServerEvents.MessageNew);
    const ack = await emitAck<any>(sender, ClientEvents.MessageSend, { chatId: String(chat._id), content: "unjoined recipient", clientMessageId: "c11" });
    assert.equal(ack.ok, true);
    if (ack.ok) assert.deepEqual(await received, { message: ack.data.message });
  });

  it("C12 excludes the sending socket while delivering to its second device and both recipient devices", async () => {
    const chat = await createChat();
    const sender1 = await connect(A);
    const sender2 = await connect(A);
    const recipient1 = await connect(B);
    const recipient2 = await connect(B);
    const secondDevice = waitForEvent<any>(sender2, ServerEvents.MessageNew);
    const recipientEvent1 = waitForEvent<any>(recipient1, ServerEvents.MessageNew);
    const recipientEvent2 = waitForEvent<any>(recipient2, ServerEvents.MessageNew);
    let senderSawOriginal = false;
    sender1.on(ServerEvents.MessageNew, (payload: any) => { if (payload.message.clientMessageId === "c12-first") senderSawOriginal = true; });
    const firstAck = await emitAck<any>(sender1, ClientEvents.MessageSend, { chatId: String(chat._id), content: "first", clientMessageId: "c12-first" });
    assert.equal(firstAck.ok, true);
    const firstId = firstAck.ok ? firstAck.data.message.id : "";
    for (const event of [await secondDevice, await recipientEvent1, await recipientEvent2]) assert.equal(event.message.id, firstId);
    const sentinel1 = waitForEvent<any>(sender1, ServerEvents.MessageNew);
    const back = await emitAck<any>(recipient1, ClientEvents.MessageSend, { chatId: String(chat._id), content: "sentinel", clientMessageId: "c12-sentinel" });
    assert.equal(back.ok, true);
    assert.equal((await sentinel1).message.clientMessageId, "c12-sentinel");
    assert.equal(senderSawOriginal, false);
  });

  it("C13 rejects senderId and unknown payload fields without persistence or emission", async () => {
    const chat = await createChat();
    const sender = await connect(A);
    const recipient = await connect(B);
    const invalid = await emitAck(sender, ClientEvents.MessageSend, { chatId: String(chat._id), content: "spoof", clientMessageId: "c13", senderId: B });
    assertAckError(invalid, "VALIDATION_ERROR");
    assert.equal(await Message.countDocuments(), 0);
    let invalidSeen = false;
    recipient.on(ServerEvents.MessageNew, (event: any) => { if (["c13", "c13-extra"].includes(event.message.clientMessageId)) invalidSeen = true; });
    const extra = await emitAck(sender, ClientEvents.MessageSend, { chatId: String(chat._id), content: "extra", clientMessageId: "c13-extra", extra: true });
    assertAckError(extra, "VALIDATION_ERROR");
    const control = waitForEvent<any>(recipient, ServerEvents.MessageNew);
    const valid = await emitAck(sender, ClientEvents.MessageSend, { chatId: String(chat._id), content: "control", clientMessageId: "c13-control" });
    assert.equal(valid.ok, true);
    assert.equal((await control).message.clientMessageId, "c13-control");
    assert.equal(invalidSeen, false);
  });

  it("C14 rejects missing/empty idempotency key and invalid content without saving", async () => {
    const chat = await createChat();
    const sender = await connect(A);
    const recipient = await connect(B);
    const invalidIds = new Set(["", "empty", "space", "long"]);
    let invalidSeen = false;
    recipient.on(ServerEvents.MessageNew, (event: any) => { if (event.message.clientMessageId == null || invalidIds.has(event.message.clientMessageId)) invalidSeen = true; });
    const invalids = [
      { chatId: String(chat._id), content: "x" },
      { chatId: String(chat._id), content: "x", clientMessageId: "" },
      { chatId: String(chat._id), content: "", clientMessageId: "empty" },
      { chatId: String(chat._id), content: "  ", clientMessageId: "space" },
      { chatId: String(chat._id), content: "x".repeat(2_001), clientMessageId: "long" },
    ];
    for (const payload of invalids) assertAckError(await emitAck(sender, ClientEvents.MessageSend, payload), "VALIDATION_ERROR");
    assert.equal(await Message.countDocuments(), 0);
    const sentinel = waitForEvent<any>(recipient, ServerEvents.MessageNew);
    assert.equal((await emitAck(sender, ClientEvents.MessageSend, { chatId: String(chat._id), content: "sentinel", clientMessageId: "c14-sentinel" })).ok, true);
    assert.equal((await sentinel).message.clientMessageId, "c14-sentinel");
    assert.equal(invalidSeen, false);
  });

  it("C15 returns the existing message on retry and emits no duplicate message:new", async () => {
    const chat = await createChat();
    const sender = await connect(A);
    const senderDevice = await connect(A);
    const recipient = await connect(B);
    const senderEvents: any[] = [];
    senderDevice.on(ServerEvents.MessageNew, (event: any) => senderEvents.push(event.message));
    const firstEvent = waitForEvent<any>(recipient, ServerEvents.MessageNew);
    const first = await emitAck<any>(sender, ClientEvents.MessageSend, { chatId: String(chat._id), content: "original", clientMessageId: "retry-key" });
    assert.equal(first.ok, true);
    const delivered = await firstEvent;
    assert.deepEqual(delivered.message, first.ok && first.data.message);
    const retry = await emitAck<any>(sender, ClientEvents.MessageSend, { chatId: String(chat._id), content: "retry body", clientMessageId: "retry-key" });
    assert.equal(retry.ok, true);
    if (first.ok && retry.ok) {
      assert.equal(retry.data.created, false);
      assert.equal(retry.data.message.id, first.data.message.id);
    }
    assert.equal(await Message.countDocuments(), 1);
    const sentinel = waitForEvent<any>(recipient, ServerEvents.MessageNew);
    const control = await emitAck(sender, ClientEvents.MessageSend, { chatId: String(chat._id), content: "sentinel", clientMessageId: "retry-sentinel" });
    assert.equal(control.ok, true);
    assert.equal((await sentinel).message.clientMessageId, "retry-sentinel");
    assert.deepEqual(senderEvents.map((message) => message.clientMessageId), ["retry-key", "retry-sentinel"]);
  });

  it("C16 deduplicates ten concurrent sends across two devices and emits once per recipient device", async () => {
    const chat = await createChat();
    const sender1 = await connect(A);
    const sender2 = await connect(A);
    const recipient1 = await connect(B);
    const recipient2 = await connect(B);
    let events1 = 0;
    let events2 = 0;
    recipient1.on(ServerEvents.MessageNew, () => events1++);
    recipient2.on(ServerEvents.MessageNew, () => events2++);
    const sends = await Promise.all(Array.from({ length: 10 }, (_, index) => emitAck<any>(index % 2 ? sender1 : sender2, ClientEvents.MessageSend, {
      chatId: String(chat._id), content: `concurrent-${index}`, clientMessageId: "concurrent-key",
    })));
    assert.ok(sends.every((ack) => ack.ok));
    const ids = sends.map((ack) => ack.ok && ack.data.message.id);
    assert.equal(new Set(ids).size, 1);
    assert.equal(await Message.countDocuments(), 1);
    const sentinel1 = waitForEvent<any>(recipient1, ServerEvents.MessageNew);
    const sentinel2 = waitForEvent<any>(recipient2, ServerEvents.MessageNew);
    const control = await emitAck(sender1, ClientEvents.MessageSend, { chatId: String(chat._id), content: "control", clientMessageId: "c16-control" });
    assert.equal(control.ok, true);
    await Promise.all([sentinel1, sentinel2]);
    assert.equal(events1, 2);
    assert.equal(events2, 2);
  });

  it("C17 rejects users without an accepted connection", async () => {
    const chat = await createChat();
    connectedPairs.delete(pairKey(A, B));
    const sender = await connect(A);
    const recipient = await connect(B);
    let deniedEvent = false;
    recipient.on(ServerEvents.MessageNew, (event: any) => { if (event.message.clientMessageId === "c17") deniedEvent = true; });
    const ack = await emitAck(sender, ClientEvents.MessageSend, { chatId: String(chat._id), content: "denied", clientMessageId: "c17" });
    assertAckError(ack, "NOT_CONNECTED", "You can only message your accepted connections");
    assert.equal(await Message.countDocuments(), 0);
    connectedPairs.add(pairKey(A, B));
    const sentinel = waitForEvent<any>(sender, ServerEvents.MessageNew);
    assert.equal((await emitAck(recipient, ClientEvents.MessageSend, { chatId: String(chat._id), content: "sentinel", clientMessageId: "c17-sentinel" })).ok, true);
    assert.equal((await sentinel).message.clientMessageId, "c17-sentinel");
    assert.equal(deniedEvent, false);
  });

  it("C18 rejects nonparticipant and nonexistent chat sends identically", async () => {
    const chat = await createChat();
    const outsider = await connect(C);
    const participantA = await connect(A);
    const forbiddenIds = new Set(["c18-a", "c18-b"]);
    let forbiddenEvent = false;
    participantA.on(ServerEvents.MessageNew, (event: any) => { if (forbiddenIds.has(event.message.clientMessageId)) forbiddenEvent = true; });
    const first = await emitAck(outsider, ClientEvents.MessageSend, { chatId: String(chat._id), content: "no", clientMessageId: "c18-a" });
    const second = await emitAck(outsider, ClientEvents.MessageSend, { chatId: new mongoose.Types.ObjectId().toString(), content: "no", clientMessageId: "c18-b" });
    assert.deepEqual(first, second);
    assertAckError(first, "CHAT_NOT_FOUND", "Chat not found");
    assert.equal(await Message.countDocuments(), 0);
    const controlChat = await createChat(B, C);
    const controlSender = await connect(B);
    const sentinel = waitForEvent<any>(outsider, ServerEvents.MessageNew);
    assert.equal((await emitAck(controlSender, ClientEvents.MessageSend, { chatId: String(controlChat._id), content: "sentinel", clientMessageId: "c18-sentinel" })).ok, true);
    assert.equal((await sentinel).message.clientMessageId, "c18-sentinel");
    assert.equal(forbiddenEvent, false);
  });

  it("C19 rejects sends after the sender account is soft-deleted", async () => {
    const chat = await createChat();
    const sender = await connect(A);
    const recipient = await connect(B);
    let deniedEvent = false;
    recipient.on(ServerEvents.MessageNew, (event: any) => { if (event.message.clientMessageId === "c19") deniedEvent = true; });
    users.find((user) => user.id === A)!.deletedAt = new Date();
    const ack = await emitAck(sender, ClientEvents.MessageSend, { chatId: String(chat._id), content: "deleted sender", clientMessageId: "c19" });
    assertAckError(ack, "UNAUTHORIZED", "Unauthorized");
    assert.equal(await Message.countDocuments(), 0);
    users.find((user) => user.id === A)!.deletedAt = null;
    const sentinel = waitForEvent<any>(sender, ServerEvents.MessageNew);
    assert.equal((await emitAck(recipient, ClientEvents.MessageSend, { chatId: String(chat._id), content: "sentinel", clientMessageId: "c19-sentinel" })).ok, true);
    assert.equal((await sentinel).message.clientMessageId, "c19-sentinel");
    assert.equal(deniedEvent, false);
  });

  it("C20 rejects a send when the connection repository says accepted but the recipient is soft-deleted", async () => {
    const chat = await createChat();
    users.find((user) => user.id === B)!.deletedAt = new Date();
    const sender = await connect(A);
    const senderDevice = await connect(A);
    let deniedEvent = false;
    senderDevice.on(ServerEvents.MessageNew, (event: any) => { if (event.message.clientMessageId === "c20") deniedEvent = true; });
    const ack = await emitAck(sender, ClientEvents.MessageSend, { chatId: String(chat._id), content: "deleted recipient", clientMessageId: "c20" });
    assertAckError(ack, "NOT_CONNECTED");
    assert.equal(await Message.countDocuments(), 0);
    assert.equal((await Chat.findById(chat._id).lean())?.last_message, null);
    const controlChat = await createChat(A, C);
    const otherUser = await connect(C);
    const sentinel = waitForEvent<any>(senderDevice, ServerEvents.MessageNew);
    assert.equal((await emitAck(otherUser, ClientEvents.MessageSend, { chatId: String(controlChat._id), content: "sentinel", clientMessageId: "c20-sentinel" })).ok, true);
    assert.equal((await sentinel).message.clientMessageId, "c20-sentinel");
    assert.equal(deniedEvent, false);
  });

  it("C21 maps unexpected dependency errors generically and keeps the socket usable", async () => {
    const chat = await createChat();
    const sender = await connect(A);
    throwConnection = new Error("private database details");
    const failed = await emitAck(sender, ClientEvents.MessageSend, { chatId: String(chat._id), content: "failure", clientMessageId: "c21-fail" });
    assertAckError(failed, "INTERNAL_ERROR", "Internal server error");
    throwConnection = undefined;
    const recovered = await emitAck(sender, ClientEvents.MessageSend, { chatId: String(chat._id), content: "works", clientMessageId: "c21-ok" });
    assert.equal(recovered.ok, true);
  });

  it("C22 keeps a persisted send successful when updateLastMessage throws once", async () => {
    const chat = await createChat();
    const sender = await connect(A);
    const originalUpdateOne = Chat.updateOne;
    let threw = false;
    (Chat as any).updateOne = async (...args: unknown[]) => {
      if (!threw) { threw = true; throw new Error("preview update failure"); }
      return (originalUpdateOne as any).apply(Chat, args);
    };
    const originalError = console.error;
    console.error = () => {};
    try {
      const ack = await emitAck<any>(sender, ClientEvents.MessageSend, { chatId: String(chat._id), content: "saved anyway", clientMessageId: "c22" });
      assert.equal(ack.ok, true);
      assert.equal(await Message.countDocuments({ chat_id: chat._id }), 1);
    } finally {
      (Chat as any).updateOne = originalUpdateOne;
      console.error = originalError;
    }
  });

  it("D23 marks incoming messages read and notifies the sender", async () => {
    const chat = await createChat();
    const reader = await connect(B);
    const sender = await connect(A);
    const incoming = await Message.create({ chat_id: chat._id, sender_id: A, content: "incoming" });
    const notification = waitForEvent<any>(sender, ServerEvents.MessageRead);
    const ack = await emitAck(reader, ClientEvents.MessageRead, { chatId: String(chat._id) });
    assert.deepEqual(ack, { ok: true, data: { updated: true } });
    assert.deepEqual(await notification, { chatId: String(chat._id), readerId: B });
    const stored = await Message.findById(incoming._id).lean();
    assert.equal(stored?.is_read, true);
    assert.ok(stored?.read_at instanceof Date);
  });

  it("D24 returns updated false for a repeated read and emits no duplicate notification", async () => {
    const chat = await createChat();
    const reader = await connect(B);
    const sender = await connect(A);
    await Message.create({ chat_id: chat._id, sender_id: A, content: "first" });
    const firstEvent = waitForEvent(sender, ServerEvents.MessageRead);
    assert.deepEqual(await emitAck(reader, ClientEvents.MessageRead, { chatId: String(chat._id) }), { ok: true, data: { updated: true } });
    await firstEvent;
    let notifications = 0;
    sender.on(ServerEvents.MessageRead, () => notifications++);
    assert.deepEqual(await emitAck(reader, ClientEvents.MessageRead, { chatId: String(chat._id) }), { ok: true, data: { updated: false } });
    await Message.create({ chat_id: chat._id, sender_id: A, content: "sentinel incoming" });
    const sentinel = waitForEvent<any>(sender, ServerEvents.MessageRead);
    await emitAck(reader, ClientEvents.MessageRead, { chatId: String(chat._id) });
    assert.equal((await sentinel).readerId, B);
    assert.equal(notifications, 1);
  });

  it("D25 never marks the reader's own messages as read", async () => {
    const chat = await createChat();
    const reader = await connect(B);
    const own = await Message.create({ chat_id: chat._id, sender_id: B, content: "own" });
    const ack = await emitAck(reader, ClientEvents.MessageRead, { chatId: String(chat._id) });
    assert.deepEqual(ack, { ok: true, data: { updated: false } });
    assert.equal((await Message.findById(own._id).lean())?.is_read, false);
  });

  it("D26 rejects outsider, deleted account, and invalid read payloads", async () => {
    const outsider = await connect(C);
    const chat = await createChat();
    assertAckError(await emitAck(outsider, ClientEvents.MessageRead, { chatId: String(chat._id) }), "CHAT_NOT_FOUND");
    const user = await connect(A);
    users.find((item) => item.id === A)!.deletedAt = new Date();
    assertAckError(await emitAck(user, ClientEvents.MessageRead, { chatId: String(chat._id) }), "UNAUTHORIZED");
    users.find((item) => item.id === A)!.deletedAt = null;
    assertAckError(await emitAck(outsider, ClientEvents.MessageRead, { chatId: "bad" }), "VALIDATION_ERROR");
    assert.equal(await Message.countDocuments(), 0);
  });

  it("E27 keeps the remaining device in the user room after its sibling disconnects", async () => {
    const chat = await createChat();
    const sender1 = await connect(A);
    const sender2 = await connect(A);
    const recipient = await connect(B);
    const disconnected = waitForEvent(sender1, "disconnect");
    sender1.disconnect();
    await disconnected;
    const next = waitForEvent<any>(sender2, ServerEvents.MessageNew);
    const ack = await emitAck(recipient, ClientEvents.MessageSend, { chatId: String(chat._id), content: "still online", clientMessageId: "e27" });
    assert.equal(ack.ok, true);
    assert.equal((await next).message.clientMessageId, "e27");
  });

  it("E28 rejoins the personal room on reconnect and offline messages remain queryable", async () => {
    const chat = await createChat();
    const reconnecting = await connect(A);
    const sender = await connect(B);
    const down = waitForEvent(reconnecting, "disconnect");
    reconnecting.disconnect();
    await down;
    const offlineAck = await emitAck(sender, ClientEvents.MessageSend, { chatId: String(chat._id), content: "while offline", clientMessageId: "e28-offline" });
    assert.equal(offlineAck.ok, true);
    const restored = await connect(A);
    const newEvent = waitForEvent<any>(restored, ServerEvents.MessageNew);
    const onlineAck = await emitAck(sender, ClientEvents.MessageSend, { chatId: String(chat._id), content: "after reconnect", clientMessageId: "e28-online" });
    assert.equal(onlineAck.ok, true);
    assert.equal((await newEvent).message.clientMessageId, "e28-online");
    const page = await getMessages(A, String(chat._id));
    assert.deepEqual(page.messages.map((message) => message.clientMessageId).sort(), ["e28-offline", "e28-online"]);
  });

  it("E29 remains usable after validation, auth, and internal errors", async () => {
    const chat = await createChat();
    const sender = await connect(A);
    assertAckError(await emitAck(sender, ClientEvents.MessageSend, { chatId: String(chat._id), content: "bad", clientMessageId: "e29", senderId: B }), "VALIDATION_ERROR");
    users.find((user) => user.id === A)!.deletedAt = new Date();
    assertAckError(await emitAck(sender, ClientEvents.MessageSend, { chatId: String(chat._id), content: "auth", clientMessageId: "e29-auth" }), "UNAUTHORIZED");
    users.find((user) => user.id === A)!.deletedAt = null;
    throwConnection = new Error("temporary");
    assertAckError(await emitAck(sender, ClientEvents.MessageSend, { chatId: String(chat._id), content: "internal", clientMessageId: "e29-internal" }), "INTERNAL_ERROR");
    throwConnection = undefined;
    assert.equal((await emitAck(sender, ClientEvents.MessageSend, { chatId: String(chat._id), content: "valid", clientMessageId: "e29-valid" })).ok, true);
  });

  it("E30 keeps unrelated user C outside A-B message and read events", async () => {
    const chat = await createChat(A, B);
    const sender = await connect(A);
    const reader = await connect(B);
    const outsider = await connect(C);
    const forbiddenMessageIds = new Set<string>();
    const forbiddenReadChats = new Set<string>();
    outsider.on(ServerEvents.MessageNew, (payload: any) => { if (payload.message.clientMessageId !== "e30-message-sentinel") forbiddenMessageIds.add(payload.message.id); });
    outsider.on(ServerEvents.MessageRead, (payload: any) => { if (payload.chatId !== "e30-read-sentinel") forbiddenReadChats.add(payload.chatId); });
    const received = waitForEvent<any>(reader, ServerEvents.MessageNew);
    const sent = await emitAck(sender, ClientEvents.MessageSend, { chatId: String(chat._id), content: "private", clientMessageId: "e30" });
    assert.equal(sent.ok, true);
    const message = await received;
    await Message.create({ chat_id: chat._id, sender_id: A, content: "read me" });
    const readNotice = waitForEvent<any>(sender, ServerEvents.MessageRead);
    await emitAck(reader, ClientEvents.MessageRead, { chatId: String(chat._id) });
    await readNotice;
    const sentinelChat = await createChat(A, C);
    const sentinel = waitForEvent<any>(outsider, ServerEvents.MessageNew);
    const control = await emitAck(sender, ClientEvents.MessageSend, { chatId: String(sentinelChat._id), content: "sentinel", clientMessageId: "e30-message-sentinel" });
    assert.equal(control.ok, true);
    await sentinel;
    assert.equal(forbiddenMessageIds.has(message.message.id), false);
    const thirdUserMessage = await Message.create({ chat_id: sentinelChat._id, sender_id: C, content: "read sentinel" });
    const readSentinel = waitForEvent<any>(outsider, ServerEvents.MessageRead);
    await emitAck(sender, ClientEvents.MessageRead, { chatId: String(sentinelChat._id) });
    assert.equal((await readSentinel).chatId, String(sentinelChat._id));
    assert.ok(thirdUserMessage);
    assert.equal(forbiddenReadChats.has(String(chat._id)), false);
  });

  it("A6 stores exp in milliseconds on the authenticated server socket", async () => {
    const exp = Math.floor(Date.now() / 1000) + 120;
    const signed = jwt.sign({ userId: A, role: "student", exp }, process.env.JWT_SECRET!);
    const connected = await connectSocket(client(signed));
    const serverSocket = io.sockets.sockets.get(connected.id);
    assert.ok(serverSocket);
    assert.equal(serverSocket.data.user.expiresAt, exp * 1000);
  });

  it("A7 accepts a token without exp and the sweeper never expires it", async () => {
    const signed = jwt.sign({ userId: A, role: "student" }, process.env.JWT_SECRET!);
    const socket = await connectSocket(client(signed));
    assert.equal(io.sockets.sockets.get(socket.id)?.data.user.expiresAt, undefined);
    await sweepSocketSessions(io, Date.now() + 86_400_000);
    assert.equal(socket.connected, true);
    const chat = await createChat(A, B);
    const recipient = await connect(B);
    const received = waitForEvent<any>(recipient, ServerEvents.MessageNew);
    const ack = await emitAck(socket, ClientEvents.MessageSend, { chatId: String(chat._id), content: "no-exp sentinel", clientMessageId: "a7" });
    assert.equal(ack.ok, true);
    assert.equal((await received).message.clientMessageId, "a7");
  });

  it("A8 rejects garbage JWT payloads as Unauthorized", async () => {
    const error = await connectError(client("eyJhbGciOiJIUzI1NiJ9.%%%not-json%%%.signature"));
    assert.equal(error.message, "Unauthorized");
  });

  it("A9 permits message:send and message:read on a token that has not expired", async () => {
    const chat = await createChat(A, B);
    const exp = Math.floor(Date.now() / 1000) + 120;
    const sender = await connectSocket(client(jwt.sign({ userId: A, role: "student", exp }, process.env.JWT_SECRET!)));
    const reader = await connectSocket(client(jwt.sign({ userId: B, role: "student", exp }, process.env.JWT_SECRET!)));

    const delivered = waitForEvent<any>(reader, ServerEvents.MessageNew);
    const sent = await emitAck<any>(sender, ClientEvents.MessageSend, {
      chatId: String(chat._id), content: "valid session send", clientMessageId: "a9-valid-send",
    });
    assert.equal(sent.ok, true);
    if (sent.ok) assert.equal(sent.data.created, true);
    const message = await delivered;
    assert.equal(message.message.clientMessageId, "a9-valid-send");

    const readNotice = waitForEvent<any>(sender, ServerEvents.MessageRead);
    const read = await emitAck(reader, ClientEvents.MessageRead, { chatId: String(chat._id) });
    assert.deepEqual(read, { ok: true, data: { updated: true } });
    assert.deepEqual(await readNotice, { chatId: String(chat._id), readerId: B });
  });

  it("A10 rejects message:send after expiry, emits no expired message, and keeps a fresh sibling usable", async (t) => {
    const chat = await createChat(A, B);
    const exp = Math.floor(Date.now() / 1000) + 2;
    const expired = await connectSocket(client(jwt.sign({ userId: A, role: "student", exp }, process.env.JWT_SECRET!)));
    const freshSibling = await connect(A);
    const recipient = await connect(B);
    const expiredMessageId = "a10-expired-send";
    const seenMessageIds: string[] = [];
    recipient.on(ServerEvents.MessageNew, (event: any) => seenMessageIds.push(event.message.clientMessageId));

    // Freeze Date only after the real handshake, then move it to the JWT expiry instant.
    t.mock.timers.enable({ apis: ["Date"], now: new Date() });
    t.mock.timers.setTime(exp * 1000);
    // Make the controlled wall clock visible to Socket.IO's network callback context too.
    t.mock.method(Date, "now", () => exp * 1000);
    const authExpired = waitForEvent(expired, ServerEvents.AuthExpired);
    const disconnected = waitForEvent(expired, "disconnect");
    let expiredAck: Ack | undefined;
    let disconnectReason: string | undefined;
    expired.once("disconnect", (reason) => { disconnectReason = reason; });
    expired.emit(ClientEvents.MessageSend, {
      chatId: String(chat._id), content: "must not persist", clientMessageId: expiredMessageId,
    }, (ack: Ack) => { expiredAck = ack; });

    await Promise.all([authExpired, disconnected]);
    assert.equal(expired.connected, false);
    assert.equal(disconnectReason, "io server disconnect");
    assert.equal(await Message.countDocuments({ chat_id: chat._id }), 0);

    const freshSend = waitForEvent<any>(recipient, ServerEvents.MessageNew);
    const freshAck = await emitAck<any>(freshSibling, ClientEvents.MessageSend, {
      chatId: String(chat._id), content: "fresh sibling send", clientMessageId: "a10-fresh-send",
    });
    assert.equal(freshAck.ok, true);
    assert.equal(freshSibling.connected, true);
    assert.equal((await freshSend).message.clientMessageId, "a10-fresh-send");
    assert.equal(seenMessageIds.includes(expiredMessageId), false);
    assert.equal(seenMessageIds.includes("a10-fresh-send"), true);

    // The server may disconnect before an ack reaches the client. Check its code only if observed.
    if (expiredAck) assertAckError(expiredAck, "UNAUTHORIZED", "Unauthorized");
    t.diagnostic(`Expired send ack observed by test end: ${expiredAck ? "yes (UNAUTHORIZED)" : "no"}`);
  });

  it("A11 rejects message:read after expiry without marking or notifying", async (t) => {
    const chat = await createChat(A, B);
    const incoming = await Message.create({ chat_id: chat._id, sender_id: A, content: "unread at expiry" });
    const exp = Math.floor(Date.now() / 1000) + 2;
    const expiredReader = await connectSocket(client(jwt.sign({ userId: B, role: "student", exp }, process.env.JWT_SECRET!)));
    const sender = await connect(A);
    const readEvents: Array<{ chatId: string; readerId: string }> = [];
    sender.on(ServerEvents.MessageRead, (event: { chatId: string; readerId: string }) => readEvents.push(event));

    // Moving Date to exp after handshake avoids waiting for wall-clock expiry.
    t.mock.timers.enable({ apis: ["Date"], now: new Date() });
    t.mock.timers.setTime(exp * 1000);
    t.mock.method(Date, "now", () => exp * 1000);
    const authExpired = waitForEvent(expiredReader, ServerEvents.AuthExpired);
    const disconnected = waitForEvent(expiredReader, "disconnect");
    let expiredAck: Ack | undefined;
    let disconnectReason: string | undefined;
    expiredReader.once("disconnect", (reason) => { disconnectReason = reason; });
    expiredReader.emit(ClientEvents.MessageRead, { chatId: String(chat._id) }, (ack: Ack) => { expiredAck = ack; });

    await Promise.all([authExpired, disconnected]);
    assert.equal(expiredReader.connected, false);
    assert.equal(disconnectReason, "io server disconnect");
    assert.equal((await Message.findById(incoming._id).lean())?.is_read, false);
    assert.equal(readEvents.some((event) => event.chatId === String(chat._id) && event.readerId === B), false);

    // A separate read is the positive sentinel proving the event listener is live.
    const controlChat = await createChat(A, C);
    const controlMessage = await Message.create({ chat_id: controlChat._id, sender_id: A, content: "read sentinel" });
    const controlReader = await connect(C);
    const sentinelRead = waitForEvent<any>(sender, ServerEvents.MessageRead);
    const controlAck = await emitAck(controlReader, ClientEvents.MessageRead, { chatId: String(controlChat._id) });
    assert.deepEqual(controlAck, { ok: true, data: { updated: true } });
    assert.deepEqual(await sentinelRead, { chatId: String(controlChat._id), readerId: C });
    assert.equal((await Message.findById(controlMessage._id).lean())?.is_read, true);
    assert.equal(readEvents.some((event) => event.chatId === String(chat._id) && event.readerId === B), false);

    if (expiredAck) assertAckError(expiredAck, "UNAUTHORIZED", "Unauthorized");
    t.diagnostic(`Expired read ack observed by test end: ${expiredAck ? "yes (UNAUTHORIZED)" : "no"}`);
  });

  it("B4 emits auth:expired before server disconnect at exp plus one and reports the reason", async () => {
    const exp = Math.floor(Date.now() / 1000) + 10;
    const socket = await connectSocket(client(jwt.sign({ userId: A, role: "student", exp }, process.env.JWT_SECRET!)));
    const order: string[] = [];
    let disconnectReason: string | undefined;
    socket.once(ServerEvents.AuthExpired, () => order.push("auth:expired"));
    socket.once("disconnect", (reason) => { order.push("disconnect"); disconnectReason = reason; });
    const down = waitForEvent(socket, "disconnect");
    await sweepSocketSessions(io, exp * 1000 + 1);
    await down;
    assert.deepEqual(order, ["auth:expired", "disconnect"]);
    assert.equal(disconnectReason, "io server disconnect");
  });

  it("B5 keeps a pre-expiry socket usable for a later send", async () => {
    const exp = Math.floor(Date.now() / 1000) + 60;
    const socket = await connectSocket(client(jwt.sign({ userId: A, role: "student", exp }, process.env.JWT_SECRET!)));
    await sweepSocketSessions(io, exp * 1000 - 1);
    assert.equal(socket.connected, true);
    const chat = await createChat(A, B);
    const recipient = await connect(B);
    const received = waitForEvent<any>(recipient, ServerEvents.MessageNew);
    const ack = await emitAck(socket, ClientEvents.MessageSend, { chatId: String(chat._id), content: "pre-exp sentinel", clientMessageId: "b5" });
    assert.equal(ack.ok, true);
    assert.equal((await received).message.clientMessageId, "b5");
  });

  it("B6 treats now equal to exp milliseconds as expired", async () => {
    const exp = Math.floor(Date.now() / 1000) + 10;
    const socket = await connectSocket(client(jwt.sign({ userId: A, role: "student", exp }, process.env.JWT_SECRET!)));
    const down = waitForEvent(socket, "disconnect");
    await sweepSocketSessions(io, exp * 1000);
    await down;
    assert.equal(socket.connected, false);
  });

  it("B7 expires one device while its same-user device remains connected", async () => {
    const exp = Math.floor(Date.now() / 1000) + 10;
    const expired = await connectSocket(client(jwt.sign({ userId: A, role: "student", exp }, process.env.JWT_SECRET!)));
    const fresh = await connect(A);
    const down = waitForEvent(expired, "disconnect");
    await sweepSocketSessions(io, exp * 1000);
    await down;
    assert.equal(expired.connected, false);
    assert.equal(fresh.connected, true);
    assert.equal(findManyQueries.length, 1);
    assert.deepEqual(findManyQueries[0].where.id.in, [A]);
  });

  it("B8 reconnects with a fresh token after expiry and can send", async () => {
    const exp = Math.floor(Date.now() / 1000) + 10;
    const expired = await connectSocket(client(jwt.sign({ userId: A, role: "student", exp }, process.env.JWT_SECRET!)));
    const authExpired = waitForEvent(expired, ServerEvents.AuthExpired);
    const down = waitForEvent(expired, "disconnect");
    await sweepSocketSessions(io, exp * 1000);
    await Promise.all([authExpired, down]);
    const restored = await connect(A);
    const recipient = await connect(B);
    const chat = await createChat(A, B);
    const received = waitForEvent<any>(recipient, ServerEvents.MessageNew);
    const ack = await emitAck(restored, ClientEvents.MessageSend, { chatId: String(chat._id), content: "reconnected", clientMessageId: "b8" });
    assert.equal(ack.ok, true);
    assert.equal((await received).message.clientMessageId, "b8");
  });

  it("C9 batches distinct connected user IDs once", async () => {
    await Promise.all([connect(A), connect(A), connect(B), connect(C)]);
    await sweepSocketSessions(io, Date.now());
    assert.equal(findManyQueries.length, 1);
    assert.equal(findManyQueries[0].where.id.in.length, 3);
    assert.deepEqual(new Set(findManyQueries[0].where.id.in), new Set([A, B, C]));

  });

  it("F1 disconnects expired sockets before a sweep database failure and active sockets recover afterward", async () => {
    const chat = await createChat(A, B);
    const exp = Math.floor(Date.now() / 1000) + 10;
    const expired = await connectSocket(client(jwt.sign({ userId: A, role: "student", exp }, process.env.JWT_SECRET!)));
    const active = await connect(B);
    const order: string[] = [];
    expired.once(ServerEvents.AuthExpired, () => order.push("auth:expired"));
    expired.once("disconnect", () => order.push("disconnect"));
    const disconnected = waitForEvent(expired, "disconnect");
    const dbError = new Error("database unavailable");
    throwFindMany = dbError;
    throwFindUnique = dbError;

    await assert.rejects(sweepSocketSessions(io, exp * 1000), dbError);
    await disconnected;
    assert.deepEqual(order, ["auth:expired", "disconnect"]);
    assert.equal(active.connected, true);
    assertAckError(await emitAck(active, ClientEvents.MessageSend, {
      chatId: String(chat._id), content: "outage send", clientMessageId: "f1-outage-send",
    }), "INTERNAL_ERROR");
    assertAckError(await emitAck(active, ClientEvents.MessageRead, { chatId: String(chat._id) }), "INTERNAL_ERROR");

    throwFindMany = undefined;
    throwFindUnique = undefined;
    const recovered = await emitAck(active, ClientEvents.MessageSend, {
      chatId: String(chat._id), content: "recovered send", clientMessageId: "f1-recovered",
    });
    assert.equal(recovered.ok, true);
  });

  it("F2 disconnects deleted-user sockets without auth:expired and removes their room", async () => {
    const chat = await createChat(A, B);
    const deleted1 = await connect(C);
    const deleted2 = await connect(C);
    const activeSender = await connect(A);
    const activeRecipient = await connect(B);
    let expiredEvents = 0;
    let deletedMessageEvents = 0;
    for (const socket of [deleted1, deleted2]) {
      socket.on(ServerEvents.AuthExpired, () => expiredEvents++);
      socket.on(ServerEvents.MessageNew, () => deletedMessageEvents++);
    }
    users.find((user) => user.id === C)!.deletedAt = new Date();
    const downs = [waitForEvent(deleted1, "disconnect"), waitForEvent(deleted2, "disconnect")];
    await sweepSocketSessions(io, Date.now());
    await Promise.all(downs);
    assert.equal(deleted1.connected, false);
    assert.equal(deleted2.connected, false);
    assert.equal(expiredEvents, 0);
    assert.equal(io.sockets.adapter.rooms.get(`user:${C}`)?.size ?? 0, 0);

    const delivered = waitForEvent<any>(activeRecipient, ServerEvents.MessageNew);
    const sent = await emitAck(activeSender, ClientEvents.MessageSend, {
      chatId: String(chat._id), content: "active-user delivery", clientMessageId: "f2-active-delivery",
    });
    assert.equal(sent.ok, true);
    assert.equal((await delivered).message.clientMessageId, "f2-active-delivery");
    io.to(`user:${C}`).emit(ServerEvents.MessageNew, { message: { clientMessageId: "f2-room-check" } });
    assert.equal(deletedMessageEvents, 0);
  });

  it("F3 excludes expired-only users, disconnects deleted users, and deduplicates active users", async () => {
    const exp = Math.floor(Date.now() / 1000) + 10;
    const expiredOnly = await connectSocket(client(jwt.sign({ userId: C, role: "student", exp }, process.env.JWT_SECRET!)));
    const deleted = await connect(A);
    const active1 = await connect(B);
    const active2 = await connect(B);
    users.find((user) => user.id === A)!.deletedAt = new Date();
    const expiryDown = waitForEvent(expiredOnly, "disconnect");
    const deletedDown = waitForEvent(deleted, "disconnect");

    await sweepSocketSessions(io, exp * 1000);
    await Promise.all([expiryDown, deletedDown]);
    assert.equal(expiredOnly.connected, false);
    assert.equal(deleted.connected, false);
    assert.equal(active1.connected, true);
    assert.equal(active2.connected, true);
    assert.equal(findManyQueries.length, 1);
    const queriedIds = findManyQueries[0].where.id.in;
    assert.equal(queriedIds.includes(C), false);
    assert.equal(queriedIds.filter((id) => id === B).length, 1);
    assert.deepEqual(new Set(queriedIds), new Set([A, B]));
  });

  it("D18 presence:query returns accepted online/offline contacts with normalized lastSeen", async () => {
    presenceConnections = [{ requesterId: A, receiverId: B, status: "accepted" }, { requesterId: A, receiverId: C, status: "accepted" }, { requesterId: A, receiverId: D, status: "accepted" }];
    users.find((user) => user.id === B)!.isOnline = true;
    users.find((user) => user.id === B)!.lastSeen = new Date("2026-02-03T04:05:06.000Z");
    users.find((user) => user.id === C)!.isOnline = false;
    users.find((user) => user.id === C)!.lastSeen = new Date("2026-02-04T05:06:07.000Z");
    users.find((user) => user.id === D)!.isOnline = false;
    users.find((user) => user.id === D)!.lastSeen = null;
    const caller = await connect(A);
    const ack = await emitAck<any>(caller, ClientEvents.PresenceQuery, { userIds: [B, C, D] });
    assert.deepEqual(ack, { ok: true, data: { users: [
      { userId: B, online: true, lastSeen: null },
      { userId: C, online: false, lastSeen: "2026-02-04T05:06:07.000Z" },
      { userId: D, online: false, lastSeen: null },
    ] } });
  });

  it("D19 presence:query silently drops non-accepted, deleted, and unknown accounts identically", async () => {
    presenceConnections = [
      { requesterId: A, receiverId: B, status: "accepted" },
      { requesterId: A, receiverId: C, status: "pending" },
      { requesterId: A, receiverId: D, status: "accepted" },
      { requesterId: A, receiverId: F, status: "rejected" },
      { requesterId: E, receiverId: A, status: "removed" },
    ];
    users.find((user) => user.id === D)!.deletedAt = new Date();
    const caller = await connect(A);
    const hidden = await emitAck<any>(caller, ClientEvents.PresenceQuery, { userIds: [C, D, E, F] });
    const unknown = await emitAck<any>(caller, ClientEvents.PresenceQuery, { userIds: ["77777777-7777-4777-8777-777777777777"] });
    assert.deepEqual(hidden, { ok: true, data: { users: [] } });
    assert.deepEqual(hidden, unknown);
  });

  it("D20 validates presence queries and normalizes duplicate uppercase IDs", async () => {
    presenceConnections = [{ requesterId: A, receiverId: B, status: "accepted" }];
    const caller = await connect(A);
    const invalid = [
      {}, { userIds: [] }, { userIds: Array.from({ length: 51 }, () => B) },
      { userIds: ["not-a-uuid"] }, { userIds: [B], extra: true },
    ];
    for (const payload of invalid) assertAckError(await emitAck(caller, ClientEvents.PresenceQuery, payload), "VALIDATION_ERROR");
    const normalized = await emitAck<any>(caller, ClientEvents.PresenceQuery, { userIds: [B, B.toUpperCase()] });
    assert.deepEqual(normalized, { ok: true, data: { users: [{ userId: B, online: false, lastSeen: null }] } });
  });

  it("D21 rejects presence queries after soft deletion and keeps the socket usable", async () => {
    presenceConnections = [{ requesterId: A, receiverId: B, status: "accepted" }];
    const caller = await connect(A);
    users.find((user) => user.id === A)!.deletedAt = new Date();
    assertAckError(await emitAck(caller, ClientEvents.PresenceQuery, { userIds: [B] }), "UNAUTHORIZED");
    assert.equal(caller.connected, true);
    users.find((user) => user.id === A)!.deletedAt = null;
    const chat = await createChat(A, B);
    const recipient = await connect(B);
    const received = waitForEvent<any>(recipient, ServerEvents.MessageNew);
    const send = await emitAck(caller, ClientEvents.MessageSend, { chatId: String(chat._id), content: "query error sentinel", clientMessageId: "d21-sentinel" });
    assert.equal(send.ok, true);
    assert.equal((await received).message.clientMessageId, "d21-sentinel");
  });

  it("D22 presence:query without an ack callback does not crash the socket", async () => {
    presenceConnections = [{ requesterId: A, receiverId: B, status: "accepted" }];
    const caller = await connect(A);
    caller.emit(ClientEvents.PresenceQuery, { userIds: [B] });
    const ack = await emitAck<any>(caller, ClientEvents.PresenceQuery, { userIds: [B] });
    assert.equal(ack.ok, true);
  });

  it("E23-E25 live presence updates reach only accepted contacts once across devices", async () => {
    const previousOrigin = origin;
    const isolatedHttp = createServer();
    const isolatedIo = initSocket(isolatedHttp);
    let isolatedClients: ClientSocket[] = [];
    try {
      await new Promise<void>((resolve) => isolatedHttp.listen(0, "127.0.0.1", resolve));
      const address = isolatedHttp.address();
      assert.ok(address && typeof address !== "string");
      origin = `http://127.0.0.1:${address.port}`;
      connectedPairs = new Set([pairKey(A, B)]);
      presenceConnections = [
        { requesterId: A, receiverId: B, status: "accepted" },
        { requesterId: A, receiverId: C, status: "pending" },
      ];
      const contact = await connect(B);
      const pending = await connect(C);
      const unrelated = await connect(D);
      isolatedClients = [contact, pending, unrelated];
      const contactEvents: any[] = [];
      const pendingEvents: any[] = [];
      const unrelatedEvents: any[] = [];
      contact.on(ServerEvents.PresenceUpdate, (event: any) => contactEvents.push(event));
      pending.on(ServerEvents.PresenceUpdate, (event: any) => pendingEvents.push(event));
      unrelated.on(ServerEvents.PresenceUpdate, (event: any) => unrelatedEvents.push(event));
      const onlineAtContact = waitForEvent<any>(contact, ServerEvents.PresenceUpdate);
      const firstDevice = await connect(A);
      isolatedClients.push(firstDevice);
      assert.deepEqual(await onlineAtContact, { userId: A, online: true, lastSeen: null });
      const secondDevice = await connect(A);
      isolatedClients.push(secondDevice);

      const contactSentinel = waitForEvent<any>(contact, ServerEvents.PresenceUpdate);
      const pendingSentinel = waitForEvent<any>(pending, ServerEvents.PresenceUpdate);
      const unrelatedSentinel = waitForEvent<any>(unrelated, ServerEvents.PresenceUpdate);
      isolatedIo.to(`user:${B}`).emit(ServerEvents.PresenceUpdate, { userId: E, online: true, lastSeen: null });
      isolatedIo.to(`user:${C}`).emit(ServerEvents.PresenceUpdate, { userId: E, online: true, lastSeen: null });
      isolatedIo.to(`user:${D}`).emit(ServerEvents.PresenceUpdate, { userId: E, online: true, lastSeen: null });
      await Promise.all([contactSentinel, pendingSentinel, unrelatedSentinel]);
      assert.equal(contactEvents.filter((event) => event.userId === A).length, 1);
      assert.equal(pendingEvents.filter((event) => event.userId === A).length, 0);
      assert.equal(unrelatedEvents.filter((event) => event.userId === A).length, 0);

      const firstDown = waitForEvent(firstDevice, "disconnect");
      firstDevice.disconnect();
      await firstDown;
      const contactAfterDisconnect = waitForEvent<any>(contact, ServerEvents.PresenceUpdate);
      isolatedIo.to(`user:${B}`).emit(ServerEvents.PresenceUpdate, { userId: D, online: false, lastSeen: "sentinel" });
      await contactAfterDisconnect;
      assert.equal(contactEvents.filter((event) => event.userId === A && event.online === false).length, 0);
      assert.equal(pendingEvents.filter((event) => event.userId === A).length, 0);
      assert.equal(unrelatedEvents.filter((event) => event.userId === A).length, 0);
      assert.equal(secondDevice.connected, true);
    } finally {
      origin = previousOrigin;
      const connected = isolatedClients.filter((socket) => socket.connected);
      const disconnects = connected.map((socket) => waitForEvent(socket, "disconnect"));
      for (const socket of connected) socket.disconnect();
      await Promise.all(disconnects);
      for (const socket of isolatedClients) clients.delete(socket);
      await new Promise<void>((resolve) => isolatedIo.close(() => resolve()));
    }
  });


  it("P1 real initSocket wiring marks A offline and notifies accepted B after grace", async () => {
    await withPresenceServer([P1, P2], async () => {
      presenceConnections = [{ requesterId: P1, receiverId: P2, status: "accepted" }];
      const contact = await connect(P2);
      const onlineNotice = waitForEvent<any>(contact, ServerEvents.PresenceUpdate);
      const firstDevice = await connect(P1);
      assert.deepEqual(await onlineNotice, { userId: P1, online: true, lastSeen: null });

      const offlineNotice = waitForEvent<any>(contact, ServerEvents.PresenceUpdate);
      const disconnected = waitForEvent(firstDevice, "disconnect");
      firstDevice.disconnect();
      await Promise.all([disconnected, offlineNotice]);
      const update = presenceUpdateManyCalls.find((call) => call.where.id === P1 && call.data.isOnline === false);
      assert.ok(update);
      assert.deepEqual(update.where, { id: P1, deletedAt: null });
      assert.ok(update.data.lastSeen instanceof Date);
      const event = await offlineNotice;
      assert.deepEqual(event, { userId: P1, online: false, lastSeen: update.data.lastSeen.toISOString() });
      assert.ok(Number.isFinite(Date.parse(event.lastSeen)));
    });
  });

  it("P2 reconnect inside grace sends no offline update or event", async () => {
    await withPresenceServer([P3, P4], async (testIo) => {
      presenceConnections = [{ requesterId: P3, receiverId: P4, status: "accepted" }];
      const contact = await connect(P4);
      const onlineNotice = waitForEvent<any>(contact, ServerEvents.PresenceUpdate);
      const firstDevice = await connect(P3);
      await onlineNotice;
      let offlineEvents = 0;
      contact.on(ServerEvents.PresenceUpdate, (event: any) => {
        if (event.userId === P3 && event.online === false) offlineEvents++;
      });
      const disconnected = waitForEvent(firstDevice, "disconnect");
      firstDevice.disconnect();
      await disconnected;
      const reconnected = await connect(P3);

      const sentinel = waitForEvent<any>(contact, ServerEvents.PresenceUpdate);
      testIo.to(`user:${P4}`).emit(ServerEvents.PresenceUpdate, { userId: P7, online: true, lastSeen: null });
      assert.deepEqual(await sentinel, { userId: P7, online: true, lastSeen: null });
      assert.equal(offlineEvents, 0);
      assert.equal(presenceUpdateManyCalls.filter((call) => call.where.id === P3 && call.data.isOnline === false).length, 0);
      assert.equal(presenceUpdateManyCalls.filter((call) => call.where.id === P3 && call.data.isOnline === true).length, 1);
      assert.equal(reconnected.connected, true);
    });
  });

  it("P3 emits one offline transition only after both devices disconnect", async () => {
    await withPresenceServer([P5, P6], async (testIo) => {
      presenceConnections = [{ requesterId: P5, receiverId: P6, status: "accepted" }];
      const contact = await connect(P6);
      const onlineNotice = waitForEvent<any>(contact, ServerEvents.PresenceUpdate);
      const device1 = await connect(P5);
      await onlineNotice;
      const device2 = await connect(P5);
      const offlineEvents: any[] = [];
      contact.on(ServerEvents.PresenceUpdate, (event: any) => {
        if (event.userId === P5 && event.online === false) offlineEvents.push(event);
      });

      const firstDown = waitForEvent(device1, "disconnect");
      device1.disconnect();
      await firstDown;
      const sentinel = waitForEvent<any>(contact, ServerEvents.PresenceUpdate);
      testIo.to(`user:${P6}`).emit(ServerEvents.PresenceUpdate, { userId: P7, online: true, lastSeen: null });
      await sentinel;
      assert.equal(offlineEvents.length, 0);
      assert.equal(presenceUpdateManyCalls.filter((call) => call.where.id === P5 && call.data.isOnline === false).length, 0);

      const offlineNotice = waitForEvent<any>(contact, ServerEvents.PresenceUpdate);
      const secondDown = waitForEvent(device2, "disconnect");
      device2.disconnect();
      await Promise.all([secondDown, offlineNotice]);
      assert.equal(offlineEvents.length, 1);
      assert.equal(offlineEvents[0].online, false);
      assert.equal(presenceUpdateManyCalls.filter((call) => call.where.id === P5 && call.data.isOnline === false).length, 1);
    });
  });

  it("P4 expiry sweep follows initSocket's real disconnect listener into offline presence", async () => {
    await withPresenceServer([P7, P8], async (testIo) => {
      presenceConnections = [{ requesterId: P7, receiverId: P8, status: "accepted" }];
      const contact = await connect(P8);
      const exp = Math.floor(Date.now() / 1000) + 60;
      const onlineNotice = waitForEvent<any>(contact, ServerEvents.PresenceUpdate);
      const expired = await connectSocket(client(jwt.sign({ userId: P7, role: "student", exp }, process.env.JWT_SECRET!)));
      assert.deepEqual(await onlineNotice, { userId: P7, online: true, lastSeen: null });

      const authExpired = waitForEvent(expired, ServerEvents.AuthExpired);
      const disconnected = waitForEvent(expired, "disconnect");
      const offlineNotice = waitForEvent<any>(contact, ServerEvents.PresenceUpdate);
      await sweepSocketSessions(testIo, exp * 1000);
      const [, , offlinePayload] = await Promise.all([authExpired, disconnected, offlineNotice]);
      const update = presenceUpdateManyCalls.find((call) => call.where.id === P7 && call.data.isOnline === false);
      assert.ok(update);
      assert.ok(update.data.lastSeen instanceof Date);
      assert.deepEqual(offlinePayload, { userId: P7, online: false, lastSeen: update.data.lastSeen.toISOString() });
      assert.equal(presenceUpdateManyCalls.filter((call) => call.where.id === P7 && call.data.isOnline === false).length, 1);
    });
  });
});
