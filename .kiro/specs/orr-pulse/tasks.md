# Implementation Plan: ORR Pulse

## Overview

A full-stack traffic monitoring dashboard for Bengaluru's Outer Ring Road. Implementation follows a bottom-up approach: monorepo scaffolding → database → ingestor → API → UI → CI. Each phase builds on the previous, ensuring no orphaned code. Property-based tests (fast-check) validate correctness properties from the design document.

## Tasks

- [ ] 1. Scaffold monorepo, Docker Compose, DB migrations, and seed script
  - [x] 1.1 Initialize monorepo with npm workspaces
    - Create root `package.json` with workspaces: `apps/web`, `apps/ingestor`, `packages/shared`
    - Configure root `tsconfig.json` with path aliases
    - Add shared dev dependencies: `vitest`, `fast-check`, `typescript`, `eslint`, `prettier`
    - _Requirements: 13.4, 15.1_

  - [x] 1.2 Create `packages/shared` with segment config, schemas, and types
    - Implement `segments.ts` with all 10 `SegmentConfig` objects, `SEGMENT_IDS` const array, and `SegmentId` type
    - Implement `schemas.ts` with `tomtomFlowSegmentSchema` Zod schema and `trafficReadingSchema`
    - Implement `types.ts` with shared interfaces: `TrafficReading`, `HeatmapCell`, `CommuteWindow`, `CorridorStatus`
    - Implement `congestion.ts` with `computeCongestionIndex` function (clamped to [0, 1])
    - Export all from `packages/shared/index.ts`
    - _Requirements: 15.1, 15.2, 15.3, 2.1, 2.3_

  - [x] 1.3 Write property test for congestion index computation
    - **Property 5: Congestion Index computation correctness**
    - Test that for any positive (currentSpeed, freeFlowSpeed), result equals `1 - (currentSpeed / freeFlowSpeed)` clamped to [0, 1]
    - Use fast-check `fc.double` arbitraries for positive numbers
    - **Validates: Requirements 2.3**

  - [x] 1.4 Write property test for Zod schema validation
    - **Property 4: Zod schema validation accepts valid and rejects invalid payloads**
    - Generate valid TomTom response objects using fast-check and verify parse succeeds
    - Generate objects with missing/invalid fields and verify parse fails
    - **Validates: Requirements 2.1, 2.2**

  - [x] 1.5 Create Docker Compose file and database migrations
    - Create `docker-compose.yml` with services: `db` (TimescaleDB), `ingestor`, `web`
    - Create `db/migrations/001_init.sql` with segments table, traffic_readings hypertable, hourly_segment_stats continuous aggregate, retention policy, and roles (`ingestor_rw`, `web_ro`)
    - Create multi-stage `Dockerfile` for `apps/ingestor` and `apps/web`
    - _Requirements: 13.1, 13.2, 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 1.6 Create seed script for synthetic traffic data
    - Implement `db/seed.ts` generating 14 days of readings for all 10 segments
    - Morning peak (8–10 AM): CI 0.6–0.9; Evening peak (5–7 PM): CI 0.5–0.8; Off-peak: CI 0.1–0.3
    - Weekends 30% lower CI; random noise ±0.05; downstream segments more congested during peaks
    - Script inserts into `traffic_readings` and refreshes the continuous aggregate
    - _Requirements: 14.4_

- [ ] 2. Checkpoint - Validate monorepo structure
  - Ensure shared package builds and exports types correctly, Docker Compose starts DB, migrations run, seed completes. Ask the user if questions arise.

- [ ] 3. Implement Ingestor service
  - [x] 3.1 Set up ingestor project structure
    - Create `apps/ingestor/package.json` with dependencies: `pg`, `pino`, `node-cron`, `p-limit`, `zod`, `undici`
    - Create `apps/ingestor/tsconfig.json` extending root config
    - Implement `src/db.ts` with pg Pool configured for `ingestor_rw` role
    - Implement `src/logger.ts` with pino logger instance
    - _Requirements: 1.1, 3.5_

  - [x] 3.2 Implement TomTom API fetcher with retry and concurrency
    - Implement `src/fetcher.ts` with p-limit concurrency of 3
    - Add AbortController with 10-second timeout per request
    - Implement exponential backoff retry (3 attempts: 1s, 4s, 16s delays)
    - Support env flag (`TOMTOM_MOCK=true`) to use mocked client for development
    - Create `src/mock-client.ts` returning randomized but valid TomTom responses
    - _Requirements: 1.2, 1.3, 1.4_

  - [x] 3.3 Write property test for concurrency limit
    - **Property 1: Concurrency never exceeds limit**
    - Simulate poll cycles with varying segment counts and response timings
    - Assert in-flight count never exceeds 3 at any moment
    - **Validates: Requirements 1.2**

  - [x] 3.4 Write property test for retry backoff
    - **Property 2: Retry respects exponential backoff**
    - Generate sequences of failures, verify retry count ≤ 3 and delays match [1s, 4s, 16s]
    - Verify poll cycle doesn't crash when all retries fail
    - **Validates: Requirements 1.4**

  - [x] 3.5 Implement validator with confidence filter
    - Implement `src/validator.ts` that applies Zod parse, computes CI, and filters confidence < 0.5
    - Log discarded readings with segment ID and reason
    - _Requirements: 1.5, 2.1, 2.2, 2.3_

  - [x] 3.6 Write property test for confidence filter
    - **Property 3: Confidence filter preserves only high-confidence readings**
    - Generate readings with arbitrary confidence values [0, 1]
    - Assert readings with confidence < 0.5 are discarded, ≥ 0.5 are preserved unchanged
    - **Validates: Requirements 1.5**

  - [x] 3.7 Implement batch writer and poll orchestrator
    - Implement `src/writer.ts` with multi-row INSERT using parameterized queries
    - Implement `src/poller.ts` orchestrating: fetch all segments → validate → filter → batch write
    - Implement `src/index.ts` with node-cron schedule (`*/15 * * * *`) and SIGTERM graceful shutdown
    - _Requirements: 1.6, 1.7, 1.1_

  - [x] 3.8 Write unit tests for ingestor modules
    - Test poller orchestration with mocked fetcher/writer
    - Test writer builds correct multi-row INSERT SQL
    - Test SIGTERM handler waits for in-progress cycle
    - _Requirements: 14.1_

- [ ] 4. Checkpoint - Validate ingestor
  - Ensure ingestor starts with `TOMTOM_MOCK=true`, completes a poll cycle, and writes to the database. Run all property tests and unit tests. Ask the user if questions arise.

- [ ] 5. Implement API route handlers
  - [x] 5.1 Set up Next.js web app structure
    - Initialize `apps/web` with Next.js 14 App Router, TypeScript, Tailwind CSS
    - Configure `apps/web/package.json` with dependencies: `swr`, `recharts`, `tailwindcss`
    - Create `apps/web/lib/db.ts` with pg Pool configured for `web_ro` role
    - Create `apps/web/lib/color.ts` with CI-to-color ramp function (green/amber/red)
    - _Requirements: 13.4, 12.2, 3.5_

  - [x] 5.2 Write property test for CI color ramp mapping
    - **Property 12: CI color ramp mapping correctness**
    - Generate CI values in [0, 1], verify green for [0, 0.3), amber for [0.3, 0.6), red for [0.6, 1.0]
    - **Validates: Requirements 8.2, 9.2**

  - [x] 5.3 Implement `/api/corridor/now` route handler
    - Query `DISTINCT ON (segment_id) ... ORDER BY time DESC` on traffic_readings
    - Return typed `CorridorNowResponse` matching interface contract
    - Set `Cache-Control: s-maxage=60`
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 5.4 Write property test for corridor now query logic
    - **Property 6: Corridor now returns only the latest reading per segment**
    - Generate sets of readings with varying timestamps per segment
    - Assert exactly one reading returned per segment with maximum timestamp
    - **Validates: Requirements 4.1, 4.2**

  - [x] 5.5 Implement `/api/heatmap` route handler
    - Query `hourly_segment_stats` grouped by `EXTRACT(dow)` and `EXTRACT(hour)`
    - Default `days` param to 7; compute corridor-average CI per (day, hour) cell
    - Set `Cache-Control: s-maxage=1800`
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 5.6 Write property test for heatmap aggregation
    - **Property 7: Heatmap aggregation correctness**
    - Generate hourly stats rows, verify correct arithmetic mean per (hour, day-of-week)
    - **Validates: Requirements 5.1**

  - [x] 5.7 Implement `/api/segments/:id/history` route handler
    - Query raw traffic_readings for segment within requested hour window (default 48h)
    - Validate segment ID against `SEGMENT_IDS`; return 404 for invalid IDs
    - Set `Cache-Control: s-maxage=300`
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 5.8 Write property test for segment history time-window filtering
    - **Property 8: Segment history returns only readings within the time window**
    - Generate readings with various timestamps, verify all returned readings within window and none omitted
    - **Validates: Requirements 6.1**

  - [x] 5.9 Write property test for invalid segment error responses
    - **Property 9: Invalid segment identifiers produce error responses**
    - Generate strings not in SEGMENT_IDS, verify 404 for history and 400 for recommendations
    - **Validates: Requirements 6.3, 7.4**

  - [x] 5.10 Implement `/api/recommendations` route handler
    - Implement `apps/web/lib/recommendations.ts` with rolling 4-week median computation
    - Query `hourly_segment_stats` for last 4 weeks; compute `percentile_cont(0.5)` per (segment, dow, hour)
    - Identify best (min median CI) and worst (max median CI) hour windows per day
    - Support `from` and `to` query params for sub-corridor filtering; validate segment IDs
    - Set `Cache-Control: s-maxage=1800`
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x] 5.11 Write property test for recommendation windows
    - **Property 10: Recommendation windows identify correct best and worst periods**
    - Generate 4 weeks of hourly CI data, verify median computation and correct identification of best/worst windows
    - **Validates: Requirements 7.1, 7.2**

  - [x] 5.12 Write property test for sub-corridor filtering
    - **Property 11: Sub-corridor filtering includes only segments in range**
    - Generate from/to segment pairs, verify only segments with position in [from.position, to.position] are included
    - **Validates: Requirements 7.3**

- [ ] 6. Checkpoint - Validate API layer
  - Ensure all API routes return correct responses against seeded data. Run all property tests and unit tests. Ask the user if questions arise.

- [ ] 7. Implement Dashboard UI
  - [x] 7.1 Create app layout and theme
    - Implement root layout with dark theme ("control room at dusk") using Tailwind CSS
    - Configure Tailwind with custom color palette for the dark theme
    - Add responsive breakpoints (768px–1920px)
    - Create `LiveBadge` component showing last update timestamp with pulsing indicator
    - _Requirements: 12.1, 12.2, 12.3_

  - [x] 7.2 Implement CorridorStrip component
    - Create custom SVG component showing 10 segments as color-coded blocks
    - Apply CI color ramp (green → amber → red) to each block
    - Display segment name and current CI value on each block
    - Wire to `/api/corridor/now` using SWR with 60-second refresh interval
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x] 7.3 Implement Heatmap component
    - Create 24×7 grid (hours × days) with color-coded cells
    - Apply CI color ramp to each cell based on corridor-average CI
    - Add hover tooltip showing exact CI value, day name, and hour
    - Wire to `/api/heatmap` using SWR
    - _Requirements: 9.1, 9.2, 9.3_

  - [x] 7.4 Implement BestWindowCard component
    - Create card showing best commute window for current day-of-week (start hour, end hour, avg CI)
    - Show worst window as "time to avoid"
    - Wire to `/api/recommendations` using SWR
    - _Requirements: 11.1, 11.2, 11.3_

  - [x] 7.5 Implement SegmentTrend chart component
    - Create Recharts `LineChart` showing CI trends for multiple segments over time
    - Allow toggling segments on/off
    - Wire to `/api/segments/:id/history` using SWR
    - _Requirements: 10.1_

  - [x] 7.6 Compose main dashboard page
    - Assemble CorridorStrip, Heatmap, BestWindowCard, and SegmentTrend on main page
    - Add React Error Boundaries per section
    - Add loading skeletons and "Waiting for data" placeholders
    - _Requirements: 8.1, 9.1, 11.1, 10.1_

- [ ] 8. Implement Segment Detail Page
  - [x] 8.1 Create `/segments/[id]` page with dynamic routing
    - Validate segment ID from URL params against `SEGMENT_IDS`
    - Use Next.js `notFound()` for invalid segment IDs
    - Display segment name, current status, geographic coordinates
    - _Requirements: 10.2, 10.3_

  - [x] 8.2 Add 48-hour history chart to segment detail page
    - Create Recharts time-series `LineChart` showing CI over 48 hours
    - Wire to `/api/segments/:id/history` using SWR
    - Show metadata: segment name, position, coordinates
    - _Requirements: 10.2, 10.3_

- [ ] 9. Checkpoint - Validate UI
  - Ensure dashboard renders with seeded data: corridor strip shows colored segments, heatmap displays 7×24 grid, best-window card shows recommendation, segment detail page renders chart. Ask the user if questions arise.

- [ ] 10. Integration tests
  - [x] 10.1 Write integration tests for ingestor → database
    - Test that a poll cycle with mocked TomTom responses writes correct rows to traffic_readings
    - Test that confidence filter discards low-confidence readings at DB level
    - Use Dockerized TimescaleDB for test database
    - _Requirements: 14.2_

  - [x] 10.2 Write integration tests for API routes
    - Seed test database with known data
    - Test `/api/corridor/now` returns latest reading per segment
    - Test `/api/heatmap` returns correct matrix dimensions (7 days × 24 hours)
    - Test `/api/segments/:id/history` returns readings within requested window
    - Test `/api/recommendations` returns best/worst windows matching manual calculation
    - _Requirements: 14.3_

- [ ] 11. CI pipeline and README
  - [x] 11.1 Create GitHub Actions CI workflow
    - Add `.github/workflows/ci.yml` with jobs: lint, type-check, unit tests, property tests, Docker build
    - Run on push to main and pull requests
    - Use Docker Compose to start TimescaleDB for integration tests
    - _Requirements: 13.3_

  - [x] 11.2 Write comprehensive README
    - Document project architecture with Mermaid diagram
    - Include setup instructions (Docker Compose, env vars, TomTom API key)
    - Document development workflow, testing strategy, and deployment
    - List all API endpoints with example responses
    - _Requirements: 13.5_

- [ ] 12. Final checkpoint - Ensure all tests pass
  - Run full test suite (unit tests, property tests, integration tests). Verify Docker Compose brings up all services. Ensure linting passes. Ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Property-based tests use fast-check within Vitest (`numRuns: 100`)
- Each property test tagged with `// Feature: orr-pulse, Property {N}: {title}`
- Checkpoints ensure incremental validation at each phase boundary
- The ingestor supports `TOMTOM_MOCK=true` env flag for development without a real API key
