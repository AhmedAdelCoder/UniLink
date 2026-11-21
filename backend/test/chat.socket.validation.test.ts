import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chatRefPayloadSchema, sendMessagePayloadSchema } from "../src/modules/chat/sockets/chat.socket.validation.js";

describe("Chat Socket.IO payload validation", () => {
  it("accepts a valid chat reference and rejects malformed IDs", () => {
    assert.equal(chatRefPayloadSchema.safeParse({ chatId: "0123456789abcdef01234567" }).success, true);
    assert.equal(chatRefPayloadSchema.safeParse({ chatId: "invalid" }).success, false);
    assert.equal(chatRefPayloadSchema.safeParse({ chatId: "0123456789abcdef01234567", extra: true }).success, false);
  });

  it("requires an idempotency key and rejects client-controlled sender identity", () => {
    const valid = { chatId: "0123456789abcdef01234567", content: " hello ", clientMessageId: " key " };
    const parsed = sendMessagePayloadSchema.safeParse(valid);
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.content, "hello");
      assert.equal(parsed.data.clientMessageId, "key");
    }
    assert.equal(sendMessagePayloadSchema.safeParse({ chatId: valid.chatId, content: valid.content }).success, false);
    assert.equal(sendMessagePayloadSchema.safeParse({ ...valid, senderId: "another-user" }).success, false);
  });
});
