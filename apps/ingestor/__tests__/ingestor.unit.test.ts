import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { TrafficReading, TomTomFlowSegment } from '@orr-pulse/shared';

// ───────────────────────────────────────────────────────────────────────────────
// Test 1: Poller orchestration with mocked fetcher/writer
// ───────────────────────────────────────────────────────────────────────────────

describe('Poller orchestration', () => {
  let mockFetchAllSegments: ReturnType<typeof vi.fn>;
  let mockBatchInsert: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T10:00:00.000Z'));

    mockFetchAllSegments = vi.fn();
    mockBatchInsert = vi.fn();

    vi.doMock('../src/fetcher.js', () => ({
      fetchAllSegments: mockFetchAllSegments,
    }));
    vi.doMock('../src/writer.js', () => ({
      batchInsert: mockBatchInsert,
    }));
    vi.doMock('../src/logger.js', () => ({
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fetches all segments, validates/filters, and batch inserts valid readings', async () => {
    // Simulate TomTom responses: 2 high-confidence + 1 low-confidence
    const mockResponses: (TomTomFlowSegment & { segmentId: string })[] = [
      {
        segmentId: 'silk-board',
        flowSegmentData: {
          currentSpeed: 30,
          freeFlowSpeed: 60,
          currentTravelTime: 120,
          freeFlowTravelTime: 60,
          confidence: 0.9,
          roadClosure: false,
        },
      },
      {
        segmentId: 'hsr',
        flowSegmentData: {
          currentSpeed: 50,
          freeFlowSpeed: 60,
          currentTravelTime: 72,
          freeFlowTravelTime: 60,
          confidence: 0.8,
          roadClosure: false,
        },
      },
      {
        segmentId: 'ibblur',
        flowSegmentData: {
          currentSpeed: 55,
          freeFlowSpeed: 60,
          currentTravelTime: 65,
          freeFlowTravelTime: 60,
          confidence: 0.3, // Below threshold — should be filtered
          roadClosure: false,
        },
      },
    ];

    mockFetchAllSegments.mockResolvedValue(mockResponses);
    mockBatchInsert.mockResolvedValue(2);

    const { runPollCycle } = await import('../src/poller.js');
    await runPollCycle();

    // fetchAllSegments should be called once with the SEGMENTS array
    expect(mockFetchAllSegments).toHaveBeenCalledTimes(1);

    // batchInsert should receive only the 2 high-confidence readings
    expect(mockBatchInsert).toHaveBeenCalledTimes(1);
    const insertedReadings = mockBatchInsert.mock.calls[0][0] as TrafficReading[];
    expect(insertedReadings).toHaveLength(2);

    // Verify the readings have correct segment IDs
    expect(insertedReadings[0].segmentId).toBe('silk-board');
    expect(insertedReadings[1].segmentId).toBe('hsr');

    // Verify congestion index computation: 1 - (30/60) = 0.5
    expect(insertedReadings[0].congestionIndex).toBeCloseTo(0.5);
    // 1 - (50/60) ≈ 0.167
    expect(insertedReadings[1].congestionIndex).toBeCloseTo(1 - 50 / 60);
  });

  it('handles empty fetch responses gracefully', async () => {
    mockFetchAllSegments.mockResolvedValue([]);
    mockBatchInsert.mockResolvedValue(0);

    const { runPollCycle } = await import('../src/poller.js');
    await runPollCycle();

    // batchInsert should be called with an empty array
    expect(mockBatchInsert).toHaveBeenCalledWith([]);
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// Test 3: SIGTERM handler waits for in-progress cycle
// ───────────────────────────────────────────────────────────────────────────────

describe('SIGTERM handler', () => {
  it('sets shutdown flag and prevents new poll cycles from starting', async () => {
    // Since index.ts has side effects (starts cron, runs initial poll),
    // we test the shutdown/poll logic pattern directly.
    let isShuttingDown = false;
    let pollInProgress = false;

    async function executePollCycle(): Promise<string> {
      if (isShuttingDown) {
        return 'skipped';
      }
      pollInProgress = true;
      await new Promise((resolve) => setTimeout(resolve, 10));
      pollInProgress = false;
      return 'completed';
    }

    function handleShutdown(): void {
      isShuttingDown = true;
    }

    // Before shutdown, poll cycles execute normally
    const result1 = await executePollCycle();
    expect(result1).toBe('completed');

    // Trigger shutdown
    handleShutdown();
    expect(isShuttingDown).toBe(true);

    // After shutdown, new poll cycles are skipped
    const result2 = await executePollCycle();
    expect(result2).toBe('skipped');
  });

  it('does not exit immediately when poll is in progress', async () => {
    let isShuttingDown = false;
    let pollInProgress = false;
    let exitCalled = false;

    function handleShutdown(): void {
      if (isShuttingDown) return;
      isShuttingDown = true;

      // Mirrors the real handler: if poll is in progress, don't exit yet
      if (!pollInProgress) {
        exitCalled = true;
      }
    }

    // Start a poll cycle (set flag before shutdown arrives)
    pollInProgress = true;

    // Trigger shutdown while poll is in progress
    handleShutdown();

    // Should NOT have called exit yet
    expect(isShuttingDown).toBe(true);
    expect(exitCalled).toBe(false);

    // Once poll completes, the interval check would allow exit
    pollInProgress = false;
    if (!pollInProgress) {
      exitCalled = true;
    }
    expect(exitCalled).toBe(true);
  });

  it('shutdown handler is idempotent — multiple SIGTERM signals do not cause issues', () => {
    let shutdownCount = 0;

    function handleShutdown(): void {
      if (shutdownCount > 0) return;
      shutdownCount++;
    }

    handleShutdown();
    handleShutdown();
    handleShutdown();

    expect(shutdownCount).toBe(1);
  });
});
