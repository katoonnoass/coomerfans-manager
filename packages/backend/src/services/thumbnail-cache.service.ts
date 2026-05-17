import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { cleanupThumbCacheIfNeeded } from './media-thumbnail-cache.service';

const pending = new Map<string, Promise<string | null>>();

function cacheDir() {
  const dir = path.resolve(process.env.STORAGE_PATH || './storage', 'thumb-cache');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cachePath(slug: string, url: string) {
  const hash = crypto.createHash('sha1').update(url).digest('hex');
  return path.join(cacheDir(), `${slug}-${hash}.webp`);
}

export async function getCachedThumbnailPath(slug: string, url: string | null) {
  if (!url) return null;

  const target = cachePath(slug, url);
  if (fs.existsSync(target)) return target;

  const key = `${slug}:${url}`;
  const existing = pending.get(key);
  if (existing) return existing;

  const work = downloadAndOptimize(url, target)
    .catch(() => null)
    .finally(() => pending.delete(key));
  pending.set(key, work);
  return work;
}

export function warmThumbnailCache(models: Array<{ slug: string; thumbnailUrl: string | null }>) {
  const queue = models.filter((model) => model.thumbnailUrl);
  const concurrency = 4;

  for (let index = 0; index < Math.min(concurrency, queue.length); index += 1) {
    void runWarmWorker(queue, index, concurrency);
  }
}

async function runWarmWorker(
  queue: Array<{ slug: string; thumbnailUrl: string | null }>,
  start: number,
  step: number
) {
  for (let index = start; index < queue.length; index += step) {
    const item = queue[index];
    await getCachedThumbnailPath(item.slug, item.thumbnailUrl);
  }
}

async function downloadAndOptimize(url: string, target: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': process.env.SCRAPER_USER_AGENT || 'Mozilla/5.0',
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        Referer: 'https://coomerfans.com/',
      },
    });

    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0) return null;

    const optimized = await sharp(buffer, { failOn: 'none' })
      .rotate()
      .resize(240, 240, { fit: 'cover', withoutEnlargement: false })
      .webp({ quality: 72, effort: 3 })
      .toBuffer();

    fs.writeFileSync(target, optimized);
    await cleanupThumbCacheIfNeeded();
    return target;
  } finally {
    clearTimeout(timeout);
  }
}
