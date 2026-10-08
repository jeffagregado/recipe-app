import { ResilienceTimeoutError } from '@nestjs/resilience';
import type { ResiliencePreset } from '@nestjs/resilience';

export const RECIPE_DATABASE_TIMEOUT_MS = 3_000;
export const RECIPE_STATEMENT_TIMEOUT_MS = 1_000;

/** Only connection failures, overload, cancellation, and transaction contention trip the database breaker. */
function isTransientDatabaseError(error: unknown): boolean {
  const visited = new Set<Error>();
  while (error instanceof Error && !visited.has(error)) {
    if (error instanceof ResilienceTimeoutError) return true;
    visited.add(error);
    if ('code' in error && typeof error.code === 'string' && (
      error.code.startsWith('08') ||
      ['40001', '40P01', '53300', '53400', '57014', '57P01', '57P02', '57P03',
        'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE'].includes(error.code)
    )) return true;
    error = error.cause;
  }
  return false;
}

export const recipeResiliencePresets = {
  recipeRead: {
    retry: false,
    // Cover the pool's 10-second connection budget plus queue waiting and SQL execution.
    timeout: 15_000,
    // Match the pool's five connections and bound additional waiting requests.
    bulkhead: { maxConcurrent: 5, maxQueue: 2, queueTimeout: 2_000 },
  },
  recipeDatabase: {
    retry: false,
    circuitBreaker: {
      failureRateThreshold: 50,
      minimumCalls: 5,
      slidingWindow: { type: 'count', size: 10 },
      openDuration: 10_000,
      halfOpenMaxCalls: 1,
      recordIf: isTransientDatabaseError,
    },
  },
} satisfies Record<string, ResiliencePreset>;
