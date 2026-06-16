import { SEGMENTS } from '@orr-pulse/shared';
import { fetchAllSegments } from './fetcher.js';
import { validateAndFilter } from './validator.js';
import { batchInsert } from './writer.js';
import { logger } from './logger.js';

/**
 * Runs a single poll cycle:
 * 1. Fetches traffic data for all segments from TomTom API
 * 2. Validates responses and filters low-confidence readings
 * 3. Batch-inserts valid readings into the database
 */
export async function runPollCycle(): Promise<void> {
  const startTime = Date.now();

  logger.info({ segmentCount: SEGMENTS.length }, 'Poll cycle started');

  // Step 1: Fetch all segments
  const responses = await fetchAllSegments(SEGMENTS);

  // Step 2: Map to validator input format and validate/filter
  const rawResponses = responses.map((r) => ({
    segmentId: r.segmentId,
    data: r,
  }));

  const validReadings = validateAndFilter(rawResponses);

  // Step 3: Batch insert valid readings
  const written = await batchInsert(validReadings);

  const elapsed = Date.now() - startTime;

  logger.info(
    {
      segmentsPolled: SEGMENTS.length,
      responsesReceived: responses.length,
      validReadings: validReadings.length,
      written,
      elapsedMs: elapsed,
    },
    'Poll cycle completed',
  );
}
