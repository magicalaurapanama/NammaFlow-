import { CorridorStrip } from '@/components/CorridorStrip';
import { Heatmap } from '@/components/Heatmap';
import { BestWindowCard } from '@/components/BestWindowCard';
import { SegmentTrend } from '@/components/SegmentTrend';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export default function Home() {
  return (
    <div className="grid grid-cols-1 gap-4">
      {/* Top row: Corridor strip (full width) */}
      <ErrorBoundary fallbackTitle="Corridor strip failed to load">
        <CorridorStrip />
      </ErrorBoundary>

      {/* Second row: BestWindowCard (1/3) + Heatmap (2/3) on desktop; stacked on tablet */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ErrorBoundary fallbackTitle="Recommendations failed to load">
          <BestWindowCard />
        </ErrorBoundary>
        <div className="md:col-span-2">
          <ErrorBoundary fallbackTitle="Heatmap failed to load">
            <Heatmap />
          </ErrorBoundary>
        </div>
      </div>

      {/* Third row: Segment trend (full width) */}
      <ErrorBoundary fallbackTitle="Segment trends failed to load">
        <SegmentTrend />
      </ErrorBoundary>
    </div>
  );
}
