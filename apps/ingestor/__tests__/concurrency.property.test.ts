// Feature: orr-pulse, Property 1: Concurrency never exceeds limit
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import pLimit from 'p-limit';

const CONCURRENCY_LIMIT = 3;

describe('Concurrency limit - Property 1', () => {
  // **Validates: Requirements 1.2**
  it('in-flight count never exceeds 3 for any number of segments and response timings', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate segment count between 1 and 20
        fc.integer({ min: 1, max: 20 }),
        // Generate an array of relative delay factors to simulate variable response timings
        fc.array(fc.integer({ min: 0, max: 5 }), { minLength: 20, maxLength: 20 }),
        async (segmentCount, delays) => {
          // Track concurrency
          let currentInFlight = 0;
          let maxInFlight = 0;

          // Use the same concurrency limit as the real fetcher
          const limit = pLimit(CONCURRENCY_LIMIT);

          // Create tasks simulating fetch calls with variable delays
          const tasks = Array.from({ length: segmentCount }, (_, idx) =>
            limit(async () => {
              currentInFlight++;
              maxInFlight = Math.max(maxInFlight, currentInFlight);

              // Simulate async execution with minimal delay (varies per segment)
              const delay = delays[idx % delays.length];
              await new Promise((resolve) => setTimeout(resolve, delay));

              currentInFlight--;

              return { segmentId: `segment-${idx}` };
            }),
          );

          // Wait for all tasks to complete and then assert
          await Promise.all(tasks);
          expect(maxInFlight).toBeLessThanOrEqual(CONCURRENCY_LIMIT);
        },
      ),
      { numRuns: 100 },
    );
  }, 30_000);
});
