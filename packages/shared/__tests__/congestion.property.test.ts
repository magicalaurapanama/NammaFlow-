// Feature: orr-pulse, Property 5: Congestion Index computation correctness
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { computeCongestionIndex } from '../congestion';

describe('computeCongestionIndex - Property 5', () => {
  // **Validates: Requirements 2.3**
  it('equals 1 - (currentSpeed / freeFlowSpeed) clamped to [0, 1] for any positive inputs', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.001, max: 1e6, noNaN: true }),
        fc.double({ min: 0.001, max: 1e6, noNaN: true }),
        (currentSpeed, freeFlowSpeed) => {
          const result = computeCongestionIndex(currentSpeed, freeFlowSpeed);
          const expected = Math.max(0, Math.min(1, 1 - currentSpeed / freeFlowSpeed));

          expect(result).toBeCloseTo(expected, 10);
          expect(result).toBeGreaterThanOrEqual(0);
          expect(result).toBeLessThanOrEqual(1);
        },
      ),
      { numRuns: 100 },
    );
  });
});
