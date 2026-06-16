// Feature: orr-pulse, Property 8: Segment history returns only readings within the time window
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { SEGMENT_IDS, type SegmentId } from '@orr-pulse/shared';
import { filterByTimeWindow } from '../lib/queries';
import type { TrafficReading } from '@orr-pulse/shared';

/**
 * Generate a segment ID from the predefined list.
 */
const segmentIdArb = fc.constantFrom(...SEGMENT_IDS);

/**
 * Fixed reference point for "now" used across tests.
 */
const NOW = new Date('2024-06-15T12:00:00Z');

/**
 * Arbitrary generator for a TrafficReading with a given segmentId and time ISO string.
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
 * Generate timestamps spread across a wide range (some within window, some outside).
 * Range: up to 2 weeks before "now" and up to 1 day after "now".
 */
const timestampArb = fc
  .date({
    min: new Date(NOW.getTime() - 14 * 24 * 3600 * 1000), // 14 days before now
    max: new Date(NOW.getTime() + 1 * 24 * 3600 * 1000), // 1 day after now
  })
  .map((d) => d.toISOString());

/**
 * Generate hours value between 1 and 168 (1 week).
 */
const hoursArb = fc.integer({ min: 1, max: 168 });

describe('filterByTimeWindow - Property 8', () => {
  // **Validates: Requirements 6.1**
  it('all returned readings have timestamps within [now - hours, now]', () => {
    fc.assert(
      fc.property(
        fc.array(trafficReadingArb(segmentIdArb, timestampArb), { minLength: 1, maxLength: 50 }),
        segmentIdArb,
        hoursArb,
        (readings, segmentId, hours) => {
          const result = filterByTimeWindow(readings, segmentId, NOW, hours);
          const windowStart = new Date(NOW.getTime() - hours * 3600 * 1000);

          for (const reading of result) {
            const readingTime = new Date(reading.time);
            expect(readingTime.getTime()).toBeGreaterThanOrEqual(windowStart.getTime());
            expect(readingTime.getTime()).toBeLessThanOrEqual(NOW.getTime());
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // **Validates: Requirements 6.1**
  it('all returned readings have the correct segmentId', () => {
    fc.assert(
      fc.property(
        fc.array(trafficReadingArb(segmentIdArb, timestampArb), { minLength: 1, maxLength: 50 }),
        segmentIdArb,
        hoursArb,
        (readings, segmentId, hours) => {
          const result = filterByTimeWindow(readings, segmentId, NOW, hours);

          for (const reading of result) {
            expect(reading.segmentId).toBe(segmentId);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // **Validates: Requirements 6.1**
  it('no reading within the window was omitted', () => {
    fc.assert(
      fc.property(
        fc.array(trafficReadingArb(segmentIdArb, timestampArb), { minLength: 1, maxLength: 50 }),
        segmentIdArb,
        hoursArb,
        (readings, segmentId, hours) => {
          const result = filterByTimeWindow(readings, segmentId, NOW, hours);
          const windowStart = new Date(NOW.getTime() - hours * 3600 * 1000);

          // Find all readings that should be in the window
          const expectedInWindow = readings.filter((r) => {
            if (r.segmentId !== segmentId) return false;
            const t = new Date(r.time);
            return t >= windowStart && t <= NOW;
          });

          // Every reading that belongs in the window must be in the result
          expect(result.length).toBe(expectedInWindow.length);

          for (const expected of expectedInWindow) {
            const found = result.some(
              (r) => r.time === expected.time && r.segmentId === expected.segmentId &&
                     r.currentSpeed === expected.currentSpeed,
            );
            expect(found).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // **Validates: Requirements 6.1**
  it('results are sorted by time ascending', () => {
    fc.assert(
      fc.property(
        fc.array(trafficReadingArb(segmentIdArb, timestampArb), { minLength: 1, maxLength: 50 }),
        segmentIdArb,
        hoursArb,
        (readings, segmentId, hours) => {
          const result = filterByTimeWindow(readings, segmentId, NOW, hours);

          for (let i = 1; i < result.length; i++) {
            const prevTime = new Date(result[i - 1].time).getTime();
            const currTime = new Date(result[i].time).getTime();
            expect(currTime).toBeGreaterThanOrEqual(prevTime);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // **Validates: Requirements 6.1**
  it('returns empty array when no readings match segment or window', () => {
    const result = filterByTimeWindow([], 'silk-board', NOW, 48);
    expect(result).toEqual([]);
  });
});
