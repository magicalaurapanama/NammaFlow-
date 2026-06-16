import type { SegmentConfig, TomTomFlowSegment } from '@orr-pulse/shared';

/**
 * Mock TomTom client for development.
 * Returns randomized but realistic TomTom flow segment responses.
 * Simulates ~200ms latency with random jitter.
 */
export async function fetchSegmentMock(
  segmentConfig: SegmentConfig
): Promise<TomTomFlowSegment> {
  // Simulate network latency: 150–250ms
  const latency = 150 + Math.random() * 100;
  await new Promise((resolve) => setTimeout(resolve, latency));

  // Generate realistic values based on segment position
  // Downstream segments tend to be slightly slower during congestion
  const positionFactor = 1 + segmentConfig.position * 0.02;
  const freeFlowSpeed = 55 + Math.random() * 25; // 55–80 km/h
  const speedRatio = 0.3 + Math.random() * 0.7; // 30%–100% of free flow
  const currentSpeed = Math.max(5, freeFlowSpeed * speedRatio / positionFactor);

  const freeFlowTravelTime = 30 + Math.random() * 60; // 30–90 seconds
  const currentTravelTime =
    freeFlowTravelTime * (freeFlowSpeed / Math.max(currentSpeed, 1));

  const confidence = 0.5 + Math.random() * 0.5; // 0.5–1.0 (mostly high confidence)
  const roadClosure = Math.random() < 0.02; // 2% chance of road closure

  return {
    flowSegmentData: {
      currentSpeed: Math.round(currentSpeed * 100) / 100,
      freeFlowSpeed: Math.round(freeFlowSpeed * 100) / 100,
      currentTravelTime: Math.round(currentTravelTime * 100) / 100,
      freeFlowTravelTime: Math.round(freeFlowTravelTime * 100) / 100,
      confidence: Math.round(confidence * 1000) / 1000,
      roadClosure,
    },
  };
}
