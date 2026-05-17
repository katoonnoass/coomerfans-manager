import { config } from 'dotenv';
import path from 'path';

// Load .env from backend directory first, then from project root
config({ path: path.resolve(__dirname, '..', '.env') });
config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { prisma } from './config/database';
import { requeuePendingDownloads } from './services/maintenance.service';

async function main() {
  try {
    await prisma.$connect();
    logger.info('Database connected');
    requeuePendingDownloads()
      .then((result) => logger.info(`Requeued pending downloads: ${result.enqueued}`))
      .catch((error) => logger.warn(`Pending download requeue skipped: ${error?.message || error}`));
  } catch (err: any) {
    logger.error('Failed to connect to database:', err.message);
    logger.error('Make sure PostgreSQL is running and DATABASE_URL is correct');
    logger.error('DATABASE_URL: ' + (process.env.DATABASE_URL || 'not set'));
    process.exit(1);
  }

  const { http } = createApp();

  http.listen(env.PORT, () => {
    logger.info(`Server running on http://localhost:${env.PORT}`);
  });
}

main();
