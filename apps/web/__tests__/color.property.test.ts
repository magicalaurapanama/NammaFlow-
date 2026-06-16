// Feature: orr-pulse, Property 12: CI color ramp mapping correctness
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  getCongestionColor,
  COLOR_GREEN,
  COLOR_AMBER,
  COLOR_RED,
} from '../lib/color';

describe('getCongestionColor - Property 12', () => {
  // **Validates: Requirements 8.2, 9.2**
  it('returns green for CI in [0, 0.3)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 0.3, noNaN: true, maxExcluded: true }),
        (ci) => {
          expect(getCongestionColor(ci)).toBe(COLOR_GREEN);
        },
      ),
      { numRuns: 100 },
    );
  });

  // **Validates: Requirements 8.2, 9.2**
  it('returns amber for CI in [0.3, 0.6)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.3, max: 0.6, noNaN: true, maxExcluded: true }),
        (ci) => {
          expect(getCongestionColor(ci)).toBe(COLOR_AMBER);
        },
      ),
      { numRuns: 100 },
    );
  });

  // **Validates: Requirements 8.2, 9.2**
  it('returns red for CI in [0.6, 1.0]', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.6, max: 1.0, noNaN: true }),
        (ci) => {
          expect(getCongestionColor(ci)).toBe(COLOR_RED);
        },
      ),
      { numRuns: 100 },
    );
  });

  // **Validates: Requirements 8.2, 9.2**
  it('maps boundary values correctly', () => {
    // Exact boundary: 0 → green
    expect(getCongestionColor(0)).toBe(COLOR_GREEN);
    // Exact boundary: 0.3 → amber
    expect(getCongestionColor(0.3)).toBe(COLOR_AMBER);
    // Exact boundary: 0.6 → red
    expect(getCongestionColor(0.6)).toBe(COLOR_RED);
    // Exact boundary: 1.0 → red
    expect(getCongestionColor(1.0)).toBe(COLOR_RED);
  });
});
