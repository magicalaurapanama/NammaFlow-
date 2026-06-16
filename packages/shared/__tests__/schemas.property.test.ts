// Feature: orr-pulse, Property 4: Zod schema validation accepts valid and rejects invalid payloads
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { tomtomFlowSegmentSchema } from '../schemas';

describe('tomtomFlowSegmentSchema - Property 4', () => {
  // **Validates: Requirements 2.1, 2.2**
  it('accepts any object conforming to the schema shape', () => {
    const validPayload = fc.record({
      flowSegmentData: fc.record({
        currentSpeed: fc.double({ min: 0.001, max: 1e6, noNaN: true }),
        freeFlowSpeed: fc.double({ min: 0.001, max: 1e6, noNaN: true }),
        currentTravelTime: fc.double({ min: 0, max: 1e6, noNaN: true }),
        freeFlowTravelTime: fc.double({ min: 0, max: 1e6, noNaN: true }),
        confidence: fc.double({ min: 0, max: 1, noNaN: true }),
        roadClosure: fc.boolean(),
      }),
    });

    fc.assert(
      fc.property(validPayload, (payload) => {
        const result = tomtomFlowSegmentSchema.safeParse(payload);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.flowSegmentData.currentSpeed).toBe(payload.flowSegmentData.currentSpeed);
          expect(result.data.flowSegmentData.freeFlowSpeed).toBe(payload.flowSegmentData.freeFlowSpeed);
          expect(result.data.flowSegmentData.currentTravelTime).toBe(payload.flowSegmentData.currentTravelTime);
          expect(result.data.flowSegmentData.freeFlowTravelTime).toBe(payload.flowSegmentData.freeFlowTravelTime);
          expect(result.data.flowSegmentData.confidence).toBe(payload.flowSegmentData.confidence);
          expect(result.data.flowSegmentData.roadClosure).toBe(payload.flowSegmentData.roadClosure);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('rejects objects with missing required fields or invalid types', () => {
    const invalidPayloads = fc.oneof(
      // Missing flowSegmentData entirely
      fc.record({ other: fc.string() }),
      // flowSegmentData missing required fields
      fc.record({
        flowSegmentData: fc.record({
          currentSpeed: fc.double({ min: 0.001, max: 1e6, noNaN: true }),
        }),
      }),
      // Invalid types: string instead of number for currentSpeed
      fc.record({
        flowSegmentData: fc.record({
          currentSpeed: fc.string(),
          freeFlowSpeed: fc.double({ min: 0.001, max: 1e6, noNaN: true }),
          currentTravelTime: fc.double({ min: 0, max: 1e6, noNaN: true }),
          freeFlowTravelTime: fc.double({ min: 0, max: 1e6, noNaN: true }),
          confidence: fc.double({ min: 0, max: 1, noNaN: true }),
          roadClosure: fc.boolean(),
        }),
      }),
      // Invalid: negative currentSpeed (must be positive)
      fc.record({
        flowSegmentData: fc.record({
          currentSpeed: fc.double({ min: -1e6, max: 0, noNaN: true }),
          freeFlowSpeed: fc.double({ min: 0.001, max: 1e6, noNaN: true }),
          currentTravelTime: fc.double({ min: 0, max: 1e6, noNaN: true }),
          freeFlowTravelTime: fc.double({ min: 0, max: 1e6, noNaN: true }),
          confidence: fc.double({ min: 0, max: 1, noNaN: true }),
          roadClosure: fc.boolean(),
        }),
      }),
      // Invalid: confidence > 1
      fc.record({
        flowSegmentData: fc.record({
          currentSpeed: fc.double({ min: 0.001, max: 1e6, noNaN: true }),
          freeFlowSpeed: fc.double({ min: 0.001, max: 1e6, noNaN: true }),
          currentTravelTime: fc.double({ min: 0, max: 1e6, noNaN: true }),
          freeFlowTravelTime: fc.double({ min: 0, max: 1e6, noNaN: true }),
          confidence: fc.double({ min: 1.001, max: 100, noNaN: true }),
          roadClosure: fc.boolean(),
        }),
      }),
      // Invalid: roadClosure is a string instead of boolean
      fc.record({
        flowSegmentData: fc.record({
          currentSpeed: fc.double({ min: 0.001, max: 1e6, noNaN: true }),
          freeFlowSpeed: fc.double({ min: 0.001, max: 1e6, noNaN: true }),
          currentTravelTime: fc.double({ min: 0, max: 1e6, noNaN: true }),
          freeFlowTravelTime: fc.double({ min: 0, max: 1e6, noNaN: true }),
          confidence: fc.double({ min: 0, max: 1, noNaN: true }),
          roadClosure: fc.string(),
        }),
      }),
    );

    fc.assert(
      fc.property(invalidPayloads, (payload) => {
        const result = tomtomFlowSegmentSchema.safeParse(payload);
        expect(result.success).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});
