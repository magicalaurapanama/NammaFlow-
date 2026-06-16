import pg from 'pg';

const { Pool } = pg;

const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgres://ingestor_rw:ingestor_pass@localhost:5432/orr_pulse';

export const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 5,
});
