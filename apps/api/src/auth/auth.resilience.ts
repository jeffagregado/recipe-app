import type { ResiliencePreset } from '@nestjs/resilience';

export const authResiliencePresets = {
  authCredential: {
    retry: false,
    // Signup has an unknown outcome if timed out; bound concurrency without replay or timeout.
    bulkhead: { maxConcurrent: 3, maxQueue: 12, queueTimeout: 5_000 },
  },
} satisfies Record<string, ResiliencePreset>;
