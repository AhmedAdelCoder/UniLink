import assert from "node:assert/strict";
import { createServer } from "node:http";
import { describe, it } from "node:test";
import type { TestContext } from "node:test";
import prisma from "../src/config/postgres.js";
import { initSocket } from "../src/modules/chat/sockets/index.js";
import { startSocketSessionSweeper, sweepSocketSessions } from "../src/modules/chat/sockets/session.sweeper.js";
import { getActiveUserIds } from "../src/utils/authUser.js";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const flushMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};
const activeSocket = (userId = A) => ({
  data: { user: { userId, role: "student", expiresAt: undefined } },
  emit() {},
  disconnect() {},
});
const fakeIo = (sockets: ReturnType<typeof activeSocket>[] = [activeSocket()]) => ({
  sockets: { sockets: new Map(sockets.map((socket, index) => [String(index), socket])) },
}) as any;
const stubFindMany = () => {
  const original = prisma.user.findMany;
  let calls = 0;
  (prisma.user as any).findMany = async (args: any) => {
    calls++;
    const ids: string[] = args.where.id.in;
    return [A, B, C].filter((id) => ids.includes(id)).map((id) => ({ id }));
  };
  return { get calls() { return calls; }, restore: () => { (prisma.user as any).findMany = original; } };
};
const enableTimers = (context: TestContext) => context.mock.timers.enable({ apis: ["setInterval"] });

describe("socket session sweeper timers and active user IDs", () => {
  it("advances the 60-second interval deterministically and runs once at 60s and twice at 120s", async (context) => {
    enableTimers(context);
    const stub = stubFindMany();
    const stop = startSocketSessionSweeper(fakeIo());
    try {
      context.mock.timers.tick(60_000);
      await flushMicrotasks();
      assert.equal(stub.calls, 1);
      context.mock.timers.tick(60_000);
      await flushMicrotasks();
      assert.equal(stub.calls, 2);
      context.mock.timers.tick(60_000);
      await flushMicrotasks();
      assert.equal(stub.calls, 3);
    } finally {
      stop();
      stub.restore();
    }
  });

  it("logs a rejected sweep and continues on the next mocked timer tick", async (context) => {
    enableTimers(context);
    const original = prisma.user.findMany;
    let calls = 0;
    (prisma.user as any).findMany = async (args: any) => {
      calls++;
      if (calls === 1) throw new Error("stubbed database failure");
      return [{ id: args.where.id.in[0] }];
    };
    const originalError = console.error;
    const errors: unknown[][] = [];
    console.error = (...args: unknown[]) => { errors.push(args); };
    const stop = startSocketSessionSweeper(fakeIo());
    try {
      context.mock.timers.tick(60_000);
      await flushMicrotasks();
      assert.equal(calls, 1);
      assert.equal(errors.length, 1);
      assert.match(String(errors[0][0]), /Socket session sweep failed/);
      context.mock.timers.tick(60_000);
      await flushMicrotasks();
      assert.equal(calls, 2);
      assert.equal(errors.length, 1);
    } finally {
      stop();
      console.error = originalError;
      (prisma.user as any).findMany = original;
    }
  });

  it("returned stop function prevents subsequent timer sweeps", async (context) => {
    enableTimers(context);
    const stub = stubFindMany();
    const stop = startSocketSessionSweeper(fakeIo());
    context.mock.timers.tick(60_000);
    await flushMicrotasks();
    assert.equal(stub.calls, 1);
    stop();
    context.mock.timers.tick(120_000);
    await flushMicrotasks();
    assert.equal(stub.calls, 1);
    stub.restore();
  });

  it("closing the HTTP server created by initSocket stops further timer sweeps", async (context) => {
    enableTimers(context);
    const stub = stubFindMany();
    const server = createServer();
    const io = initSocket(server);
    (io.sockets.sockets as any).set("timer-sentinel", activeSocket());
    try {
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      context.mock.timers.tick(60_000);
      await flushMicrotasks();
      assert.equal(stub.calls, 1);
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      context.mock.timers.tick(120_000);
      await flushMicrotasks();
      assert.equal(stub.calls, 1);
    } finally {
      await new Promise<void>((resolve) => io.close(() => resolve()));
      stub.restore();
    }
  });

  it("getActiveUserIds returns active IDs and sends the exact Prisma filter and projection", async () => {
    const original = prisma.user.findMany;
    let received: any;
    (prisma.user as any).findMany = async (args: any) => {
      received = args;
      return [{ id: A }];
    };
    try {
      assert.deepEqual(await getActiveUserIds([A, B]), new Set([A]));
      assert.deepEqual(received, {
        where: { id: { in: [A, B] }, deletedAt: null },
        select: { id: true },
      });
    } finally {
      (prisma.user as any).findMany = original;
    }
  });

  it("getActiveUserIds filters invalid UUIDs and skips empty or wholly invalid inputs", async () => {
    const original = prisma.user.findMany;
    const queries: any[] = [];
    (prisma.user as any).findMany = async (args: any) => { queries.push(args); return [{ id: A }]; };
    try {
      assert.deepEqual(await getActiveUserIds(["garbage", A, "not-a-uuid", B]), new Set([A]));
      assert.deepEqual(queries[0].where.id.in, [A, B]);
      assert.deepEqual(await getActiveUserIds(["bad", "also-bad"]), new Set());
      assert.deepEqual(await getActiveUserIds([]), new Set());
      assert.equal(queries.length, 1);
    } finally {
      (prisma.user as any).findMany = original;
    }
  });

  it("zero sockets and all-expired sockets skip the database query", async () => {
    const stub = stubFindMany();
    let disconnected = 0;
    try {
      await sweepSocketSessions(fakeIo([]), 1);
      assert.equal(stub.calls, 0);
      const expired = [A, B].map((userId) => ({
        data: { user: { userId, role: "student", expiresAt: 0 } },
        emit() {},
        disconnect() { disconnected++; },
      }));
      await sweepSocketSessions(fakeIo(expired as any), 1);
      assert.equal(disconnected, 2);
      assert.equal(stub.calls, 0);
    } finally {
      stub.restore();
    }
  });
});
