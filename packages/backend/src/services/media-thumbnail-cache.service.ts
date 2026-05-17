import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import sharp from 'sharp';

type MediaThumbInput = {
  id: string;
  type: string;
  url: string;
};

const pending = new Map<string, Promise<string | null>>();
const CACHE_LIMIT_BYTES = 10 * 1024 * 1024 * 1024;

function cacheRoot() {
  const root = path.resolve(process.env.STORAGE_PATH || './storage', 'thumb-cache');
  fs.mkdirSync(root, { recursive: true });
  return root;
}

function mediaCacheDir() {
  const dir = path.join(cacheRoot(), 'media');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function mediaCachePath(media: MediaThumbInput) {
  const hash = crypto.createHash('sha1').update(media.url).digest('hex');
  return path.join(mediaCacheDir(), `${media.id}-${hash}.webp`);
}

export async function getCachedMediaThumbnailPath(media: MediaThumbInput) {
  const target = mediaCachePath(media);
  if (fs.existsSync(target)) {
    touch(target);
    return target;
  }

  const existing = pending.get(target);
  if (existing) return existing;

  const work = createMediaThumbnail(media, target)
    .catch(() => null)
    .finally(() => pending.delete(target));
  pending.set(target, work);
  return work;
}

export function warmMediaThumbnailCache(mediaItems: MediaThumbInput[]) {
  const queue = mediaItems.filter((item) => item.url);
  const concurrency = Math.max(1, Math.min(4, Number(process.env.MEDIA_THUMB_WARMUP_CONCURRENCY || 3)));

  for (let index = 0; index < Math.min(concurrency, queue.length); index += 1) {
    void runMediaWarmWorker(queue, index, concurrency);
  }
}

async function runMediaWarmWorker(queue: MediaThumbInput[], start: number, step: number) {
  for (let index = start; index < queue.length; index += step) {
    await getCachedMediaThumbnailPath(queue[index]);
  }
}

export async function cleanupThumbCacheIfNeeded() {
  const root = cacheRoot();
  const files = listFiles(root);
  let total = files.reduce((sum, file) => sum + file.size, 0);
  if (total <= CACHE_LIMIT_BYTES) return;

  for (const file of files.sort((a, b) => a.mtimeMs - b.mtimeMs)) {
    try {
      fs.rmSync(file.path, { force: true });
      total -= file.size;
      if (total <= CACHE_LIMIT_BYTES * 0.9) break;
    } catch {}
  }
}

function touch(filePath: string) {
  const now = new Date();
  fs.utimes(filePath, now, now, () => {});
}

function listFiles(dir: string): Array<{ path: string; size: number; mtimeMs: number }> {
  const files: Array<{ path: string; size: number; mtimeMs: number }> = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(fullPath));
      continue;
    }
    const stat = fs.statSync(fullPath);
    files.push({ path: fullPath, size: stat.size, mtimeMs: stat.mtimeMs });
  }
  return files;
}

async function createMediaThumbnail(media: MediaThumbInput, target: string) {
  if (media.type === 'VIDEO') {
    const frame = await extractVideoFrame(media.url);
    if (frame) {
      await sharp(frame, { failOn: 'none' })
        .resize(360, 360, { fit: 'cover' })
        .webp({ quality: 72, effort: 3 })
        .toFile(target);
      await cleanupThumbCacheIfNeeded();
      return target;
    }
  }

  if (media.type === 'IMAGE' || media.type === 'GIF') {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(media.url, {
        signal: controller.signal,
        headers: {
          'User-Agent': process.env.SCRAPER_USER_AGENT || 'Mozilla/5.0',
          Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          Referer: 'https://coomerfans.com/',
        },
      });
      if (response.ok) {
        const buffer = Buffer.from(await response.arrayBuffer());
        await sharp(buffer, { failOn: 'none', animated: false })
          .resize(360, 360, { fit: 'cover' })
          .webp({ quality: 72, effort: 3 })
          .toFile(target);
        await cleanupThumbCacheIfNeeded();
        return target;
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  await createFallbackPoster(media.type, target);
  await cleanupThumbCacheIfNeeded();
  return target;
}

function extractVideoFrame(url: string) {
  return new Promise<string | null>((resolve) => {
    const tempFile = path.join(os.tmpdir(), `coomerfans-frame-${crypto.randomUUID()}.jpg`);
    const args = [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-headers',
      `User-Agent: ${process.env.SCRAPER_USER_AGENT || 'Mozilla/5.0'}\r\nReferer: https://coomerfans.com/\r\n`,
      '-ss',
      '00:00:01',
      '-i',
      url,
      '-frames:v',
      '1',
      '-q:v',
      '4',
      tempFile,
    ];

    execFile('ffmpeg', args, { timeout: 20000, windowsHide: true }, (error) => {
      if (error || !fs.existsSync(tempFile)) {
        resolve(null);
        return;
      }
      resolve(tempFile);
    });
  });
}

async function createFallbackPoster(type: string, target: string) {
  const label = type === 'VIDEO' ? 'VID' : type === 'GIF' ? 'GIF' : 'IMG';
  const svg = Buffer.from(`
    <svg width="360" height="360" xmlns="http://www.w3.org/2000/svg">
      <rect width="360" height="360" fill="#11121a"/>
      <circle cx="180" cy="180" r="74" fill="#05060a" opacity=".72"/>
      <polygon points="158,132 158,228 235,180" fill="#d7d9e8"/>
      <text x="180" y="314" text-anchor="middle" font-family="Arial" font-size="26" font-weight="700" fill="#7f8497">${label}</text>
    </svg>
  `);
  await sharp(svg).webp({ quality: 78 }).toFile(target);
}
