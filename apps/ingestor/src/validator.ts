import {
  tomtomFlowSegmentSchema,
  computeCongestionIndex,
} from '@orr-pulse/shared';
import type { TrafficReading, SegmentId } from '@orr-pulse/shared';
import { logger } from './logger.js';

const CONFIDENCE_THRESHOLD = 0.5;

/**
 * Validates raw TomTom API responses, computes congestion index,
 * and filters out low-confidence readings.
 *
 * For each response:
 * 1. Parses with Zod schema (discards on failure)
 * 2. Checks confidence >= 0.5 (discards on failure)
 * 3. Computes congestionIndex
 * 4. Constructs TrafficReading with current timestamp
 */
export function validateAndFilter(
  rawResponses: Array<{ segmentId: string; data: unknown }>,
): TrafficReading[] {
  const now = new Date().toISOString();
  const results: TrafficReading[] = [];

  for (const { segmentId, data } of rawResponses) {
    // Step 1: Zod schema validation
    const parseResult = tomtomFlowSegmentSchema.safeParse(data);

    if (!parseResult.success) {
      logger.warn(
        { segmentId, error: parseResult.error.message },
        'Validation failed: discarding reading',
      );
      continue;
    }

    const { flowSegmentData } = parseResult.data;

    // Step 2: Confidence filter
    if (flowSegmentData.confidence < CONFIDENCE_THRESHOLD) {
      logger.info(
        { segmentId, confidence: flowSegmentData.confidence },
        'Low confidence: discarding reading',
      );
      continue;
    }

    // Step 3: Compute congestion index
    const congestionIndex = computeCongestionIndex(
      flowSegmentData.currentSpeed,
      flowSegmentData.freeFlowSpeed,
    );

    // Step 4: Construct TrafficReading
    results.push({
      segmentId: segmentId as SegmentId,
      time: now,
      currentSpeed: flowSegmentData.currentSpeed,
      freeFlowSpeed: flowSegmentData.freeFlowSpeed,
      currentTravelTime: flowSegmentData.currentTravelTime,
      freeFlowTravelTime: flowSegmentData.freeFlowTravelTime,
      confidence: flowSegmentData.confidence,
      congestionIndex,
      roadClosure: flowSegmentData.roadClosure,
    });
  }

  return results;
}
