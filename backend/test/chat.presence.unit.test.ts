import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TestContext } from "node:test";
import prisma from "../src/config/postgres.js";
import { getAcceptedContactIds } from "../src/modules/chat/repositories/connection.repository.js";
import { markUserOffline, markUserOnline, resetAllPresence } from "../src/modules/chat/repositories/presence.repository.js";
import { PresenceService } from "../src/modules/chat/sockets/presence.service.js";
import { ServerEvents, userRoom } from "../src/modules/chat/sockets/chat.events.js";
import { PresenceStore } from "../src/modules/chat/sockets/presence.store.js";
import { sweepSocketSessions } from "../src/modules/chat/sockets/session.sweeper.js";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const D = "44444444-4444-4444-8444-444444444444";
const flushMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};
const enableTimeouts = (context: TestContext) => context.mock.timers.enable({ apis: ["setTimeout", "Date"], now: new Date("2026-01-02T03:04:05.000Z") });
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
const makeIO = (onEmit?: () => void) => {
  const events: Array<{ rooms: string[]; name: string; payload: unknown }> = [];
  return {
    events,
    io: { to: (rooms: string[]) => ({ emit: (name: string, payload: unknown) => { onEmit?.(); events.push({ rooms, name, payload }); } }) } as any,
  };
};
const installUserStubs = (options: { update?: (args: any) => Promise<unknown>; contacts?: (args: any) => Promise<any[]> } = {}) => {
  const originalUpdateMany = prisma.user.updateMany;
  const originalConnectionFindMany = prisma.connection.findMany;
  const updates: any[] = [];
  const contactQueries: any[] = [];
  (prisma.user as any).updateMany = async (args: any) => {
    updates.push(args);
    return options.update ? options.update(args) : { count: 1 };
  };
  (prisma.connection as any).findMany = async (args: any) => {
    contactQueries.push(args);
    return options.contacts ? options.contacts(args) : [{ requesterId: args.where.OR[0].requesterId, receiverId: B }];
  };
  return {
    updates,
    contactQueries,
    restore() {
      (prisma.user as any).updateMany = originalUpdateMany;
      (prisma.connection as any).findMany = originalConnectionFindMany;
    },
  };
};

describe("PresenceStore device counters and grace period", () => {
  it("first connect announces online and a second device does not", () => {
    const store = new PresenceStore();
    assert.equal(store.connect(A), true);
    assert.equal(store.connect(A), false);
  });

  it("disconnecting one of two devices never calls onOffline", (context) => {
    enableTimeouts(context);
    const store = new PresenceStore(5_000);
    let offline = 0;
    store.connect(A);
    store.connect(A);
    store.disconnect(A, () => offline++);
    context.mock.timers.tick(5_000);
    assert.equal(offline, 0);
    assert.equal(store.isOnline(A), true);
  });

  it("last disconnect invokes onOffline once only after the grace period", (context) => {
    enableTimeouts(context);
    const store = new PresenceStore(5_000);
    let offline = 0;
    store.connect(A);
    store.disconnect(A, () => offline++);
    context.mock.timers.tick(4_999);
    assert.equal(offline, 0);
    context.mock.timers.tick(1);
    assert.equal(offline, 1);
    context.mock.timers.tick(5_000);
    assert.equal(offline, 1);
  });

  it("reconnect inside grace cancels offline and does not announce a new online transition", (context) => {
    enableTimeouts(context);
    const store = new PresenceStore(5_000);
    let offline = 0;
    assert.equal(store.connect(A), true);
    store.disconnect(A, () => offline++);
    context.mock.timers.tick(4_000);
    assert.equal(store.connect(A), false);
    context.mock.timers.tick(5_000);
    assert.equal(offline, 0);
    assert.equal(store.isOnline(A), true);
  });

  it("remains online during grace, then becomes offline and can announce online again", (context) => {
    enableTimeouts(context);
    const store = new PresenceStore(5_000);
    assert.equal(store.connect(A), true);
    assert.equal(store.isOnline(A), true);
    store.disconnect(A, () => {});
    assert.equal(store.isOnline(A), true);
    context.mock.timers.tick(5_000);
    assert.equal(store.isOnline(A), false);
    assert.equal(store.connect(A), true);
  });

  it("unknown and extra disconnects do not throw or make the counter negative", (context) => {
    enableTimeouts(context);
    const store = new PresenceStore(5_000);
    let offline = 0;
    assert.doesNotThrow(() => store.disconnect(A, () => offline++));
    store.connect(A);
    store.disconnect(A, () => offline++);
    store.disconnect(A, () => offline++);
    context.mock.timers.tick(5_000);
    assert.equal(offline, 1);
    assert.equal(store.isOnline(A), false);
    assert.equal(store.connect(A), true);
  });

  it("unrefs the pending grace-period timeout", () => {
    const store = new PresenceStore(5_000);
    store.connect(A);
    store.disconnect(A, () => {});
    const timer = (store as any).pending.get(A) as NodeJS.Timeout;
    assert.ok(timer);
    assert.equal(timer.hasRef(), false);
    store.connect(A); // Cancels the real timeout immediately after inspecting its ref state.
  });
});

describe("PresenceService and Prisma presence repositories", () => {
  it("writes online before emitting only to accepted contacts' rooms", async () => {
    const order: string[] = [];
    const stubs = installUserStubs({
      update: async () => { order.push("online-write"); return { count: 1 }; },
      contacts: async () => { order.push("contacts-query"); return [{ requesterId: A, receiverId: B }, { requesterId: A, receiverId: C }]; },
    });
    const emitted = deferred<void>();
    const { io, events } = makeIO(() => { order.push("emit"); emitted.resolve(); });
    const service = new PresenceService(io, new PresenceStore());
    try {
      service.handleConnect(A);
      await emitted.promise;
      await flushMicrotasks();
      assert.deepEqual(order, ["online-write", "contacts-query", "emit"]);
      assert.equal(stubs.updates.length, 1);
      assert.deepEqual(stubs.updates[0], { where: { id: A, deletedAt: null }, data: { isOnline: true } });
      assert.deepEqual(events, [{ rooms: [userRoom(B), userRoom(C)], name: ServerEvents.PresenceUpdate, payload: { userId: A, online: true, lastSeen: null } }]);
    } finally { stubs.restore(); }
  });

  it("writes online without emitting when there are no accepted contacts", async () => {
    const stubs = installUserStubs({ contacts: async () => [] });
    const { io, events } = makeIO();
    try {
      new PresenceService(io, new PresenceStore()).handleConnect(A);
      await flushMicrotasks();
      assert.equal(stubs.updates.length, 1);
      assert.equal(events.length, 0);
    } finally { stubs.restore(); }
  });

  it("does not write or emit for a second device or a quick reconnect", async (context) => {
    enableTimeouts(context);
    const stubs = installUserStubs();
    const { io, events } = makeIO();
    const service = new PresenceService(io, new PresenceStore(5_000));
    try {
      service.handleConnect(A);
      await flushMicrotasks();
      service.handleConnect(A);
      service.handleDisconnect(A);
      service.handleDisconnect(A);
      service.handleConnect(A);
      context.mock.timers.tick(5_000);
      await flushMicrotasks();
      assert.equal(stubs.updates.length, 1);
      assert.equal(events.length, 1);
    } finally { stubs.restore(); }
  });

  it("marks offline after grace and emits the exact lastSeen instant as ISO", async (context) => {
    enableTimeouts(context);
    const stubs = installUserStubs();
    const { io, events } = makeIO();
    const service = new PresenceService(io, new PresenceStore(5_000));
    try {
      service.handleConnect(A);
      await flushMicrotasks();
      service.handleDisconnect(A);
      context.mock.timers.tick(5_000);
      await flushMicrotasks();
      const offline = stubs.updates.find((item) => item.data.isOnline === false);
      assert.ok(offline);
      assert.equal(offline.where.id, A);
      assert.equal(offline.where.deletedAt, null);
      assert.ok(offline.data.lastSeen instanceof Date);
      const event = events.find((item) => (item.payload as any).online === false)!;
      assert.equal((event.payload as any).lastSeen, offline.data.lastSeen.toISOString());
    } finally { stubs.restore(); }
  });

  it("undoes an offline write when the user reconnects while it is pending", async (context) => {
    enableTimeouts(context);
    const offlineWrite = deferred<unknown>();
    const calls: any[] = [];
    const originalUpdate = prisma.user.updateMany;
    const originalContacts = prisma.connection.findMany;
    (prisma.user as any).updateMany = async (args: any) => {
      calls.push(args);
      if (args.data.isOnline === false) return offlineWrite.promise;
      return { count: 1 };
    };
    (prisma.connection as any).findMany = async () => [{ requesterId: A, receiverId: B }];
    const { io, events } = makeIO();
    const service = new PresenceService(io, new PresenceStore(5_000));
    try {
      service.handleConnect(A);
      await flushMicrotasks();
      service.handleDisconnect(A);
      context.mock.timers.tick(5_000);
      await flushMicrotasks();
      assert.equal(calls.filter((item) => item.data.isOnline === false).length, 1);
      service.handleConnect(A);
      await flushMicrotasks();
      offlineWrite.resolve({ count: 1 });
      await flushMicrotasks();
      assert.equal(calls.filter((item) => item.data.isOnline === true).length, 3);
      assert.equal(events.some((event) => (event.payload as any).online === false), false);
    } finally {
      offlineWrite.resolve({ count: 1 });
      (prisma.user as any).updateMany = originalUpdate;
      (prisma.connection as any).findMany = originalContacts;
    }
  });

  it("logs online-write, offline-write, and contacts-query failures without throwing", async (context) => {
    enableTimeouts(context);
    const originalUpdate = prisma.user.updateMany;
    const originalContacts = prisma.connection.findMany;
    const originalError = console.error;
    const errors: unknown[][] = [];
    console.error = (...args: unknown[]) => { errors.push(args); };
    const { io } = makeIO();
    try {
      (prisma.user as any).updateMany = async () => { throw new Error("online write failed"); };
      const online = new PresenceService(io, new PresenceStore());
      assert.doesNotThrow(() => online.handleConnect(A));
      await flushMicrotasks();
      (prisma.user as any).updateMany = async () => ({ count: 1 });
      (prisma.connection as any).findMany = async () => { throw new Error("contacts query failed"); };
      const contacts = new PresenceService(io, new PresenceStore());
      assert.doesNotThrow(() => contacts.handleConnect(B));
      await flushMicrotasks();
      (prisma.connection as any).findMany = async () => [];
      (prisma.user as any).updateMany = async (args: any) => {
        if (args.data.isOnline === false) throw new Error("offline write failed");
        return { count: 1 };
      };
      const offline = new PresenceService(io, new PresenceStore(5_000));
      offline.handleConnect(C);
      await flushMicrotasks();
      offline.handleDisconnect(C);
      context.mock.timers.tick(5_000);
      await flushMicrotasks();
      assert.equal(errors.length, 3);
    } finally {
      console.error = originalError;
      (prisma.user as any).updateMany = originalUpdate;
      (prisma.connection as any).findMany = originalContacts;
    }
  });

  it("session-sweeper disconnect enters the last-device offline path after grace", async (context) => {
    enableTimeouts(context);
    const stubs = installUserStubs();
    const { io, events } = makeIO();
    const service = new PresenceService(io, new PresenceStore(5_000));
    const socket: any = {
      data: { user: { userId: A, role: "student", expiresAt: 1 } },
      emit() {},
      disconnect() { service.handleDisconnect(A); },
    };
    const sweepIo = { sockets: { sockets: new Map([["expired-device", socket]]) } } as any;
    try {
      service.handleConnect(A);
      await flushMicrotasks();
      await sweepSocketSessions(sweepIo, 1);
      assert.equal(events.some((event) => (event.payload as any).online === false), false);
      context.mock.timers.tick(5_000);
      await flushMicrotasks();
      assert.ok(stubs.updates.some((args) => args.data.isOnline === false));
      assert.ok(events.some((event) => (event.payload as any).online === false));
    } finally { stubs.restore(); }
  });

  it("handleConnect and handleDisconnect return synchronously", async () => {
    const stubs = installUserStubs();
    try {
      const service = new PresenceService(makeIO().io, new PresenceStore());
      assert.equal(service.handleConnect(A), undefined);
      assert.equal(service.handleDisconnect(A), undefined);
      await flushMicrotasks();
    } finally { stubs.restore(); }
  });

  it("getAcceptedContactIds filters accepted OR rows, deduplicates both directions, and normalizes IDs", async () => {
    const original = prisma.connection.findMany;
    const rows = [
      { requesterId: A, receiverId: B, status: "accepted" },
      { requesterId: B, receiverId: A, status: "accepted" },
      { requesterId: A, receiverId: C, status: "pending" },
      { requesterId: D, receiverId: A, status: "removed" },
    ];
    const calls: any[] = [];
    (prisma.connection as any).findMany = async (args: any) => {
      calls.push(args);
      return rows.filter((row) => row.status === args.where.status && args.where.OR.some((clause: any) => Object.entries(clause).every(([key, value]) => (row as any)[key] === value)));
    };
    try {
      assert.deepEqual(await getAcceptedContactIds(` ${A.toUpperCase()} `), [B]);
      assert.deepEqual(calls[0], { where: { status: "accepted", OR: [{ requesterId: A }, { receiverId: A }] }, select: { requesterId: true, receiverId: true } });
      assert.deepEqual(await getAcceptedContactIds("invalid"), []);
      assert.equal(calls.length, 1);
    } finally { (prisma.connection as any).findMany = original; }
  });

  it("presence repository scopes writes to active users and reset changes only online rows", async () => {
    const original = prisma.user.updateMany;
    const calls: any[] = [];
    const rows = new Map([[A, { isOnline: false, lastSeen: null as Date | null, deletedAt: null as Date | null }], [B, { isOnline: true, lastSeen: null as Date | null, deletedAt: null as Date | null }], [C, { isOnline: true, lastSeen: null as Date | null, deletedAt: new Date() }]]);
    (prisma.user as any).updateMany = async (args: any) => {
      calls.push(args);
      let count = 0;
      for (const [id, row] of rows) {
        const matchesId = args.where.id === undefined || args.where.id === id;
        const matchesDeleted = args.where.deletedAt !== null || row.deletedAt === null;
        const matchesOnline = args.where.isOnline === undefined || args.where.isOnline === row.isOnline;
        if (matchesId && matchesDeleted && matchesOnline) { Object.assign(row, args.data); count++; }
      }
      return { count };
    };
    try {
      const lastSeen = new Date("2026-01-02T03:04:05.000Z");
      await markUserOnline(A);
      await markUserOffline(A, lastSeen);
      assert.deepEqual(calls[0], { where: { id: A, deletedAt: null }, data: { isOnline: true } });
      assert.deepEqual(calls[1], { where: { id: A, deletedAt: null }, data: { isOnline: false, lastSeen } });
      await resetAllPresence();
      assert.deepEqual(calls[2].where, { isOnline: true });
      assert.equal(calls[2].data.isOnline, false);
      assert.ok(calls[2].data.lastSeen instanceof Date);
      assert.equal(rows.get(C)?.isOnline, false);
      assert.equal(rows.get(B)?.isOnline, false);
      assert.equal(rows.get(A)?.lastSeen, lastSeen, "reset must leave an already-offline user's lastSeen untouched");
    } finally { (prisma.user as any).updateMany = original; }
  });
});