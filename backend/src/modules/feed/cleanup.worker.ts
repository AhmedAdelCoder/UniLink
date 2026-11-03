import os from 'node:os';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import Post, { IPost } from './models/Post.js';
import { cleanupPostResources } from './feed.service.js';

type PostDocument = mongoose.Document<unknown, object, IPost> &
  IPost & { _id: mongoose.Types.ObjectId };

type PostUpdateFilter = mongoose.QueryFilter<IPost>;

export interface CleanupWorkerConfig {
  /** How often the worker checks for posts needing cleanup (default: 30,000 ms) */
  intervalMs: number;
  /** Maximum number of posts to process in a single worker execution cycle (default: 10) */
  batchSize: number;
  /** How many comments to clean in a single chunk inside cleanupPostResources (default: 500) */
  commentBatchSize: number;
  /** How long a worker lease lasts before it is considered expired (default: 120,000 ms) */
  leaseDurationMs: number;
  /** Base backoff delay for retries (default: 5,000 ms) */
  baseBackoffMs: number;
  /** Maximum backoff delay cap (default: 3,600,000 ms = 1 hour) */
  maxBackoffMs: number;
  /** Maximum number of retry attempts before marking status = 'failed' (default: 5) */
  maxAttempts: number;
  /** Unique worker identifier for distributed claiming */
  workerId: string;
}

export type CleanupResultStatus =
  | 'COMPLETED'
  | 'FAILED'
  | 'ALREADY_DELETED'
  | 'LEASE_LOST'
  | 'SKIPPED_OWNED';

export interface PostCleanupResult {
  postId: string;
  status: CleanupResultStatus;
  commentsDeleted: number;
  commentLikesDeleted: number;
  postLikesDeleted: number;
  attemptCount: number;
  error?: string;
}

export interface CleanupCycleSummary {
  processedCount: number;
  completedCount: number;
  failedCount: number;
  results: PostCleanupResult[];
}

export class CleanupLeaseLostError extends Error {
  constructor(postId: string) {
    super(`Cleanup lease lost for post ${postId}`);
    this.name = 'CleanupLeaseLostError';
  }
}

export const generateWorkerId = (): string => {
  const host = os.hostname() || 'localhost';
  const pid = process.pid || 1;
  const rand = crypto.randomBytes(4).toString('hex');
  return `worker-${host}-${pid}-${rand}`;
};

const generateClaimToken = (): string => crypto.randomBytes(16).toString('hex');

export const defaultWorkerConfig: CleanupWorkerConfig = {
  intervalMs: 30000,
  batchSize: 10,
  commentBatchSize: 500,
  leaseDurationMs: 120000,
  baseBackoffMs: 5000,
  maxBackoffMs: 3600000,
  maxAttempts: 5,
  workerId: generateWorkerId(),
};

export const assertCleanupWorkerConfig = (
  config: CleanupWorkerConfig
): void => {
  const checks: Array<[string, number, number, number]> = [
    ['intervalMs', config.intervalMs, 1, 3_600_000],
    ['batchSize', config.batchSize, 1, 100],
    ['commentBatchSize', config.commentBatchSize, 1, 5_000],
    ['leaseDurationMs', config.leaseDurationMs, 1_000, 1_800_000],
    ['baseBackoffMs', config.baseBackoffMs, 1, 3_600_000],
    ['maxBackoffMs', config.maxBackoffMs, 1, 86_400_000],
    ['maxAttempts', config.maxAttempts, 1, 50],
  ];

  for (const [name, value, min, max] of checks) {
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new Error(
        `Invalid cleanup worker config ${name}: expected integer between ${min} and ${max}, got ${value}`
      );
    }
  }

  if (!config.workerId || typeof config.workerId !== 'string') {
    throw new Error('Invalid cleanup worker config workerId: expected a non-empty string');
  }

  if (config.maxBackoffMs < config.baseBackoffMs) {
    throw new Error('Invalid cleanup worker config: maxBackoffMs must be >= baseBackoffMs');
  }
};

/**
 * Calculates exponential backoff with a small jitter to prevent thundering herd.
 * Formula: min(maxMs, baseMs * 2^(attempt - 1) ± 10% jitter)
 */
export const calculateBackoff = (
  attempt: number,
  baseMs = 5000,
  maxMs = 3600000
): number => {
  const normalizedAttempt = Math.max(1, attempt);
  const exponential = baseMs * Math.pow(2, normalizedAttempt - 1);
  const jitter = exponential * 0.1 * (Math.random() * 2 - 1);
  return Math.min(maxMs, Math.max(baseMs, Math.round(exponential + jitter)));
};

const retryEligibleClause = (now: Date) => ({
  $or: [
    { 'cleanup_state.next_retry_at': null },
    { 'cleanup_state.next_retry_at': { $exists: false } },
    { 'cleanup_state.next_retry_at': { $lte: now } },
  ],
});

const leaseAvailableClause = (now: Date) => ({
  $or: [
    { 'cleanup_state.status': { $ne: 'cleaning' } },
    { 'cleanup_state.lease_expires_at': null },
    { 'cleanup_state.lease_expires_at': { $exists: false } },
    { 'cleanup_state.lease_expires_at': { $lte: now } },
  ],
});

const attemptCountEligibleClause = (maxAttempts: number) => ({
  $or: [
    { 'cleanup_state.attempt_count': { $lt: maxAttempts } },
    { 'cleanup_state.attempt_count': { $exists: false } },
    { 'cleanup_state.attempt_count': null },
  ],
});

const ownershipFilter = (
  postId: mongoose.Types.ObjectId,
  workerId: string,
  claimToken: string
): PostUpdateFilter =>
  ({
    _id: postId,
    'cleanup_state.status': 'cleaning',
    'cleanup_state.claimed_by': workerId,
    'cleanup_state.claim_token': claimToken,
  }) as PostUpdateFilter;

/**
 * Marks expired in-progress claims that already used their last attempt as terminal failures.
 * Prevents unlimited retries when a worker crashes after incrementing attempt_count.
 */
export const reapExpiredOverLimitClaims = async (
  maxAttempts: number
): Promise<number> => {
  const now = new Date();
  let reaped = 0;

  while (true) {
    const filter: PostUpdateFilter = {
      deleted_at: { $ne: null },
      'cleanup_state.status': 'cleaning',
      'cleanup_state.attempt_count': { $gte: maxAttempts },
      $or: [
        { 'cleanup_state.lease_expires_at': null },
        { 'cleanup_state.lease_expires_at': { $exists: false } },
        { 'cleanup_state.lease_expires_at': { $lte: now } },
      ],
    } as PostUpdateFilter;

    const updated = await Post.findOneAndUpdate(
      filter,
      {
        $set: {
          'cleanup_state.status': 'failed',
          'cleanup_state.claimed_by': null,
          'cleanup_state.claim_token': null,
          'cleanup_state.lease_expires_at': null,
          'cleanup_state.next_retry_at': null,
          'cleanup_state.last_error':
            'Exceeded maximum cleanup attempts after an expired lease',
        },
      },
      { new: true }
    );

    if (!updated) break;
    reaped += 1;
  }

  return reaped;
};

/**
 * Atomically claims an eligible tombstoned post for cleanup.
 * Pass `postId` to claim a specific post (request-path immediate cleanup).
 */
export const claimPostForCleanup = async (
  workerId: string,
  leaseDurationMs: number,
  maxAttempts: number,
  postId?: string | mongoose.Types.ObjectId
): Promise<PostDocument | null> => {
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + leaseDurationMs);
  const claimToken = generateClaimToken();

  const filter: PostUpdateFilter = {
    ...(postId ? { _id: postId } : {}),
    deleted_at: { $ne: null },
    'cleanup_state.status': { $ne: 'failed' },
    $and: [
      retryEligibleClause(now),
      leaseAvailableClause(now),
      attemptCountEligibleClause(maxAttempts),
    ],
  } as PostUpdateFilter;

  const update = {
    $set: {
      'cleanup_state.status': 'cleaning',
      'cleanup_state.claimed_by': workerId,
      'cleanup_state.claim_token': claimToken,
      'cleanup_state.lease_expires_at': leaseExpiresAt,
      'cleanup_state.last_attempt_at': now,
    },
    $inc: {
      'cleanup_state.attempt_count': 1,
    },
  };

  const claimedPost = await Post.findOneAndUpdate(filter, update, {
    new: true,
  });

  return claimedPost as PostDocument | null;
};

export const renewCleanupLease = async (
  postId: mongoose.Types.ObjectId,
  workerId: string,
  claimToken: string,
  leaseDurationMs: number
): Promise<boolean> => {
  const renewed = await Post.findOneAndUpdate(
    ownershipFilter(postId, workerId, claimToken),
    {
      $set: {
        'cleanup_state.lease_expires_at': new Date(Date.now() + leaseDurationMs),
      },
    },
    { new: true }
  );

  return renewed != null;
};

const persistOwnedCleanupFailure = async (
  post: PostDocument,
  config: CleanupWorkerConfig,
  errMessage: string
): Promise<{ isPermanentlyFailed: boolean; nextRetryAt: Date | null }> => {
  const workerId = post.cleanup_state?.claimed_by;
  const claimToken = post.cleanup_state?.claim_token;
  const attemptCount = post.cleanup_state?.attempt_count ?? 1;
  const isPermanentlyFailed = attemptCount >= config.maxAttempts;
  const backoffMs = calculateBackoff(
    attemptCount,
    config.baseBackoffMs,
    config.maxBackoffMs
  );
  const nextRetryAt = isPermanentlyFailed ? null : new Date(Date.now() + backoffMs);

  if (!workerId || !claimToken) {
    throw new Error(`Cannot persist cleanup failure for post ${String(post._id)}: missing claim ownership`);
  }

  const updated = await Post.findOneAndUpdate(
    ownershipFilter(post._id, workerId, claimToken),
    {
      $set: {
        'cleanup_state.status': isPermanentlyFailed ? 'failed' : 'pending',
        'cleanup_state.claimed_by': null,
        'cleanup_state.claim_token': null,
        'cleanup_state.lease_expires_at': null,
        'cleanup_state.last_error': errMessage,
        'cleanup_state.next_retry_at': nextRetryAt,
      },
    },
    { new: true }
  );

  if (!updated) {
    throw new CleanupLeaseLostError(String(post._id));
  }

  return { isPermanentlyFailed, nextRetryAt };
};

/**
 * Processes a single claimed post, executing cleanup and accurately recording
 * retry, backoff, and error information if a failure occurs.
 */
export const processClaimedPost = async (
  post: PostDocument,
  config: CleanupWorkerConfig
): Promise<PostCleanupResult> => {
  const postId = String(post._id);
  const attemptCount = post.cleanup_state?.attempt_count ?? 1;
  const workerId = post.cleanup_state?.claimed_by;
  const claimToken = post.cleanup_state?.claim_token;

  if (!workerId || !claimToken) {
    throw new Error(`Claimed post ${postId} is missing ownership metadata`);
  }

  const heartbeatMs = Math.max(250, Math.floor(config.leaseDurationMs / 3));
  let leaseLost = false;
  const heartbeat = setInterval(() => {
    void renewCleanupLease(post._id, workerId, claimToken, config.leaseDurationMs).then(
      (ok) => {
        if (!ok) {
          leaseLost = true;
        }
      },
      (err: unknown) => {
        console.error(`[CleanupWorker] Lease renewal failed for post ${postId}:`, err);
        leaseLost = true;
      }
    );
  }, heartbeatMs);
  heartbeat.unref?.();

  try {
    if (attemptCount > config.maxAttempts) {
      throw new Error('Exceeded maximum cleanup attempts');
    }

    const stats = await cleanupPostResources(post._id, config.commentBatchSize);

    if (leaseLost) {
      throw new CleanupLeaseLostError(postId);
    }

    if (stats.postDeleted) {
      return {
        postId,
        status: 'COMPLETED',
        commentsDeleted: stats.commentsDeleted,
        commentLikesDeleted: stats.commentLikesDeleted,
        postLikesDeleted: stats.postLikesDeleted,
        attemptCount,
      };
    }

    const postExists = await Post.exists({ _id: post._id });
    if (!postExists) {
      return {
        postId,
        status: 'ALREADY_DELETED',
        commentsDeleted: stats.commentsDeleted,
        commentLikesDeleted: stats.commentLikesDeleted,
        postLikesDeleted: stats.postLikesDeleted,
        attemptCount,
      };
    }

    throw new Error('Post document was not deleted after cleanup execution');
  } catch (error: unknown) {
    if (error instanceof CleanupLeaseLostError || leaseLost) {
      console.warn(
        `[CleanupWorker] Post ${postId} lease lost; not overwriting another owner's state.`
      );
      return {
        postId,
        status: 'LEASE_LOST',
        commentsDeleted: 0,
        commentLikesDeleted: 0,
        postLikesDeleted: 0,
        attemptCount,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    const errMessage = error instanceof Error ? error.message : String(error);

    try {
      const { isPermanentlyFailed, nextRetryAt } = await persistOwnedCleanupFailure(
        post,
        config,
        errMessage
      );

      if (isPermanentlyFailed) {
        console.error(
          `[CleanupWorker] Post ${postId} exceeded maximum cleanup attempts (${config.maxAttempts}). Marked as failed. Last error: ${errMessage}`
        );
      } else {
        console.warn(
          `[CleanupWorker] Post ${postId} cleanup attempt ${attemptCount}/${config.maxAttempts} failed. Backing off until ${nextRetryAt?.toISOString()}: ${errMessage}`
        );
      }
    } catch (persistError: unknown) {
      if (persistError instanceof CleanupLeaseLostError) {
        console.warn(
          `[CleanupWorker] Post ${postId} lease lost while persisting failure; skipping state write.`
        );
        return {
          postId,
          status: 'LEASE_LOST',
          commentsDeleted: 0,
          commentLikesDeleted: 0,
          postLikesDeleted: 0,
          attemptCount,
          error: errMessage,
        };
      }

      console.error(
        `[CleanupWorker] Failed to persist cleanup error state for post ${postId}:`,
        persistError
      );
    }

    return {
      postId,
      status: 'FAILED',
      commentsDeleted: 0,
      commentLikesDeleted: 0,
      postLikesDeleted: 0,
      attemptCount,
      error: errMessage,
    };
  } finally {
    clearInterval(heartbeat);
  }
};

/**
 * Request-path and worker-path share this claim-then-process sequence.
 * Returns SKIPPED_OWNED when another owner already holds a live lease.
 */
export const cleanupTombstonedPost = async (
  postId: string | mongoose.Types.ObjectId,
  config: CleanupWorkerConfig
): Promise<PostCleanupResult> => {
  const claimed = await claimPostForCleanup(
    config.workerId,
    config.leaseDurationMs,
    config.maxAttempts,
    postId
  );

  if (!claimed) {
    return {
      postId: String(postId),
      status: 'SKIPPED_OWNED',
      commentsDeleted: 0,
      commentLikesDeleted: 0,
      postLikesDeleted: 0,
      attemptCount: 0,
    };
  }

  return processClaimedPost(claimed, config);
};

/**
 * Runs a single cycle of the cleanup worker, claiming up to config.batchSize
 * eligible posts and cleaning them sequentially.
 */
export const runCleanupCycle = async (
  config: CleanupWorkerConfig,
  shouldAbort?: () => boolean
): Promise<CleanupCycleSummary> => {
  const summary: CleanupCycleSummary = {
    processedCount: 0,
    completedCount: 0,
    failedCount: 0,
    results: [],
  };

  await reapExpiredOverLimitClaims(config.maxAttempts);

  for (let i = 0; i < config.batchSize; i++) {
    if (shouldAbort?.()) {
      break;
    }

    let post: PostDocument | null = null;
    try {
      post = await claimPostForCleanup(
        config.workerId,
        config.leaseDurationMs,
        config.maxAttempts
      );
    } catch (claimError) {
      console.error('[CleanupWorker] Error while claiming post for cleanup:', claimError);
      break;
    }

    if (!post) {
      break;
    }

    const result = await processClaimedPost(post, config);
    summary.processedCount++;
    summary.results.push(result);

    if (result.status === 'COMPLETED' || result.status === 'ALREADY_DELETED') {
      summary.completedCount++;
    } else if (result.status !== 'SKIPPED_OWNED') {
      summary.failedCount++;
    }
  }

  return summary;
};

// ==========================================
// Worker Lifecycle & Scheduling
// ==========================================

let workerTimer: NodeJS.Timeout | null = null;
let isWorkerRunning = false;
let isCycleInProgress = false;
let shuttingDown = false;
let cyclePromise: Promise<void> | null = null;
let activeConfig: CleanupWorkerConfig = { ...defaultWorkerConfig };
let lastRunAt: Date | null = null;
let lastCycleSummary: CleanupCycleSummary | null = null;
let lastShutdownAbandoned = false;

export const getActiveWorkerConfig = (): CleanupWorkerConfig => activeConfig;

const executeSafeCycle = async (): Promise<void> => {
  if (shuttingDown || !isWorkerRunning || isCycleInProgress) {
    return;
  }

  isCycleInProgress = true;
  lastRunAt = new Date();

  const run = (async () => {
    try {
      const summary = await runCleanupCycle(activeConfig, () => shuttingDown);
      lastCycleSummary = summary;

      if (summary.processedCount > 0) {
        console.log(
          `[CleanupWorker] Cycle finished: ${summary.processedCount} processed, ${summary.completedCount} completed, ${summary.failedCount} failed.`
        );
      }
    } catch (error) {
      console.error('[CleanupWorker] Unexpected error in cleanup execution cycle:', error);
    } finally {
      isCycleInProgress = false;
      cyclePromise = null;
    }
  })();

  cyclePromise = run;
  await run;
};

/**
 * Starts the periodic cleanup worker.
 * Must be called after MongoDB connection is established.
 * Does not block HTTP startup.
 */
export const startCleanupWorker = (options?: Partial<CleanupWorkerConfig>): void => {
  if (workerTimer || isWorkerRunning) {
    return;
  }

  const nextConfig: CleanupWorkerConfig = {
    ...defaultWorkerConfig,
    ...options,
    workerId: options?.workerId || generateWorkerId(),
  };
  assertCleanupWorkerConfig(nextConfig);
  activeConfig = nextConfig;

  shuttingDown = false;
  lastShutdownAbandoned = false;
  isWorkerRunning = true;

  console.log(
    `[CleanupWorker] Started post cleanup recovery worker (interval: ${activeConfig.intervalMs}ms, batchSize: ${activeConfig.batchSize}, workerId: ${activeConfig.workerId})`
  );

  setTimeout(() => {
    if (!isWorkerRunning || shuttingDown) return;
    void executeSafeCycle();
  }, 1000);

  workerTimer = setInterval(() => {
    if (!isWorkerRunning || shuttingDown) return;
    void executeSafeCycle();
  }, activeConfig.intervalMs);

  workerTimer.unref();
};

/**
 * Stops the periodic cleanup worker. Waits for an in-flight cycle up to timeoutMs.
 * If the cycle cannot finish, it is abandoned so leases can expire and be recovered.
 */
export const stopCleanupWorker = async (timeoutMs = 5000): Promise<void> => {
  if (!isWorkerRunning && !workerTimer && !isCycleInProgress) {
    return;
  }

  console.log('[CleanupWorker] Stopping post cleanup recovery worker...');
  shuttingDown = true;
  isWorkerRunning = false;

  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
  }

  const inFlight = cyclePromise;
  if (inFlight) {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, timeoutMs);
    });
    await Promise.race([inFlight, timeout]);
    if (timer) clearTimeout(timer);
  } else {
    const startWait = Date.now();
    while (isCycleInProgress && Date.now() - startWait < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  if (isCycleInProgress) {
    lastShutdownAbandoned = true;
    console.warn(
      '[CleanupWorker] Shutdown deadline reached with an in-flight cycle. Abandoning work; lease recovery will retry it.'
    );
    return;
  }

  lastShutdownAbandoned = false;
  console.log('[CleanupWorker] Post cleanup recovery worker stopped.');
};

/**
 * Returns current health and diagnostic status of the worker.
 */
export const getCleanupWorkerStatus = () => {
  return {
    isRunning: isWorkerRunning,
    isCycleInProgress,
    shuttingDown,
    lastShutdownAbandoned,
    workerId: activeConfig.workerId,
    config: {
      intervalMs: activeConfig.intervalMs,
      batchSize: activeConfig.batchSize,
      leaseDurationMs: activeConfig.leaseDurationMs,
      maxAttempts: activeConfig.maxAttempts,
    },
    lastRunAt,
    lastCycleSummary,
  };
};
