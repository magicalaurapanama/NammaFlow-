import pLimit from 'p-limit';
import type { SegmentConfig, TomTomFlowSegment } from '@orr-pulse/shared';
import { logger } from './logger.js';
import { fetchSegmentMock } from './mock-client.js';

const TOMTOM_API_KEY = process.env.TOMTOM_API_KEY ?? '';
const TOMTOM_MOCK = process.env.TOMTOM_MOCK === 'true';
const CONCURRENCY_LIMIT = 3;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [1_000, 4_000, 16_000];

/**
 * Sleep utility for backoff delays.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Build the TomTom Traffic Flow Segment Data API v4 URL.
 */
function buildUrl(lat: number, lon: number): string {
  return `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?point=${lat},${lon}&key=${TOMTOM_API_KEY}`;
}

/**
 * Fetch a single segment from TomTom API with timeout and exponential backoff retry.
 * Returns null if all retries fail.
 */
export async function fetchSegment(
  segmentConfig: SegmentConfig
): Promise<TomTomFlowSegment | null> {
  if (TOMTOM_MOCK) {
    return fetchSegmentMock(segmentConfig);
  }

  const url = buildUrl(segmentConfig.lat, segmentConfig.lon);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as TomTomFlowSegment;
      return data;
    } catch (error) {
      const isLastAttempt = attempt === MAX_RETRIES;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      if (isLastAttempt) {
        logger.error(
          { segmentId: segmentConfig.id, attempt: attempt + 1, error: errorMessage },
          'All retries exhausted for segment'
        );
        return null;
      }

      const delay = RETRY_DELAYS_MS[attempt];
      logger.warn(
        { segmentId: segmentConfig.id, attempt: attempt + 1, delay, error: errorMessage },
        'Fetch failed, retrying'
      );
      await sleep(delay);
    }
  }

  return null;
}

/**
 * Fetch all segments with concurrency limit (p-limit of 3).
 * Returns an array of successful responses with their segment IDs attached.
 * Segments that fail all retries are excluded from the result.
 */
export async function fetchAllSegments(
  segments: SegmentConfig[]
): Promise<(TomTomFlowSegment & { segmentId: string })[]> {
  const limit = pLimit(CONCURRENCY_LIMIT);

  const tasks = segments.map((segment) =>
    limit(async (): Promise<(TomTomFlowSegment & { segmentId: string }) | null> => {
      const result = await fetchSegment(segment);
      if (result === null) {
        return null;
      }
      return { ...result, segmentId: segment.id as string };
    })
  );

  const results = await Promise.all(tasks);
  return results.filter(
    (r): r is TomTomFlowSegment & { segmentId: string } => r !== null
  );
}
