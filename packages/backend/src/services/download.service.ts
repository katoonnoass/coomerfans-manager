import { Queue, QueueEvents } from 'bullmq';
import { redis } from '../config/redis';
import path from 'path';
import fs from 'fs';

export const downloadQueue = new Queue('downloads', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
});

export const scrapeQueue = new Queue('scrapes', {
  connection: redis,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 10000 },
    removeOnComplete: { count: 20 },
  },
});

const downloadEvents = new QueueEvents('downloads', { connection: redis });
const scrapeEvents = new QueueEvents('scrapes', { connection: redis });

export async function enqueueDownload(
  downloadMediaId: string,
  type: 'IMAGE' | 'VIDEO',
  url: string,
  jobId: string,
  modelName: string,
  downloadRoot?: string | null,
  downloadSegments = 16,
  downloadEngine = 'NATIVE',
  idmMonitorMode = 'MONITOR',
  downloadMode = 'AUTO',
  priority = 'NORMAL'
) {
  const root = downloadRoot?.trim() || process.env.MEDIA_PATH || './media';
  const storageDir = path.join(
    path.resolve(root),
    modelName.replace(/[^a-zA-Z0-9_-]/g, '_')
  );

  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
  }

  const ext = resolveExtension(url, type);
  const filename = `${downloadMediaId}${ext}`;
  const storagePath = path.join(storageDir, filename);

  await downloadQueue.add(
    `download:${downloadMediaId}`,
    {
      type,
      downloadMediaId,
      url,
      storagePath,
      jobId,
      downloadSegments,
      downloadEngine,
      idmMonitorMode,
      downloadMode,
    },
    {
      jobId: downloadMediaId,
      priority: priority === 'HIGH' ? 1 : priority === 'LOW' ? 10 : 5,
    }
  );

  return { storagePath };
}

function resolveExtension(url: string, type: 'IMAGE' | 'VIDEO') {
  try {
    const parsed = new URL(url);
    const ext = path.extname(parsed.pathname).toLowerCase();
    if (/^\.[a-z0-9]{2,6}$/.test(ext)) return ext;
  } catch {
    const ext = path.extname(url.split('?')[0]).toLowerCase();
    if (/^\.[a-z0-9]{2,6}$/.test(ext)) return ext;
  }

  return type === 'VIDEO' ? '.mp4' : '.jpg';
}

export async function enqueueScrape(slug: string) {
  const job = await scrapeQueue.add(
    `scrape:${slug}`,
    { slug },
    { jobId: `scrape:${slug}` }
  );
  return job.id;
}

export { downloadEvents, scrapeEvents };
