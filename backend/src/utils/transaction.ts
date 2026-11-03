import mongoose, { ClientSession } from 'mongoose';

/**
 * Checks whether the current active MongoDB connection supports multi-document transactions.
 * Transactions require either a Replica Set (e.g. MongoDB Atlas, local replica set)
 * or a Sharded Cluster. Standalone MongoDB instances do not support transactions.
 */
export const isTransactionSupported = (): boolean => {
  if (mongoose.connection.readyState !== 1) {
    return false;
  }

  const client = mongoose.connection.getClient?.();
  if (!client) {
    return false;
  }

  const topology = (client as unknown as { topology?: { description?: { type?: string } } }).topology;
  const topologyType = topology?.description?.type;

  if (!topologyType) {
    // If unknown topology, default to false unless explicitly confirmed
    return false;
  }

  // Standalone is 'Single' in mongodb driver topology types
  return (
    topologyType === 'ReplicaSetWithPrimary' ||
    topologyType === 'ReplicaSetNoPrimary' ||
    topologyType === 'Sharded' ||
    topologyType === 'LoadBalanced'
  );
};

export interface TransactionOptions {
  /** Force standalone fallback even if transactions are supported (useful for testing fallback mode) */
  forceFallback?: boolean;
}

/**
 * Executes a unit of work inside a MongoDB transaction if supported by the deployment.
 * If running on a standalone instance or if transactions are unavailable, executes
 * the work without a session (or invokes fallback logic) with graceful compensation handling.
 *
 * @param work Function to execute. Receives the ClientSession (or null if transactions unsupported).
 * @param options Configuration options.
 */
export const runInTransaction = async <T>(
  work: (session: ClientSession | null) => Promise<T>,
  options?: TransactionOptions
): Promise<T> => {
  const supportsTx = !options?.forceFallback && isTransactionSupported();

  if (!supportsTx) {
    return work(null);
  }

  const session = await mongoose.startSession();
  try {
    let result: T;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result!;
  } catch (error: unknown) {
    // Check if error is due to transactions not supported on this server
    const errMessage = error instanceof Error ? error.message : String(error);
    const errCode = (error as { code?: number })?.code;

    // Error code 20: TransactionNumbersAreOnlyAllowedOnReplicaSet
    if (
      errCode === 20 ||
      errMessage.includes('Transaction numbers are only allowed on a replica set member or mongos') ||
      errMessage.includes('Transactions are not supported')
    ) {
      console.warn(
        '[TransactionRunner] MongoDB deployment does not support transactions. Falling back to non-transactional execution.'
      );
      return work(null);
    }

    throw error;
  } finally {
    await session.endSession();
  }
};

