import type { DataSource } from 'typeorm';
import { queryRows } from './query-rows';

/** Stable int4 pairs for pg_try_advisory_xact_lock. One replica runs each job. */
export const ADVISORY_LOCK = {
  emailPump: [7410, 1],
  emailSchedule: [7410, 2],
  enrollmentReverify: [7410, 3],
  orderCancelUnpaid: [7410, 4],
  complianceRetention: [7410, 5],
} as const;

export type AdvisoryLockKey = readonly [number, number];

/**
 * Holds a transaction-scoped advisory lock for the duration of `work`.
 * Returns false when another session already holds the lock.
 */
export async function withAdvisoryLock(
  dataSource: DataSource,
  key: AdvisoryLockKey,
  work: () => Promise<void>,
): Promise<boolean> {
  const runner = dataSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  try {
    const rows = queryRows(
      await runner.query(
        'SELECT pg_try_advisory_xact_lock($1::int, $2::int) AS locked',
        [key[0], key[1]],
      ),
    );
    const locked = lockAcquired(rows);
    if (!locked) {
      await runner.commitTransaction();
      return false;
    }
    await work();
    await runner.commitTransaction();
    return true;
  } catch (error) {
    try {
      await runner.rollbackTransaction();
    } catch {
      /* the connection may already be closed */
    }
    throw error;
  } finally {
    await runner.release();
  }
}

function lockAcquired(rows: Array<Record<string, unknown>>): boolean {
  const value = rows[0]?.locked;
  return value === true || value === 't' || value === 'true';
}
