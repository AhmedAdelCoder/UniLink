import { Types } from "mongoose";
import Chat from "../../src/modules/chat/models/Chat.js";
import Message from "../../src/modules/chat/models/Message.js";

type Doc = Record<string, any>;
type Filter = Record<string, any>;

const compare = (value: any, condition: any): boolean => {
  if (condition instanceof Types.ObjectId) return String(value) === String(condition);
  if (condition instanceof Date) return new Date(value).getTime() === condition.getTime();
  if (condition && typeof condition === "object" && !Array.isArray(condition)) {
    return Object.entries(condition).every(([op, expected]) => {
      if (op === "$in") return expected.some((x: any) => compare(value, x));
      if (op === "$ne") return !compare(value, expected);
      if (op === "$lt") return value instanceof Date || expected instanceof Date ? new Date(value).getTime() < new Date(expected).getTime() : String(value) < String(expected);
      if (op === "$lte") return new Date(value).getTime() <= new Date(expected).getTime();
      return false;
    });
  }
  return String(value) === String(condition);
};

const matches = (doc: Doc, filter: Filter): boolean => Object.entries(filter).every(([key, value]) => {
  if (key === "$or") return value.some((part: Filter) => matches(doc, part));
  if (key === "$and") return value.every((part: Filter) => matches(doc, part));
  return compare(doc[key], value);
});

export class ChatMockDb {
  chats = new Map<string, Doc>();
  messages = new Map<string, Doc>();
  faults = new Map<string, Error>();
  private originals: { chat: Record<string, any>; message: Record<string, any> } = { chat: {}, message: {} };
  readonly calls: Array<{ model: string; method: string; args: any[] }> = [];

  install() {
    this.originals.chat = Object.fromEntries(["findById", "findOne", "findOneAndUpdate", "find", "updateOne", "exists"].map((k) => [k, (Chat as any)[k]]));
    this.originals.message = Object.fromEntries(["find", "create", "findOne", "updateMany", "aggregate"].map((k) => [k, (Message as any)[k]]));
    const self = this;
    const record = (model: string, method: string, args: any[]) => { self.calls.push({ model, method, args }); const error = self.faults.get(`${model}.${method}`); if (error) throw error; };
    const chain = (model: string, method: string, args: any[], resolve: (opts: any) => any) => {
      const opts: any = { sort: null, limit: null };
      const q: any = { lean: () => q, sort: (s: any) => (opts.sort = s, q), limit: (n: number) => (opts.limit = n, q), then: (ok: any, fail: any) => Promise.resolve().then(() => { record(model, method, args); return resolve(opts); }).then(ok, fail), catch: (fail: any) => q.then(undefined, fail) };
      return q;
    };
    (Chat as any).findById = (id: any) => chain("Chat", "findById", [id], () => self.chats.get(String(id)) ?? null);
    (Chat as any).findOne = (filter: Filter) => chain("Chat", "findOne", [filter], () => Array.from(self.chats.values()).find((d) => matches(d, filter)) ?? null);
    (Chat as any).find = (filter: Filter) => chain("Chat", "find", [filter], ({ sort }) => {
      let rows = Array.from(self.chats.values()).filter((d) => matches(d, filter));
      if (sort) rows.sort((a, b) => (b.last_message_at?.getTime() ?? 0) - (a.last_message_at?.getTime() ?? 0) || String(b._id).localeCompare(String(a._id)));
      return rows;
    });
    (Chat as any).findOneAndUpdate = (filter: Filter, update: any) => chain("Chat", "findOneAndUpdate", [filter, update], () => {
      let found = Array.from(self.chats.values()).find((d) => matches(d, filter));
      if (!found) { found = { _id: new Types.ObjectId(), ...update.$setOnInsert, user_1_id: filter.user_1_id, user_2_id: filter.user_2_id, last_message: null, last_message_sender_id: null, created_at: new Date(), updated_at: new Date() }; self.chats.set(String(found._id), found); }
      return found;
    });
    (Chat as any).updateOne = async (filter: Filter, update: any) => {
      record("Chat", "updateOne", [filter, update]);
      const found = Array.from(self.chats.values()).find((d) => matches(d, filter));
      if (!found) return { modifiedCount: 0 };
      Object.assign(found, update.$set); return { modifiedCount: 1 };
    };
    (Chat as any).exists = async (filter: Filter) => { record("Chat", "exists", [filter]); const found = Array.from(self.chats.values()).find((d) => matches(d, filter)); return found ? { _id: found._id } : null; };
    (Message as any).find = (filter: Filter) => chain("Message", "find", [filter], ({ sort, limit }) => {
      let rows = Array.from(self.messages.values()).filter((d) => matches(d, filter));
      if (sort) rows.sort((a, b) => b.created_at.getTime() - a.created_at.getTime() || String(b._id).localeCompare(String(a._id)));
      return limit === null ? rows : rows.slice(0, limit);
    });
    (Message as any).create = async (input: any) => {
      record("Message", "create", [input]);
      if (input.client_message_id && Array.from(self.messages.values()).some((m) => String(m.chat_id) === String(input.chat_id) && m.sender_id === input.sender_id && m.client_message_id === input.client_message_id)) { const e: any = new Error("duplicate"); e.code = 11000; throw e; }
      const doc = { _id: new Types.ObjectId(), ...input, is_read: false, read_at: null, created_at: new Date(), updated_at: new Date() };
      self.messages.set(String(doc._id), doc); return { toObject: () => doc };
    };
    (Message as any).findOne = (filter: Filter) => chain("Message", "findOne", [filter], () => Array.from(self.messages.values()).find((d) => matches(d, filter)) ?? null);
    (Message as any).updateMany = async (filter: Filter, update: any) => { record("Message", "updateMany", [filter, update]); let modifiedCount = 0; for (const d of self.messages.values()) if (matches(d, filter)) { Object.assign(d, update.$set); modifiedCount++; } return { modifiedCount }; };
    (Message as any).aggregate = async (pipeline: any[]) => {
      record("Message", "aggregate", [pipeline]); const m = pipeline[0].$match; const counts = new Map<string, number>();
      for (const d of self.messages.values()) if (matches(d, m)) { const key = String(d.chat_id); counts.set(key, (counts.get(key) ?? 0) + 1); }
      return Array.from(counts, ([_id, count]) => ({ _id: new Types.ObjectId(_id), count }));
    };
  }

  restore() { Object.assign(Chat, this.originals.chat); Object.assign(Message, this.originals.message); }
  reset() { this.chats.clear(); this.messages.clear(); this.faults.clear(); this.calls.length = 0; }
  addChat(fields: Partial<Doc> = {}) { const doc = { _id: new Types.ObjectId(), user_1_id: "alice", user_2_id: "bob", last_message: null, last_message_sender_id: null, last_message_at: null, created_at: new Date(), updated_at: new Date(), ...fields }; this.chats.set(String(doc._id), doc); return doc; }
  addMessage(chatId: string, fields: Partial<Doc> = {}) { const doc = { _id: new Types.ObjectId(), chat_id: new Types.ObjectId(chatId), sender_id: "bob", content: "hello", client_message_id: null, is_read: false, read_at: null, created_at: new Date(), updated_at: new Date(), ...fields }; this.messages.set(String(doc._id), doc); return doc; }
}
