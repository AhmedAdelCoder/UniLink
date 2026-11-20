import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { Types } from "mongoose";
import * as repo from "../src/modules/chat/repositories/chat.repository.js";
import { ChatMockDb } from "./fixtures/chatMockDb.js";

describe("Chat repository", () => {
  const db = new ChatMockDb();
  before(() => db.install());
  after(() => db.restore());
  beforeEach(() => db.reset());

  it("returns null for an invalid chat ID without querying", async () => {
    assert.equal(await repo.findChatById("bad-id"), null);
    assert.equal(db.calls.length, 0);
  });
  it("finds a valid chat by ID", async () => { const c = db.addChat(); assert.equal(await repo.findChatById(String(c._id)), c); });
  it("finds a pair regardless of order and normalizes IDs", async () => {
    const c = db.addChat(); assert.equal(await repo.findChatBetweenUsers(" BOB ", "ALICE"), c);
  });
  it("creates normalized chat and returns the existing chat for reversed duplicates", async () => {
    const a = await repo.createChat(" ZED ", "Alice"); const b = await repo.createChat("alice", "zed");
    assert.equal(a, b); assert.equal(a?.user_1_id, "alice"); assert.equal(a?.user_2_id, "zed"); assert.equal(db.chats.size, 1);
  });
  it("returns user chats in the repository's sorted query", async () => { const c = db.addChat(); assert.deepEqual(await repo.getUserChats(" ALICE "), [c]); assert.deepEqual(db.calls[0].args[0], { $or: [{ user_1_id: "alice" }, { user_2_id: "alice" }] }); });
  it("paginates newest first and returns a cursor when more messages exist", async () => {
    const c = db.addChat(); for (let i = 0; i < 3; i++) db.addMessage(String(c._id), { created_at: new Date(1000 + i * 1000) });
    const page1 = await repo.getChatMessages(String(c._id), { limit: 2 });
    assert.equal(page1.messages.length, 2); assert.ok(page1.nextCursor); assert.equal(page1.messages[0].created_at.getTime(), 3000);
    const page2 = await repo.getChatMessages(String(c._id), { limit: 2, cursor: page1.nextCursor! });
    assert.equal(page2.messages.length, 1); assert.equal(page2.nextCursor, null);
  });
  it("rejects malformed message cursors", async () => { const c = db.addChat(); await assert.rejects(repo.getChatMessages(String(c._id), { cursor: "not-a-cursor" }), /Invalid cursor/); });
  it("marks only unread messages from the specified sender as read", async () => {
    const c = db.addChat(); const m = db.addMessage(String(c._id), { sender_id: "bob" }); db.addMessage(String(c._id), { sender_id: "alice" });
    assert.equal(await repo.markMessagesAsRead(String(c._id), " BOB "), 1); assert.equal(m.is_read, true); assert.ok(m.read_at instanceof Date);
  });
  it("counts unread messages by chat while excluding the requesting user", async () => {
    const c1 = db.addChat(); const c2 = db.addChat({ user_1_id: "alice", user_2_id: "carol" }); db.addMessage(String(c1._id)); db.addMessage(String(c1._id)); db.addMessage(String(c1._id), { sender_id: "alice" }); db.addMessage(String(c2._id));
    const counts = await repo.getUnreadCounts("ALICE", [String(c1._id), String(c2._id)]);
    assert.equal(counts.get(String(c1._id)), 2); assert.equal(counts.get(String(c2._id)), 1);
  });
  it("returns empty unread counts without querying", async () => { assert.deepEqual(await repo.getUnreadCounts("alice", []), new Map()); assert.equal(db.calls.length, 0); });
  it("creates trimmed messages with normalized sender and client ID", async () => {
    const c = db.addChat(); const result = await repo.createMessage(String(c._id), " ALICE ", "  hello  ", " retry-1 ");
    assert.equal(result.created, true); assert.equal(result.message.content, "hello"); assert.equal(result.message.sender_id, "alice"); assert.equal(result.message.client_message_id, "retry-1");
  });
  it("returns the prior message when a client message ID is duplicated", async () => {
    const c = db.addChat(); const first = await repo.createMessage(String(c._id), "alice", "first", "same"); const retry = await repo.createMessage(String(c._id), "alice", "retry", "same");
    assert.equal(retry.created, false); assert.equal(String(retry.message._id), String(first.message._id));
  });
  it("rejects invalid chat IDs for message creation", async () => { await assert.rejects(repo.createMessage("bad", "alice", "hello"), /Invalid chat ID/); });
  it("updates preview for a newer message and truncates by Unicode code point", async () => {
    const c = db.addChat(); const content = "😀".repeat(101); assert.equal(await repo.updateLastMessage(String(c._id), content, " BOB ", new Date(2000)), true);
    assert.equal(Array.from(c.last_message).length, 100); assert.equal(c.last_message, "😀".repeat(100)); assert.equal(c.last_message_sender_id, "bob");
  });
  it("does not allow a late older message to replace the preview", async () => { const newer = new Date(2000); const c = db.addChat({ last_message: "new", last_message_at: newer }); assert.equal(await repo.updateLastMessage(String(c._id), "old", "alice", new Date(1000)), false); assert.equal(c.last_message, "new"); });
  it("allows equal timestamps under the current less-than-or-equal condition", async () => { const at = new Date(2000); const c = db.addChat({ last_message: "old", last_message_at: at }); assert.equal(await repo.updateLastMessage(String(c._id), "equal", "alice", at), true); assert.equal(c.last_message, "equal"); });
  it("returns false when chat and participant are valid but no update is made", async () => { const c = db.addChat({ last_message_at: new Date(3000) }); assert.equal(await repo.updateLastMessage(String(c._id), "late", "alice", new Date(2000)), false); });
  it("throws for a missing chat or non-participant sender", async () => { await assert.rejects(repo.updateLastMessage(new Types.ObjectId().toString(), "hi", "alice", new Date()), /Chat not found or sender is not a participant/); const c = db.addChat(); await assert.rejects(repo.updateLastMessage(String(c._id), "hi", "eve", new Date()), /Chat not found or sender is not a participant/); });
  it("rejects invalid chat IDs for preview updates", async () => { await assert.rejects(repo.updateLastMessage("invalid", "hi", "alice", new Date()), /Invalid chat ID/); });
  it("propagates database errors", async () => { const error = new Error("database unavailable"); db.faults.set("Chat.findById", error); await assert.rejects(repo.findChatById(new Types.ObjectId().toString()), error); });
});
