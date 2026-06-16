-- ORR Pulse: Initial database schema
-- Requirements: 3.1, 3.2, 3.3, 3.4, 3.5

-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Segments reference table (Requirement 3.4)
CREATE TABLE segments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  position INTEGER NOT NULL UNIQUE
);

-- Insert all 10 ORR corridor segments
INSERT INTO segments (id, name, lat, lon, position) VALUES
  ('silk-board', 'Silk Board', 12.9172, 77.6227, 0),
  ('hsr', 'HSR Layout', 12.9116, 77.6389, 1),
  ('ibblur', 'Ibbalur', 12.9260, 77.6780, 2),
  ('bellandur', 'Bellandur', 12.9307, 77.6785, 3),
  ('ecospace', 'Ecospace', 12.9352, 77.6902, 4),
  ('kadubeesanahalli', 'Kadubeesanahalli', 12.9380, 77.6975, 5),
  ('marathahalli', 'Marathahalli', 12.9562, 77.7010, 6),
  ('doddanekundi', 'Doddanekundi', 12.9630, 77.7098, 7),
  ('mahadevapura', 'Mahadevapura', 12.9890, 77.7010, 8),
  ('kr-puram', 'KR Puram', 13.0070, 77.6960, 9);

-- Traffic readings table (Requirement 3.1)
CREATE TABLE traffic_readings (
  time TIMESTAMPTZ NOT NULL,
  segment_id TEXT NOT NULL REFERENCES segments(id),
  current_speed DOUBLE PRECISION NOT NULL,
  free_flow_speed DOUBLE PRECISION NOT NULL,
  current_travel_time DOUBLE PRECISION NOT NULL,
  free_flow_travel_time DOUBLE PRECISION NOT NULL,
  confidence DOUBLE PRECISION NOT NULL,
  congestion_index DOUBLE PRECISION NOT NULL,
  road_closure BOOLEAN NOT NULL DEFAULT FALSE
);

-- Convert to hypertable (Requirement 3.1)
SELECT create_hypertable('traffic_readings', 'time');

-- Continuous aggregate for hourly rollups (Requirement 3.2)
CREATE MATERIALIZED VIEW hourly_segment_stats
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', time) AS bucket,
  segment_id,
  AVG(congestion_index) AS avg_ci,
  MAX(congestion_index) AS max_ci,
  AVG(current_speed) AS avg_speed,
  COUNT(*) AS sample_count
FROM traffic_readings
GROUP BY bucket, segment_id;

-- 90-day retention policy (Requirement 3.3)
SELECT add_retention_policy('traffic_readings', INTERVAL '90 days');

-- Access roles (Requirement 3.5)
CREATE ROLE ingestor_rw WITH LOGIN PASSWORD 'ingestor_pass';
GRANT INSERT ON traffic_readings TO ingestor_rw;
GRANT SELECT ON segments TO ingestor_rw;

CREATE ROLE web_ro WITH LOGIN PASSWORD 'web_pass';
GRANT SELECT ON traffic_readings, segments, hourly_segment_stats TO web_ro;
