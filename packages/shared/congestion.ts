/**
 * Computes the congestion index for a road segment.
 * Formula: 1 - (currentSpeed / freeFlowSpeed), clamped to [0, 1].
 */
export function computeCongestionIndex(
  currentSpeed: number,
  freeFlowSpeed: number,
): number {
  const raw = 1 - currentSpeed / freeFlowSpeed;
  return Math.max(0, Math.min(1, raw));
}
