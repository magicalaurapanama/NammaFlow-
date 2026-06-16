// Feature: orr-pulse, Property 3: Confidence filter preserves only high-confidence readings
import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';

// Mock logger to suppress output during tests
vi.mock('../src/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { validateAndFilter } from '../src/validator.js';
import { SEGMENT_IDS } from '@orr-pulse/shared';

const CONFIDENCE_THRESHOLD = 0.5;

/**
 * Generates a valid TomTom flow segment response with the given confidence value.
 */
function buildValidResponse(confidence: number) {
  return {
    flowSegmentData: {
      currentSpeed: 45.5,
      freeFlowSpeed: 65.0,
      currentTravelTime: 42.3,
      freeFlowTravelTime: 30.1,
      confidence,
      roadClosure: false,
    },
  };
}

/**
 * Arbitrary for a valid TomTom flow segment response with arbitrary confidence in [0, 1].
 */
const arbFlowResponse = fc.record({
  currentSpeed: fc.double({ min: 0.01, max: 200, noNaN: true }),
  freeFlowSpeed: fc.double({ min: 0.01, max: 200, noNaN: true }),
  currentTravelTime: fc.double({ min: 0, max: 3600, noNaN: true }),
  freeFlowTravelTime: fc.double({ min: 0, max: 3600, noNaN: true }),
  confidence: fc.double({ min: 0, max: 1, noNaN: true }),
  roadClosure: fc.boolean(),
});

/**
 * Arbitrary for a raw response entry (segmentId + TomTom data).
 */
const arbRawResponse = fc.tuple(
  fc.constantFrom(...SEGMENT_IDS),
  arbFlowResponse,
).map(([segmentId, flowData]) => ({
  segmentId,
  data: { flowSegmentData: flowData },
}));

describe('Confidence filter - Property 3', () => {
  // **Validates: Requirements 1.5**
  it('discards readings with confidence < 0.5 and preserves readings with confidence >= 0.5', () => {
    fc.assert(
      fc.property(
        fc.array(arbRawResponse, { minLength: 1, maxLength: 20 }),
        (rawResponses) => {
          const results = validateAndFilter(rawResponses);

          // Separate inputs by confidence threshold
          const highConfidenceInputs = rawResponses.filter(
            (r) => (r.data as any).flowSegmentData.confidence >= CONFIDENCE_THRESHOLD,
          );
          const lowConfidenceInputs = rawResponses.filter(
            (r) => (r.data as any).flowSegmentData.confidence < CONFIDENCE_THRESHOLD,
          );

          // All results should have confidence >= 0.5
          for (const reading of results) {
            expect(reading.confidence).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLD);
          }

          // No result should have come from a low-confidence input
          for (const low of lowConfidenceInputs) {
            const found = results.find(
              (r) =>
                r.segmentId === low.segmentId &&
                r.confidence === (low.data as any).flowSegmentData.confidence,
            );
            expect(found).toBeUndefined();
          }

          // The number of results should equal the number of high-confidence inputs
          // (assuming all high-confidence inputs pass Zod validation, which they should
          // since we generate valid data)
          expect(results.length).toBe(highConfidenceInputs.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  // **Validates: Requirements 1.5**
  it('preserved readings have their data unchanged', () => {
    fc.assert(
      fc.property(
        fc.array(arbRawResponse, { minLength: 1, maxLength: 20 }),
        (rawResponses) => {
          const results = validateAndFilter(rawResponses);

          // For each result, find the corresponding input and verify data integrity
          for (const reading of results) {
            const matchingInput = rawResponses.find(
              (r) =>
                r.segmentId === reading.segmentId &&
                (r.data as any).flowSegmentData.confidence === reading.confidence &&
                (r.data as any).flowSegmentData.currentSpeed === reading.currentSpeed &&
                (r.data as any).flowSegmentData.freeFlowSpeed === reading.freeFlowSpeed,
            );

            expect(matchingInput).toBeDefined();

            const flowData = (matchingInput!.data as any).flowSegmentData;
            expect(reading.currentSpeed).toBe(flowData.currentSpeed);
            expect(reading.freeFlowSpeed).toBe(flowData.freeFlowSpeed);
            expect(reading.currentTravelTime).toBe(flowData.currentTravelTime);
            expect(reading.freeFlowTravelTime).toBe(flowData.freeFlowTravelTime);
            expect(reading.confidence).toBe(flowData.confidence);
            expect(reading.roadClosure).toBe(flowData.roadClosure);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
