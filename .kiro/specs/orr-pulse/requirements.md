# Requirements Document

## Introduction

ORR Pulse is a full-stack traffic dashboard that ingests live traffic data for Bengaluru's Outer Ring Road (ORR) IT corridor (Silk Board → KR Puram), stores it as a time series, and surfaces hourly heatmaps, trend analysis, and predicted best/worst commute windows for the week ahead. The system polls the TomTom Traffic Flow API every 15 minutes for 10 fixed road segments, persists readings in PostgreSQL with TimescaleDB, and serves analytics through a typed REST API powering a polished dark-themed dashboard.

## Glossary

- **Ingestor**: A standalone Node.js worker service responsible for polling the TomTom API on a cron schedule and persisting traffic readings to the database.
- **Dashboard**: The Next.js web application that renders traffic visualizations and analytics to the user.
- **API_Server**: The Next.js route handler layer that serves aggregated traffic data to the Dashboard frontend.
- **Segment**: A fixed geographic point on the ORR corridor representing a named road section (e.g., Silk Board, Marathahalli). The system monitors 10 predefined segments.
- **Congestion_Index (CI)**: A derived metric calculated as `1 - (currentSpeed / freeFlowSpeed)`, ranging from 0 (free flow) to 1 (standstill).
- **Traffic_Reading**: A single data point captured from the TomTom API for one segment at one point in time, including currentSpeed, freeFlowSpeed, currentTravelTime, freeFlowTravelTime, confidence, and roadClosure status.
- **Hypertable**: A TimescaleDB table optimized for time-series data with automatic partitioning by time.
- **Continuous_Aggregate**: A TimescaleDB materialized view that pre-computes hourly rollups of traffic readings for efficient querying.
- **Commute_Window**: A time range within a day recommended as optimal or worst for travel, derived from historical congestion patterns.
- **Baseline_Prediction**: A statistical forecast computed as the rolling 4-week median of CI per segment × day-of-week × hour bucket.
- **TomTom_API**: The TomTom Traffic Flow Segment Data API (v4) that returns real-time traffic metrics for a road segment nearest a given geographic coordinate.
- **Corridor**: The full ORR route from Silk Board to KR Puram, comprising all 10 monitored segments in sequence.

## Requirements

### Requirement 1: Traffic Data Ingestion

**User Story:** As a data consumer, I want the system to automatically poll traffic data for all ORR corridor segments every 15 minutes, so that the dashboard always reflects near-real-time conditions.

#### Acceptance Criteria

1. THE Ingestor SHALL poll the TomTom_API for all 10 predefined Segments every 15 minutes on a cron schedule (`*/15 * * * *`).
2. WHEN polling Segments, THE Ingestor SHALL limit concurrent API requests to a maximum of 3 simultaneous calls.
3. WHEN a TomTom_API request does not respond within 10 seconds, THE Ingestor SHALL abort that request and treat it as a failed attempt.
4. IF a TomTom_API request fails, THEN THE Ingestor SHALL retry up to 3 times with exponential backoff delays of 1 second, 4 seconds, and 16 seconds.
5. WHEN a Traffic_Reading is received with a confidence value below 0.5, THE Ingestor SHALL discard that reading without persisting it.
6. WHEN valid Traffic_Readings are collected for a polling cycle, THE Ingestor SHALL persist them using a batched multi-row INSERT statement.
7. WHEN a SIGTERM signal is received, THE Ingestor SHALL complete any in-progress polling cycle and then shut down gracefully.

### Requirement 2: Data Validation and Schema Enforcement

**User Story:** As a developer, I want all ingested data to be validated against a strict schema, so that invalid or malformed readings never corrupt the database.

#### Acceptance Criteria

1. WHEN a response is received from the TomTom_API, THE Ingestor SHALL validate the response payload against a Zod schema defining the expected structure and types.
2. IF a TomTom_API response fails Zod schema validation, THEN THE Ingestor SHALL log the validation error with the segment identifier and discard the reading.
3. THE Ingestor SHALL compute the Congestion_Index as `1 - (currentSpeed / freeFlowSpeed)` for each valid Traffic_Reading before persisting it.

### Requirement 3: Time-Series Data Storage

**User Story:** As a data engineer, I want traffic readings stored in a TimescaleDB hypertable with appropriate retention and aggregation policies, so that queries remain performant as data grows.

#### Acceptance Criteria

1. THE Database SHALL store Traffic_Readings in a TimescaleDB Hypertable partitioned by the reading timestamp.
2. THE Database SHALL maintain a Continuous_Aggregate that computes hourly average, minimum, and maximum Congestion_Index per Segment.
3. THE Database SHALL enforce a 90-day retention policy that automatically removes Traffic_Readings older than 90 days.
4. THE Database SHALL maintain a reference table of all 10 Segments with their identifiers, display names, geographic coordinates, and sequential order along the Corridor.
5. THE Database SHALL enforce two access roles: an `ingestor_rw` role with INSERT permissions and a `web_ro` role with SELECT-only permissions.

### Requirement 4: Live Corridor Status API

**User Story:** As a dashboard user, I want to see the current traffic status for every segment of the corridor, so that I can assess conditions at a glance.

#### Acceptance Criteria

1. WHEN a GET request is made to `/api/corridor/now`, THE API_Server SHALL return the most recent Traffic_Reading for each of the 10 Segments.
2. WHEN responding to `/api/corridor/now`, THE API_Server SHALL include for each Segment: the segment identifier, display name, currentSpeed, freeFlowSpeed, Congestion_Index, currentTravelTime, freeFlowTravelTime, confidence, roadClosure status, and the reading timestamp.
3. THE API_Server SHALL return all responses with TypeScript-compatible JSON structures matching defined response schemas.

### Requirement 5: Heatmap Data API

**User Story:** As a commuter, I want to view a 7-day hourly heatmap of corridor congestion, so that I can identify recurring congestion patterns across the week.

#### Acceptance Criteria

1. WHEN a GET request is made to `/api/heatmap` with a `days` query parameter, THE API_Server SHALL return a matrix of corridor-average Congestion_Index values grouped by hour-of-day (0–23) and day-of-week (Monday–Sunday).
2. WHEN the `days` parameter is not provided, THE API_Server SHALL default to 7 days of historical data.
3. WHEN computing heatmap values, THE API_Server SHALL use the Continuous_Aggregate hourly rollup data for query efficiency.

### Requirement 6: Segment History API

**User Story:** As a commuter, I want to view the detailed traffic history for a specific segment, so that I can understand how conditions change over time at that location.

#### Acceptance Criteria

1. WHEN a GET request is made to `/api/segments/:id/history` with an `hours` query parameter, THE API_Server SHALL return the raw 15-minute Traffic_Readings for the specified Segment within the requested time window.
2. WHEN the `hours` parameter is not provided, THE API_Server SHALL default to 48 hours of history.
3. IF the segment identifier in the request does not match any predefined Segment, THEN THE API_Server SHALL return a 404 status with a descriptive error message.

### Requirement 7: Commute Recommendations API

**User Story:** As a commuter, I want to know the best and worst times to travel the corridor each day of the week, so that I can plan my commute to avoid peak congestion.

#### Acceptance Criteria

1. WHEN a GET request is made to `/api/recommendations`, THE API_Server SHALL return the best and worst Commute_Windows for each day of the week (Monday–Sunday).
2. WHEN computing recommendations, THE API_Server SHALL use the Baseline_Prediction method: rolling 4-week median of Congestion_Index per Segment, day-of-week, and hour bucket.
3. WHEN a `from` and `to` query parameter are provided with valid Segment identifiers, THE API_Server SHALL compute recommendations only for the sub-corridor between those two Segments (inclusive).
4. IF the `from` or `to` query parameter does not match a valid Segment identifier, THEN THE API_Server SHALL return a 400 status with a descriptive error message.

### Requirement 8: Dashboard Corridor Visualization

**User Story:** As a dashboard user, I want to see a visual representation of the entire corridor with color-coded congestion status, so that I can immediately identify problem areas.

#### Acceptance Criteria

1. THE Dashboard SHALL display a corridor strip visualization showing all 10 Segments in sequential geographic order from Silk Board to KR Puram.
2. THE Dashboard SHALL color-code each Segment in the corridor strip using a CI color ramp: green (CI 0–0.3) → amber (CI 0.3–0.6) → red (CI 0.6–1.0).
3. WHEN the corridor strip is displayed, THE Dashboard SHALL show the segment name and current Congestion_Index value for each Segment.
4. THE Dashboard SHALL refresh corridor data automatically every 60 seconds using SWR client-side polling.

### Requirement 9: Weekly Heatmap Visualization

**User Story:** As a commuter, I want to view a weekly heatmap of congestion by hour, so that I can visually identify the best and worst travel times across the week.

#### Acceptance Criteria

1. THE Dashboard SHALL render a heatmap grid with hours of the day (0–23) on one axis and days of the week (Monday–Sunday) on the other axis.
2. THE Dashboard SHALL color each heatmap cell using the same CI color ramp (green → amber → red) based on the corridor-average Congestion_Index for that hour and day combination.
3. WHEN a user hovers over a heatmap cell, THE Dashboard SHALL display a tooltip showing the exact average Congestion_Index value, the day, and the hour.

### Requirement 10: Segment Comparison and Detail View

**User Story:** As a commuter, I want to compare congestion trends across segments and drill into a specific segment's history, so that I can understand which parts of the corridor are most problematic.

#### Acceptance Criteria

1. THE Dashboard SHALL display a segment comparison chart showing Congestion_Index trends over time for multiple Segments on a single Recharts line chart.
2. WHEN a user navigates to `/segments/[id]`, THE Dashboard SHALL display a detail page for that Segment showing its 48-hour history as a time-series chart.
3. WHEN displaying the segment detail page, THE Dashboard SHALL show the segment name, current status, geographic coordinates, and a Congestion_Index trend line.

### Requirement 11: Best Time to Travel Card

**User Story:** As a commuter, I want a clear recommendation card showing the best time to travel today, so that I can quickly decide when to leave.

#### Acceptance Criteria

1. THE Dashboard SHALL display a "Best Time to Travel" card prominently on the main dashboard page.
2. THE Dashboard SHALL show the recommended best Commute_Window for the current day-of-week, including the start hour, end hour, and expected average Congestion_Index.
3. THE Dashboard SHALL also display the worst Commute_Window for the current day-of-week as a time to avoid.

### Requirement 12: Dashboard Theming and Responsiveness

**User Story:** As a portfolio reviewer, I want the dashboard to have a polished, professional dark theme, so that the project demonstrates strong frontend skills.

#### Acceptance Criteria

1. THE Dashboard SHALL use a dark background theme described as "control room at dusk" with high-contrast text and UI elements.
2. THE Dashboard SHALL be built with Tailwind CSS for styling and maintain a consistent design system throughout all pages.
3. THE Dashboard SHALL be responsive and render usably on viewport widths from 768px (tablet) to 1920px (desktop).

### Requirement 13: Development and Deployment Infrastructure

**User Story:** As a developer, I want a fully containerized local development environment and CI pipeline, so that the project is easy to run, test, and deploy.

#### Acceptance Criteria

1. THE Project SHALL provide a `docker-compose.yml` that starts the database (PostgreSQL + TimescaleDB), Ingestor, and Dashboard services with a single command.
2. THE Project SHALL use multi-stage Dockerfiles to produce optimized production images for both the Ingestor and Dashboard.
3. THE Project SHALL include a GitHub Actions CI workflow that runs linting, tests, and Docker image builds on every push.
4. THE Project SHALL be structured as a monorepo with npm workspaces: `apps/web`, `apps/ingestor`, and `packages/shared`.
5. THE Project SHALL include a comprehensive README documenting setup, architecture, configuration, and deployment instructions.

### Requirement 14: Testing and Data Seeding

**User Story:** As a developer, I want thorough unit and integration tests with realistic seed data, so that the project demonstrates quality engineering practices.

#### Acceptance Criteria

1. THE Project SHALL include unit tests (using Vitest) for: Congestion_Index computation, Commute_Window calculation logic, Zod validation schemas, and retry logic.
2. THE Project SHALL include integration tests that verify the Ingestor writes correctly to a Dockerized test database.
3. THE Project SHALL include integration tests that verify API route handlers return correct responses against seeded data.
4. THE Project SHALL include a seed script that generates 14 days of synthetic Traffic_Readings with realistic congestion patterns (morning/evening peaks, weekend differences).

### Requirement 15: Segment Configuration Management

**User Story:** As a developer, I want segment definitions centralized in a shared configuration, so that adding or modifying segments requires changes in only one place.

#### Acceptance Criteria

1. THE Project SHALL define all 10 Segment configurations (identifier, display name, latitude, longitude, order) in a single shared configuration file within the `packages/shared` workspace.
2. WHEN the Ingestor or API_Server needs Segment metadata, THE respective service SHALL import it from the shared configuration rather than maintaining a local copy.
3. THE shared configuration SHALL export TypeScript types for Segment identifiers that enable compile-time validation of segment references.
