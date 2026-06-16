'use client';

import useSWR from 'swr';
import { SEGMENTS } from '@orr-pulse/shared';
import { getCongestionColor } from '@/lib/color';

interface CorridorSegment {
  id: string;
  name: string;
  currentSpeed: number;
  freeFlowSpeed: number;
  congestionIndex: number;
  currentTravelTime: number;
  freeFlowTravelTime: number;
  confidence: number;
  roadClosure: boolean;
  timestamp: string;
}

interface CorridorNowResponse {
  segments: CorridorSegment[];
  updatedAt: string;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const BLOCK_WIDTH = 100;
const BLOCK_HEIGHT = 64;
const BLOCK_GAP = 4;
const PADDING_X = 8;
const PADDING_Y = 24;
const TOTAL_WIDTH =
  PADDING_X * 2 + SEGMENTS.length * BLOCK_WIDTH + (SEGMENTS.length - 1) * BLOCK_GAP;
const TOTAL_HEIGHT = PADDING_Y * 2 + BLOCK_HEIGHT;

function truncateName(name: string, maxLen: number = 10): string {
  if (name.length <= maxLen) return name;
  return name.slice(0, maxLen - 1) + '…';
}

function formatCI(ci: number): string {
  return (ci * 100).toFixed(0) + '%';
}

function SkeletonStrip() {
  return (
    <div className="card animate-pulse">
      <div className="mb-2 h-4 w-32 rounded bg-surface-overlay" />
      <div className="h-28 w-full rounded bg-surface-overlay" />
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="card border-accent-red/30">
      <p className="text-sm text-gray-400">
        <span className="text-accent-red font-medium">Error:</span> {message}
      </p>
    </div>
  );
}

export function CorridorStrip() {
  const { data, error, isLoading } = useSWR<CorridorNowResponse>(
    '/api/corridor/now',
    fetcher,
    { refreshInterval: 60000 }
  );

  if (isLoading) return <SkeletonStrip />;
  if (error) return <ErrorState message="Unable to load corridor data" />;
  if (!data || !data.segments || data.segments.length === 0) {
    return <ErrorState message="No corridor data available" />;
  }

  // Map API segments by ID for fast lookup
  const segmentMap = new Map(data.segments.map((s) => [s.id, s]));

  return (
    <div className="card">
      <h2 className="mb-3 text-sm font-semibold text-gray-300 uppercase tracking-wide">
        Corridor Status
      </h2>
      <div className="overflow-x-auto -mx-4 px-4">
        <svg
          viewBox={`0 0 ${TOTAL_WIDTH} ${TOTAL_HEIGHT}`}
          className="w-full min-w-[640px]"
          role="img"
          aria-label="Corridor congestion strip showing 10 segments from Silk Board to KR Puram"
        >
          {SEGMENTS.map((seg, i) => {
            const reading = segmentMap.get(seg.id);
            const ci = reading?.congestionIndex ?? 0;
            const color = getCongestionColor(ci);
            const x = PADDING_X + i * (BLOCK_WIDTH + BLOCK_GAP);
            const y = PADDING_Y;

            return (
              <g key={seg.id}>
                {/* Block rectangle */}
                <rect
                  x={x}
                  y={y}
                  width={BLOCK_WIDTH}
                  height={BLOCK_HEIGHT}
                  rx={6}
                  ry={6}
                  fill={color}
                  opacity={reading ? 1 : 0.3}
                />

                {/* Segment name above block */}
                <text
                  x={x + BLOCK_WIDTH / 2}
                  y={y - 6}
                  textAnchor="middle"
                  className="fill-gray-400"
                  fontSize="9"
                  fontFamily="system-ui, sans-serif"
                >
                  {truncateName(seg.name)}
                </text>

                {/* CI value inside block */}
                <text
                  x={x + BLOCK_WIDTH / 2}
                  y={y + BLOCK_HEIGHT / 2 + 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="fill-white"
                  fontSize="14"
                  fontWeight="bold"
                  fontFamily="system-ui, sans-serif"
                >
                  {reading ? formatCI(ci) : '—'}
                </text>

                {/* CI label below value */}
                <text
                  x={x + BLOCK_WIDTH / 2}
                  y={y + BLOCK_HEIGHT / 2 + 18}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="fill-white/70"
                  fontSize="8"
                  fontFamily="system-ui, sans-serif"
                >
                  CI
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
