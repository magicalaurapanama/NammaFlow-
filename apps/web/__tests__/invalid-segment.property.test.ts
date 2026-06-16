// Feature: orr-pulse, Property 9: Invalid segment identifiers produce error responses
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { SEGMENT_IDS } from '@orr-pulse/shared';
import { validateSegmentId } from '../lib/queries';

/**
 * Arbitrary that generates strings NOT in SEGMENT_IDS.
 * Uses oneof to cover various invalid patterns: random strings,
 * known invalid values, empty strings, and near-miss typos.
 */
const invalidSegmentIdArb = fc
  .oneof(
    fc.string(),
    fc.constant('invalid-segment'),
    fc.constant(''),
    fc.constant('silk_board'), // underscore instead of hyphen
    fc.constant('SILK-BOARD'), // wrong case
    fc.constant('silk-board '), // trailing space
    fc.constant('unknown'),
  )
  .filter((s) => !SEGMENT_IDS.includes(s as any));

/**
 * Arbitrary that generates valid segment IDs from the predefined list.
 */
const validSegmentIdArb = fc.constantFrom(...SEGMENT_IDS);

describe('validateSegmentId - Property 9', () => {
  // **Validates: Requirements 6.3, 7.4**
  it('invalid segment IDs produce error responses (maps to 404 for history, 400 for recommendations)', () => {
    fc.assert(
      fc.property(invalidSegmentIdArb, (id) => {
        const result = validateSegmentId(id);
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.error).toBe('Segment not found');
        }
      }),
      { numRuns: 100 },
    );
  });

  // **Validates: Requirements 6.3, 7.4**
  it('valid segment IDs produce success responses', () => {
    fc.assert(
      fc.property(validSegmentIdArb, (id) => {
        const result = validateSegmentId(id);
        expect(result.valid).toBe(true);
        if (result.valid) {
          expect(result.id).toBe(id);
        }
      }),
      { numRuns: 100 },
    );
  });
});
