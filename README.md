# ORR Pulse

Real-time traffic monitoring dashboard for Bengaluru's Outer Ring Road (Silk Board → KR Puram). Polls TomTom Traffic Flow API every 15 minutes, stores time-series data in TimescaleDB, and serves analytics through a polished dark-themed Next.js dashboard.

## Architecture

```mermaid
graph LR
    subgraph External
        TomTom[TomTom Traffic Flow API v4]
    end

    subgraph Docker Compose
        subgraph apps/ingestor
            Cron[node-cron scheduler]
            Fetcher[Segment Fetcher<br/>p-limit concurrency=3]
            Validator[Zod Validator]
            Writer[Batch INSERT Writer]
        end

        subgraph Database
            PG[(PostgreSQL 16<br/>+ TimescaleDB)]
            HT[traffic_readings<br/>hypertable]
            CA[hourly_segment_stats<br/>continuous aggregate]
            Seg[segments table]
        end

        subgraph apps/web
            Routes[Next.js Route Handlers]
            Pages[App Router Pages]
            SWR[SWR Client Polling]
        end
    end

    TomTom -->|HTTP GET| Fetcher
    Cron -->|triggers| Fetcher
    Fetcher --> Validator
    Validator -->|valid readings| Writer
    Writer -->|multi-row INSERT| HT
    HT --> CA
    Seg --> Routes
    HT --> Routes
    CA --> Routes
    Routes -->|JSON| SWR
    SWR --> Pages
```

Data flows uni-directionally: TomTom API → Ingestor → PostgreSQL/TimescaleDB → API Server → Dashboard.

## Tech Stack

- **Runtime:** Node.js 20+
- **Language:** TypeScript 5
- **Frontend:** Next.js 14 (App Router), Tailwind CSS, Recharts, SWR
- **Backend:** Next.js Route Handlers, pg (PostgreSQL client)
- **Ingestor:** node-cron, p-limit, Zod, undici, pino
- **Database:** PostgreSQL 16 + TimescaleDB (hypertables, continuous aggregates)
- **Testing:** Vitest, fast-check (property-based testing)
- **Infrastructure:** Docker Compose, GitHub Actions CI
- **Monorepo:** npm workspaces

## Prerequisites

- Node.js 20+
- Docker and Docker Compose
- TomTom API key (optional — mock mode available for development)

## Quick Start

```bash
# Clone and install
git clone <repo-url> && cd orr-pulse
npm install

# Start all services (database, ingestor, web dashboard)
docker compose up -d

# Seed the database with 14 days of synthetic data
npm run seed

# Access the dashboard
open http://localhost:3000
```

The ingestor runs in mock mode by default (`TOMTOM_MOCK=true`), generating realistic synthetic traffic data without needing a real API key.

## Development Setup

```bash
# Install dependencies
npm install

# Start just the database
docker compose up db -d

# Run migrations (handled automatically by Docker entrypoint)
# Seed data
npm run seed

# Run the ingestor in dev mode
cd apps/ingestor && npm run start

# Run the web app in dev mode
cd apps/web && npm run dev
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgres://postgres:postgres@localhost:5432/orr_pulse` |
| `POSTGRES_PASSWORD` | Database password (Docker Compose) | `postgres` |
| `TOMTOM_API_KEY` | TomTom Traffic Flow API key | — |
| `TOMTOM_MOCK` | Use mock TomTom client | `true` |

## API Endpoints

### GET /api/corridor/now

Returns the latest traffic reading for each of the 10 corridor segments.

**Cache:** `s-maxage=60`

```json
{
  "segments": [
    {
      "id": "silk-board",
      "name": "Silk Board",
      "currentSpeed": 22.5,
      "freeFlowSpeed": 45.0,
      "congestionIndex": 0.5,
      "currentTravelTime": 120,
      "freeFlowTravelTime": 60,
      "confidence": 0.92,
      "roadClosure": false,
      "timestamp": "2024-01-15T08:30:00Z"
    }
  ],
  "updatedAt": "2024-01-15T08:30:00Z"
}
```

### GET /api/heatmap?days=7

Returns a corridor-average congestion matrix grouped by day-of-week and hour.

**Cache:** `s-maxage=1800`

```json
{
  "matrix": [
    { "dayOfWeek": 0, "hour": 8, "avgCongestionIndex": 0.72 },
    { "dayOfWeek": 0, "hour": 9, "avgCongestionIndex": 0.68 }
  ],
  "days": 7,
  "generatedAt": "2024-01-15T09:00:00Z"
}
```

### GET /api/segments/:id/history?hours=48

Returns raw 15-minute readings for a specific segment within the time window.

**Cache:** `s-maxage=300`

```json
{
  "segmentId": "marathahalli",
  "readings": [
    {
      "time": "2024-01-15T08:15:00Z",
      "currentSpeed": 18.3,
      "freeFlowSpeed": 42.0,
      "congestionIndex": 0.56,
      "currentTravelTime": 140,
      "freeFlowTravelTime": 62,
      "confidence": 0.88,
      "roadClosure": false
    }
  ],
  "hours": 48
}
```

### GET /api/recommendations?from=silk-board&to=kr-puram

Returns best and worst commute windows for each day of the week, computed from 4-week rolling median.

**Cache:** `s-maxage=1800`

```json
{
  "recommendations": [
    {
      "dayOfWeek": 0,
      "dayName": "Monday",
      "best": { "startHour": 11, "endHour": 12, "avgCongestionIndex": 0.18 },
      "worst": { "startHour": 9, "endHour": 10, "avgCongestionIndex": 0.78 }
    }
  ],
  "from": "silk-board",
  "to": "kr-puram"
}
```

## Testing

```bash
# Run all tests (unit + property-based)
npm run test

# Run tests in watch mode
npm run test:watch

# Run linting
npm run lint

# Run type checking
npm run typecheck
```

### Testing Strategy

- **Unit tests** verify individual module behavior (validator, writer, query builders)
- **Property-based tests** (fast-check) verify correctness properties hold across all valid inputs:
  - Concurrency limits respected during polling
  - Exponential backoff retry schedule
  - Confidence filter preserves only high-quality readings
  - Congestion index computation clamped to [0, 1]
  - Heatmap aggregation arithmetic correctness
  - Recommendation window identification
- **Integration tests** verify end-to-end flows against a Dockerized TimescaleDB instance

## Project Structure

```
orr-pulse/
├── apps/
│   ├── ingestor/          # Traffic data polling service
│   │   ├── src/
│   │   │   ├── index.ts       # Entry point, cron scheduler
│   │   │   ├── poller.ts      # Poll cycle orchestrator
│   │   │   ├── fetcher.ts     # TomTom API client (retry, concurrency)
│   │   │   ├── validator.ts   # Zod validation + confidence filter
│   │   │   ├── writer.ts      # Batch INSERT to TimescaleDB
│   │   │   ├── db.ts          # PostgreSQL pool (ingestor_rw role)
│   │   │   └── logger.ts      # pino logger
│   │   ├── __tests__/
│   │   └── Dockerfile
│   └── web/               # Next.js dashboard + API
│       ├── app/
│       │   ├── api/           # Route handlers
│       │   ├── segments/[id]/ # Segment detail page
│       │   └── page.tsx       # Main dashboard
│       ├── components/        # UI components
│       ├── lib/               # Shared utilities (db, queries, color)
│       ├── __tests__/
│       └── Dockerfile
├── packages/
│   └── shared/            # Shared types, schemas, segment config
│       ├── segments.ts
│       ├── schemas.ts
│       ├── types.ts
│       ├── congestion.ts
│       └── __tests__/
├── db/
│   ├── migrations/        # SQL migrations (auto-run by Docker)
│   └── seed.ts            # Synthetic data generator
├── docker-compose.yml
├── vitest.config.ts
└── package.json
```

## License

MIT
