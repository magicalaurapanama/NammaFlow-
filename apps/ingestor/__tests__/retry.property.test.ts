// Feature: orr-pulse, Property 2: Retry respects exponential backoff
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';

const RETRY_DELAYS_MS = [1_000, 4_000, 16_000];
const MAX_TOTAL_ATTEMPTS = 4; // 1 initial + 3 retries

// A valid TomTom response payload
const VALID_RESPONSE = {
  flowSegmentData: {
    currentSpeed: 45.5,
    freeFlowSpeed: 65.0,
    currentTravelTime: 42.3,
    freeFlowTravelTime: 30.1,
    confidence: 0.85,
    roadClosure: false,
  },
};

// A sample segment config for testing
const SAMPLE_SEGMENT = {
  id: 'silk-board' as const,
  name: 'Silk Board',
  lat: 12.9172,
  lon: 77.6227,
  position: 0,
};

describe('Retry backoff - Property 2', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Set TOMTOM_MOCK to something other than 'true' so real fetch path is exercised
    vi.stubEnv('TOMTOM_MOCK', 'false');
    vi.stubEnv('TOMTOM_API_KEY', 'test-key');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  // **Validates: Requirements 1.4**
  it('makes at most 4 total attempts and respects backoff delays [1s, 4s, 16s]', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate how many attempts should fail before success (0 = first attempt succeeds, 4 = all fail)
        fc.integer({ min: 0, max: 4 }),
        async (failCount) => {
          vi.resetModules();

          let attemptNumber = 0;
          const attemptTimestamps: number[] = [];

          const mockFetch = vi.fn(async () => {
            attemptTimestamps.push(Date.now());
            attemptNumber++;

            if (attemptNumber <= failCount) {
              throw new Error(`Simulated failure attempt ${attemptNumber}`);
            }

            return {
              ok: true,
              json: async () => VALID_RESPONSE,
            } as unknown as Response;
          });

          vi.stubGlobal('fetch', mockFetch);

          // Dynamically import fetchSegment so it picks up our mocked environment & fetch
          const { fetchSegment } = await import('../src/fetcher.js');

          // Run fetchSegment with timer advancement
          const resultPromise = fetchSegment(SAMPLE_SEGMENT);

          // Advance timers to resolve all sleep calls
          // We need to advance enough for all possible retries
          for (let i = 0; i < MAX_TOTAL_ATTEMPTS; i++) {
            await vi.advanceTimersByTimeAsync(16_000);
          }

          const result = await resultPromise;

          // Total attempts should never exceed 4
          expect(mockFetch).toHaveBeenCalledTimes(Math.min(failCount + 1, MAX_TOTAL_ATTEMPTS));

          if (failCount >= MAX_TOTAL_ATTEMPTS) {
            // All retries exhausted → returns null, doesn't throw
            expect(result).toBeNull();
          } else {
            // A retry succeeded → valid response returned
            expect(result).not.toBeNull();
            expect(result).toEqual(VALID_RESPONSE);
          }

          // Verify delays between retries match expected backoff
          for (let i = 1; i < attemptTimestamps.length; i++) {
            const actualDelay = attemptTimestamps[i] - attemptTimestamps[i - 1];
            const expectedDelay = RETRY_DELAYS_MS[i - 1];
            // Allow small tolerance for timer resolution
            expect(actualDelay).toBeGreaterThanOrEqual(expectedDelay - 10);
            expect(actualDelay).toBeLessThanOrEqual(expectedDelay + 100);
          }
        },
      ),
      { numRuns: 100 },
    );
  }, 60_000);

  // **Validates: Requirements 1.4**
  it('returns null without crashing when all retries fail', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate different error types
        fc.oneof(
          fc.constant('network'),
          fc.constant('timeout'),
          fc.constant('http-error'),
        ),
        async (errorType) => {
          vi.resetModules();

          const mockFetch = vi.fn(async () => {
            switch (errorType) {
              case 'network':
                throw new Error('Network error: ECONNREFUSED');
              case 'timeout':
                throw new DOMException('The operation was aborted', 'AbortError');
              case 'http-error':
                return {
                  ok: false,
                  status: 500,
                  statusText: 'Internal Server Error',
                } as unknown as Response;
              default:
                throw new Error('Unknown error');
            }
          });

          vi.stubGlobal('fetch', mockFetch);

          const { fetchSegment } = await import('../src/fetcher.js');

          const resultPromise = fetchSegment(SAMPLE_SEGMENT);

          // Advance timers through all retry delays
          for (let i = 0; i < MAX_TOTAL_ATTEMPTS; i++) {
            await vi.advanceTimersByTimeAsync(16_000);
          }

          const result = await resultPromise;

          // Should return null (graceful failure)
          expect(result).toBeNull();
          // Should have made exactly 4 attempts
          expect(mockFetch).toHaveBeenCalledTimes(MAX_TOTAL_ATTEMPTS);
        },
      ),
      { numRuns: 100 },
    );
  }, 60_000);
});
