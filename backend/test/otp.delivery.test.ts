import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OtpService } from '../src/modules/auth/Otp.service.js';

type TestOtp = {
  id: string;
  userId: string;
  codeHash: string;
  attempts: number;
  createdAt: Date;
  expiresAt: Date;
};

function createPersistence(initial: TestOtp[] = [], failCommit = false) {
  let records = [...initial];
  let transactionTail = Promise.resolve();

  const persistence = {
    $transaction: async (work: (tx: never) => Promise<unknown>) => {
      const previous = transactionTail;
      let release!: () => void;
      transactionTail = new Promise<void>((resolve) => { release = resolve; });
      await previous;
      const working = [...records];
      const tx = {
        $queryRaw: async () => [],
        emailOtp: {
          findFirst: async () => working.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null,
          deleteMany: async ({ where }: { where: { userId: string } }) => {
            const before = working.length;
            for (let index = working.length - 1; index >= 0; index--) {
              if (working[index].userId === where.userId) working.splice(index, 1);
            }
            return { count: before - working.length };
          },
          create: async ({ data }: { data: { userId: string; codeHash: string; expiresAt: Date } }) => {
            const created = {
              ...data,
              id: `otp-${Date.now()}-${Math.random()}`,
              attempts: 0,
              createdAt: new Date(),
            };
            working.push(created);
            return created;
          },
        },
      };
      try {
        const result = await work(tx as never);
        if (failCommit) throw new Error('Simulated PostgreSQL commit failure');
        records = working;
        return result;
      } finally {
        release();
      }
    },
    emailOtp: {
      findFirst: async () => records.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null,
      update: async () => ({}),
    },
  };

  return { persistence: persistence as never, getRecords: () => records };
}

describe('OTP delivery persistence', () => {
  it('preserves the previous OTP when SMTP delivery fails', async () => {
    const previous: TestOtp = {
      id: 'previous-otp', userId: 'user-1', codeHash: 'previous-hash', attempts: 0,
      createdAt: new Date(Date.now() - 2 * 60 * 1000),
      expiresAt: new Date(Date.now() + 8 * 60 * 1000),
    };
    const { persistence, getRecords } = createPersistence([previous]);
    const service = new OtpService(async () => { throw new Error('SMTP rejected the message'); }, persistence);

    await assert.rejects(service.issueOtp({ id: 'user-1', email: 'student@example.test' }), {
      name: 'AppError', message: 'Could not send verification email. Try resending the code.', statusCode: 502,
    });

    assert.deepEqual(getRecords(), [previous]);
  });

  it('serializes concurrent resends so only one can pass the cooldown and send', async () => {
    const { persistence, getRecords } = createPersistence();
    let sendCount = 0;
    let releaseFirstSend!: () => void;
    let markFirstSendStarted!: () => void;
    const firstSendStarted = new Promise<void>((resolve) => { markFirstSendStarted = resolve; });
    const sendGate = new Promise<void>((resolve) => { releaseFirstSend = resolve; });
    const service = new OtpService(async () => {
      sendCount++;
      markFirstSendStarted();
      await sendGate;
    }, persistence);

    const first = service.issueOtp({ id: 'user-1', email: 'student@example.test' });
    await firstSendStarted;
    const second = service.issueOtp({ id: 'user-1', email: 'student@example.test' });
    releaseFirstSend();

    await first;
    await assert.rejects(second, { name: 'AppError', statusCode: 429 });
    assert.equal(sendCount, 1);
    assert.equal(getRecords().length, 1);
  });

  it('documents the SMTP accepted but PostgreSQL commit failed gap', async () => {
    const { persistence, getRecords } = createPersistence([], true);
    let acceptedBySmtp = false;
    const service = new OtpService(async () => { acceptedBySmtp = true; }, persistence);

    await assert.rejects(service.issueOtp({ id: 'user-1', email: 'student@example.test' }), /commit failure/);

    assert.equal(acceptedBySmtp, true);
    assert.equal(getRecords().length, 0);
  });
});
