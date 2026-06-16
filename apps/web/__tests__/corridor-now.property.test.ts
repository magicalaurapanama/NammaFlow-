// Feature: orr-pulse, Property 6: Corridor now returns only the latest reading per segment
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { SEGMENT_IDS, type SegmentId } from '@orr-pulse/shared';
import { selectLatestPerSegment } from '../lib/queries';
import type { TrafficReading } from '@orr-pulse/shared';

/**
 * Arbitrary generator for a TrafficReading with a given segmentId and timestamp.
 */
function trafficReadingArb(
  segmentId: fc.Arbitrary<SegmentId>,
  time: fc.Arbitrary<string>,
): fc.Arbitrary<TrafficReading> {
  return fc.record({
    segmentId,
    time,
    currentSpeed: fc.double({ min: 1, max: 120, noNaN: true }),
    freeFlowSpeed: fc.double({ min: 1, max: 120, noNaN: true }),
    currentTravelTime: fc.double({ min: 0, max: 600, noNaN: true }),
    freeFlowTravelTime: fc.double({ min: 0, max: 600, noNaN: true }),
    confidence: fc.double({ min: 0.5, max: 1, noNaN: true }),
    congestionIndex: fc.double({ min: 0, max: 1, noNaN: true }),
    roadClosure: fc.boolean(),
  });
}

/**
 * Generate an ISO timestamp string from a random date within a reasonable range.
 */
const timestampArb = fc
  .date({
    min: new Date('2024-01-01T00:00:00Z'),
    max: new Date('2024-12-31T23:59:59Z'),
  })
  .map((d) => d.toISOString());

/**
 * Generate a segment ID from the predefined list.
 */
const segmentIdArb = fc.constantFrom(...SEGMENT_IDS);

describe('selectLatestPerSegment - Property 6', () => {
  // **Validates: Requirements 4.1, 4.2**
  it('returns at most one reading per segment', () => {
    fc.assert(
      fc.property(
        fc.array(trafficReadingArb(segmentIdArb, timestampArb), { minLength: 1, maxLength: 50 }),
        (readings) => {
          const result = selectLatestPerSegment(readings);

          // Check uniqueness: no duplicate segment IDs in result
          const segmentIds = result.map((r) => r.segmentId);
          const uniqueIds = new Set(segmentIds);
          expect(uniqueIds.size).toBe(segmentIds.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  // **Validates: Requirements 4.1, 4.2**
  it('each returned reading has the maximum timestamp for its segment', () => {
    fc.assert(
      fc.property(
        fc.array(trafficReadingArb(segmentIdArb, timestampArb), { minLength: 1, maxLength: 50 }),
        (readings) => {
          const result = selectLatestPerSegment(readings);

          for (const selected of result) {
            // Find all readings for this segment in the input
            const segmentReadings = readings.filter((r) => r.segmentId === selected.segmentId);

            // The selected timestamp must be the maximum
            const maxTime = segmentReadings.reduce(
              (max, r) => (r.time > max ? r.time : max),
              segmentReadings[0].time,
            );

            expect(selected.time).toBe(maxTime);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // **Validates: Requirements 4.1, 4.2**
  it('no reading with a later timestamp for the same segment was excluded', () => {
    fc.assert(
      fc.property(
        fc.array(trafficReadingArb(segmentIdArb, timestampArb), { minLength: 1, maxLength: 50 }),
        (readings) => {
          const result = selectLatestPerSegment(readings);
          const resultMap = new Map(result.map((r) => [r.segmentId, r]));

          // For every reading in the input, if it has a later timestamp than
          // the selected one for the same segment, that's a violation.
          for (const reading of readings) {
            const selected = resultMap.get(reading.segmentId);
            expect(selected).toBeDefined();
            // The selected timestamp must be >= any other reading's timestamp for that segment
            expect(selected!.time >= reading.time).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // **Validates: Requirements 4.1, 4.2**
  it('covers all segments present in the input', () => {
    fc.assert(
      fc.property(
        fc.array(trafficReadingArb(segmentIdArb, timestampArb), { minLength: 1, maxLength: 50 }),
        (readings) => {
          const result = selectLatestPerSegment(readings);

          // Every segment in the input must be represented in the result
          const inputSegments = new Set(readings.map((r) => r.segmentId));
          const resultSegments = new Set(result.map((r) => r.segmentId));

          expect(resultSegments).toEqual(inputSegments);
        },
      ),
      { numRuns: 100 },
    );
  });

  // **Validates: Requirements 4.1, 4.2**
  it('returns empty array for empty input', () => {
    const result = selectLatestPerSegment([]);
    expect(result).toEqual([]);
  });
});
