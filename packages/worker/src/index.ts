import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(__dirname, '..', '.env') });
config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

import { Worker, Job } from 'bullmq';
import Redis, { RedisOptions } from 'ioredis';
import { downloadImageProcessor } from './processors/download-image';
import { downloadVideoProcessor } from './processors/download-video';
import { scrapeProcessor } from './processors/scrape';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/coomerfans?schema=public';
const DEFAULT_DOWNLOAD_CONCURRENCY = Math.max(1, Math.min(8, Number(process.env.DOWNLOAD_CONCURRENCY || 3)));

process.env.DATABASE_URL = DATABASE_URL;

const redisOptions: RedisOptions = {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  connectTimeout: 5000,
  commandTimeout: 60000,
  retryStrategy(times) {
    return Math.min(times * 500, 10000);
  },
};

function createConnection() {
  return new Redis(REDIS_URL, redisOptions);
}

async function resetInterruptedDownloads() {
  const { getPrisma } = await import('./db');
  const prisma = getPrisma();

  await prisma.downloadMedia.updateMany({
    where: { status: 'DOWNLOADING' },
    data: { status: 'PENDING' },
  });

  await prisma.downloadJob.updateMany({
    where: { status: 'DOWNLOADING' },
    data: { status: 'PENDING', speed: 0 },
  });
}

async function resolveDownloadConcurrency() {
  try {
    const { getPrisma } = await import('./db');
    const prisma = getPrisma();
    const settings = await prisma.userSetting.findMany({
      select: { maxConcurrentDownloads: true },
      take: 20,
    });
    const configured = settings.reduce(
      (max, setting) => Math.max(max, setting.maxConcurrentDownloads || 0),
      DEFAULT_DOWNLOAD_CONCURRENCY
    );
    return Math.max(1, Math.min(8, configured));
  } catch {
    return DEFAULT_DOWNLOAD_CONCURRENCY;
  }
}

async function waitForRedis() {
  const probe = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    connectTimeout: 5000,
    commandTimeout: 10000,
    retryStrategy: () => null,
  });
  try {
    await probe.ping();
  } finally {
    probe.disconnect();
  }
}

async function startWorkers() {
  try {
    await waitForRedis();
    console.log('Redis connected');
    await resetInterruptedDownloads();
  } catch (err) {
    console.error('Redis connection failed:', err);
    console.log('Worker will retry in 5 seconds...');
    setTimeout(startWorkers, 5000);
    return;
  }

  const downloadConcurrency = await resolveDownloadConcurrency();
  const downloadWorker = new Worker(
    'downloads',
    async (job: Job) => {
      const { type } = job.data;
      if (type === 'IMAGE') return downloadImageProcessor(job);
      if (type === 'VIDEO') return downloadVideoProcessor(job);
      throw new Error(`Unknown download type: ${type}`);
    },
    {
      connection: createConnection(),
      concurrency: downloadConcurrency,
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 20 },
    }
  );

  const scrapeWorker = new Worker(
    'scrapes',
    async (job: Job) => scrapeProcessor(job),
    {
      connection: createConnection(),
      concurrency: 1,
      removeOnComplete: { count: 20 },
      removeOnFail: { count: 10 },
    }
  );

  downloadWorker.on('completed', (job) => console.log(`Download job ${job.id} completed`));
  downloadWorker.on('failed', (job, err) => console.error(`Download job ${job?.id} failed:`, err.message));
  scrapeWorker.on('completed', (job) => console.log(`Scrape job ${job.id} completed`));
  scrapeWorker.on('failed', (job, err) => console.error(`Scrape job ${job?.id} failed:`, err.message));

  const concurrencyTimer = setInterval(async () => {
    const nextConcurrency = await resolveDownloadConcurrency();
    if (downloadWorker.concurrency !== nextConcurrency) {
      downloadWorker.concurrency = nextConcurrency;
      console.log(`Download concurrency updated: ${nextConcurrency}`);
    }
  }, 30000);

  console.log(`Workers started — download concurrency: ${downloadConcurrency}, scrape concurrency: 1`);

  process.on('SIGTERM', async () => {
    clearInterval(concurrencyTimer);
    await downloadWorker.close();
    await scrapeWorker.close();
    process.exit(0);
  });
}

startWorkers();
