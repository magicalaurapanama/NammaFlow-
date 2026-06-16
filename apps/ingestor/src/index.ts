import cron from 'node-cron';
import { runPollCycle } from './poller.js';
import { logger } from './logger.js';

let isShuttingDown = false;
let pollInProgress = false;

/**
 * Wraps the poll cycle to track in-progress state.
 */
async function executePollCycle(): Promise<void> {
  if (isShuttingDown) {
    logger.info('Shutdown in progress, skipping poll cycle');
    return;
  }

  pollInProgress = true;
  try {
    await runPollCycle();
  } catch (error) {
    logger.error({ error }, 'Poll cycle failed with unexpected error');
  } finally {
    pollInProgress = false;
  }
}

/**
 * Graceful shutdown handler.
 * Waits for any in-progress poll cycle to complete (up to 30s timeout), then exits.
 */
function handleShutdown(): void {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info('SIGTERM received, initiating graceful shutdown');

  const SHUTDOWN_TIMEOUT_MS = 30_000;
  const CHECK_INTERVAL_MS = 500;
  let elapsed = 0;

  const interval = setInterval(() => {
    elapsed += CHECK_INTERVAL_MS;

    if (!pollInProgress) {
      clearInterval(interval);
      logger.info('No poll cycle in progress, shutting down');
      process.exit(0);
    }

    if (elapsed >= SHUTDOWN_TIMEOUT_MS) {
      clearInterval(interval);
      logger.warn('Shutdown timeout reached, forcing exit');
      process.exit(0);
    }
  }, CHECK_INTERVAL_MS);
}

// Register SIGTERM handler
process.on('SIGTERM', handleShutdown);

// Schedule poll cycle every 15 minutes
cron.schedule('*/15 * * * *', () => {
  executePollCycle();
});

logger.info('ORR Pulse Ingestor started, polling every 15 minutes');

// Run initial poll cycle on startup
executePollCycle();
