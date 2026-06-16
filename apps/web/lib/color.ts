/**
 * CI-to-color ramp mapping.
 * Green for free-flowing, amber for moderate congestion, red for heavy congestion.
 *
 * Feature: orr-pulse, Property 12: CI color ramp mapping correctness
 */

export const COLOR_GREEN = '#22c55e';
export const COLOR_AMBER = '#f59e0b';
export const COLOR_RED = '#ef4444';

/**
 * Maps a congestion index value to a hex color string.
 *
 * @param ci - Congestion index in [0, 1]
 * @returns Hex color: green for [0, 0.3), amber for [0.3, 0.6), red for [0.6, 1.0]
 */
export function getCongestionColor(ci: number): string {
  if (ci < 0.3) return COLOR_GREEN;
  if (ci < 0.6) return COLOR_AMBER;
  return COLOR_RED;
}
