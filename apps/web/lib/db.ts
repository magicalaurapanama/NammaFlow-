import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    'postgres://web_ro:web_pass@localhost:5432/orr_pulse',
});
