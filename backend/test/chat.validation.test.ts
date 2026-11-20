import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  chatIdParamsSchema,
  createChatBodySchema,
  listChatsQuerySchema,
  listMessagesQuerySchema,
  sendMessageBodySchema,
} from "../src/modules/chat/validation/chat.validation.js";

describe("Chat request validation schemas", () => {
  it("accepts only 24-character hexadecimal chat IDs", () => {
    assert.equal(chatIdParamsSchema.safeParse({ chatId: "0123456789abcdef01234567" }).success, true);
    for (const chatId of ["a".repeat(23), "a".repeat(25), "g".repeat(24), ""]) {
      assert.equal(chatIdParamsSchema.safeParse({ chatId }).success, false);
    }
  });
  it("requires a UUID userId and rejects missing or extra body properties", () => {
    const valid = { userId: "11111111-1111-4111-8111-111111111111" };
    assert.equal(createChatBodySchema.safeParse(valid).success, true);
    assert.equal(createChatBodySchema.safeParse({ userId: "not-a-uuid" }).success, false);
    assert.equal(createChatBodySchema.safeParse({}).success, false);
    assert.equal(createChatBodySchema.safeParse({ ...valid, extra: true }).success, false);
  });
  it("coerces valid limits and rejects values outside the integer 1 to 50 range", () => {
    for (const limit of ["1", "50", 1, 50]) {
      assert.equal(listChatsQuerySchema.safeParse({ limit }).success, true);
    }
    for (const limit of [0, 51, -1, "abc", "", 1.5]) {
      assert.equal(listChatsQuerySchema.safeParse({ limit }).success, false, `unexpected valid limit ${String(limit)}`);
    }
    assert.equal(listChatsQuerySchema.safeParse({}).success, true);
    assert.equal(listMessagesQuerySchema.safeParse({}).success, true);
  });
  it("validates optional message cursors", () => {
    assert.equal(listMessagesQuerySchema.safeParse({ cursor: "" }).success, false);
    assert.equal(listMessagesQuerySchema.safeParse({ cursor: "x".repeat(201) }).success, false);
    assert.equal(listMessagesQuerySchema.safeParse({ cursor: "valid-cursor" }).success, true);
  });
  it("trims and bounds message content and client IDs, rejecting extra fields", () => {
    const parsed = sendMessageBodySchema.parse({ content: "  hello  ", clientMessageId: "  key  " });
    assert.deepEqual(parsed, { content: "hello", clientMessageId: "key" });
    assert.equal(sendMessageBodySchema.safeParse({ content: " " }).success, false);
    assert.equal(sendMessageBodySchema.safeParse({ content: "" }).success, false);
    assert.equal(sendMessageBodySchema.safeParse({ content: "x".repeat(2_001) }).success, false);
    assert.equal(sendMessageBodySchema.safeParse({ content: "x".repeat(2_000) }).success, true);
    assert.equal(sendMessageBodySchema.safeParse({ content: "ok", clientMessageId: "x".repeat(64) }).success, true);
    assert.equal(sendMessageBodySchema.safeParse({ content: "ok", clientMessageId: "x".repeat(65) }).success, false);
    assert.equal(sendMessageBodySchema.safeParse({ content: "ok", senderId: "spoof" }).success, false);
  });
});
