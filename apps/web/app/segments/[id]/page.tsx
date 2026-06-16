import { notFound } from 'next/navigation';
import Link from 'next/link';
import { SEGMENTS, SEGMENT_IDS, type SegmentId } from '@orr-pulse/shared';
import { SegmentHistoryChart } from '@/components/SegmentHistoryChart';

interface SegmentPageProps {
  params: { id: string };
}

export default function SegmentDetailPage({ params }: SegmentPageProps) {
  const segmentId = params.id;

  if (!SEGMENT_IDS.includes(segmentId as SegmentId)) {
    notFound();
  }

  const segment = SEGMENTS.find((s) => s.id === segmentId)!;

  return (
    <div className="grid grid-cols-1 gap-4">
      {/* Back link */}
      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5" />
            <path d="m12 19-7-7 7-7" />
          </svg>
          Back to Dashboard
        </Link>
      </div>

      {/* Segment header */}
      <div className="card">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <h2 className="text-xl font-bold text-gray-50">{segment.name}</h2>
          <span className="badge bg-surface-overlay text-gray-300">
            Position {segment.position + 1} of {SEGMENTS.length}
          </span>
        </div>
        <div className="flex flex-wrap gap-4 text-sm text-gray-400">
          <span>
            Latitude: <span className="text-gray-200">{segment.lat.toFixed(4)}</span>
          </span>
          <span>
            Longitude: <span className="text-gray-200">{segment.lon.toFixed(4)}</span>
          </span>
          <span>
            Segment ID: <code className="text-gray-200 bg-surface-overlay px-1.5 py-0.5 rounded text-xs">{segment.id}</code>
          </span>
        </div>
      </div>

      {/* 48-hour history chart */}
      <SegmentHistoryChart segmentId={segmentId} />
    </div>
  );
}
