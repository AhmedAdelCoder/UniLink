import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ZodError } from "zod";
import { AppError } from "../src/utils/AppError.js";
import { SocketErrorCode } from "../src/modules/chat/sockets/chat.events.js";
import { chatRefPayloadSchema, sendMessagePayloadSchema } from "../src/modules/chat/sockets/chat.socket.validation.js";
import { handle, toSocketError } from "../src/modules/chat/sockets/socket.utils.js";

const goodChatId = "0123456789abcdef01234567";

describe("Socket.IO validation and error helpers", () => {
  it("F31 strictly validates chat and send payloads, trimming content and enforcing limits", () => {
    assert.equal(chatRefPayloadSchema.safeParse({ chatId: goodChatId }).success, true);
    for (const payload of [
      { chatId: goodChatId, senderId: "spoof" },
      { chatId: goodChatId, unknown: true },
      {},
      { chatId: "invalid" },
    ]) assert.equal(chatRefPayloadSchema.safeParse(payload).success, false);

    const valid = sendMessagePayloadSchema.safeParse({ chatId: goodChatId, content: "  hello  ", clientMessageId: " key " });
    assert.equal(valid.success, true);
    if (valid.success) assert.deepEqual(valid.data, { chatId: goodChatId, content: "hello", clientMessageId: "key" });
    for (const payload of [
      { chatId: goodChatId, content: "x" },
      { chatId: goodChatId, content: "x", clientMessageId: "" },
      { chatId: goodChatId, content: "", clientMessageId: "key" },
      { chatId: goodChatId, content: " ", clientMessageId: "key" },
      { chatId: goodChatId, content: "x".repeat(2_001), clientMessageId: "key" },
      { chatId: goodChatId, content: "x", clientMessageId: "key", senderId: "spoof" },
      { chatId: goodChatId, content: "x", clientMessageId: "key", other: true },
      { chatId: "bad", content: "x", clientMessageId: "key" },
    ]) assert.equal(sendMessagePayloadSchema.safeParse(payload).success, false);
    assert.equal(sendMessagePayloadSchema.safeParse({ chatId: goodChatId, content: "x".repeat(2_000), clientMessageId: "key" }).success, true);
  });

  it("F32 maps ZodError, AppError status codes, and plain Error without leaking unexpected details", () => {
    const zod = (() => { try { chatRefPayloadSchema.parse({}); } catch (error) { return error; } })();
    assert.ok(zod instanceof ZodError);
    assert.equal(toSocketError(zod).code, SocketErrorCode.ValidationError);
    assert.equal(toSocketError(new AppError("bad input", 400)).code, SocketErrorCode.ValidationError);
    assert.equal(toSocketError(new AppError("auth required", 401)).code, SocketErrorCode.Unauthorized);
    assert.equal(toSocketError(new AppError("not connected", 403)).code, SocketErrorCode.NotConnected);
    assert.equal(toSocketError(new AppError("missing chat", 404)).code, SocketErrorCode.ChatNotFound);

    const original = console.error;
    const logs: unknown[][] = [];
    console.error = (...args: unknown[]) => { logs.push(args); };
    try {
      assert.deepEqual(toSocketError(new AppError("unexpected app failure", 500)), { code: SocketErrorCode.InternalError, message: "unexpected app failure" });
      assert.deepEqual(toSocketError(new Error("private database detail")), { code: SocketErrorCode.InternalError, message: "Internal server error" });
      assert.equal(logs.length, 2);
    } finally {
      console.error = original;
    }
  });

  it("F33 handles missing ack callbacks and never invokes the function for invalid payloads", async () => {
    let calls = 0;
    const wrapped = handle(chatRefPayloadSchema, async ({ chatId }) => {
      calls++;
      return { chatId };
    });
    await assert.doesNotReject(wrapped({ chatId: goodChatId }));
    assert.equal(calls, 1);
    await assert.doesNotReject(wrapped({ chatId: "invalid" }));
    assert.equal(calls, 1);
  });
});
