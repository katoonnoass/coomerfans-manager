import type { PrismaClient } from '@prisma/client';

const REQUEST_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,*/*',
  Referer: 'https://coomerfans.com/',
};

function absoluteUrl(url: string) {
  if (url.startsWith('//')) return `https:${url}`;
  return url.startsWith('http') ? url : `https://coomerfans.com${url}`;
}

function canonicalMediaUrl(url: string) {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    parsed.search = '';
    return parsed.toString();
  } catch {
    return url.split('#')[0].split('?')[0];
  }
}

function fileNameKey(url: string) {
  try {
    return decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || '').toLowerCase();
  } catch {
    return url.split('?')[0].split('/').pop()?.toLowerCase() || '';
  }
}

function collectMediaUrls(html: string) {
  const urls = new Set<string>();
  const add = (raw: string) => {
    for (const candidate of raw.replace(/&amp;/g, '&').replace(/\\\//g, '/').split(',')) {
      const url = absoluteUrl(candidate.trim().split(/\s+/)[0] || '');
      if (/(storage|\/data\/).*\.(jpg|jpeg|png|webp|gif|mp4|webm|mov|m3u8)(?:$|\?)/i.test(url)
        || /\.(jpg|jpeg|png|webp|gif|mp4|webm|mov|m3u8)(?:$|\?)/i.test(url)) {
        urls.add(canonicalMediaUrl(url));
      }
    }
  };

  for (const match of html.matchAll(/<(img|source|video|a)[^>]+?\s(?:src|href|poster|data-src|srcset)=["']([^"']+)["'][^>]*>/gi)) {
    add(match[2]);
  }
  for (const match of html.matchAll(/https?:\/\/[^"'<>\s]+\.(?:jpg|jpeg|png|webp|gif|mp4|webm|mov|m3u8)(?:\?[^"'<>\s]*)?/gi)) {
    add(match[0]);
  }
  return Array.from(urls);
}

async function fetchHtml(url: string) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(30000),
    headers: REQUEST_HEADERS,
  });
  if (!response.ok) throw new Error(`refresh HTTP ${response.status}`);
  return response.text();
}

function shouldRefreshUrl(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /HTTP (403|404|410|429|50[0-4])|invalid .*payload|response is HTML|timeout|ECONNRESET|aborted/i.test(message);
}

export async function refreshDownloadMediaUrl(prisma: PrismaClient, downloadMediaId: string, error: unknown) {
  if (!shouldRefreshUrl(error)) return null;

  const row = await prisma.downloadMedia.findUnique({
    where: { id: downloadMediaId },
    include: {
      media: {
        include: {
          post: {
            include: { model: true },
          },
        },
      },
    },
  });
  if (!row) return null;

  const oldUrl = row.url || row.media.url;
  const oldFile = fileNameKey(oldUrl);
  const page = Number((row.media.post.metadata as any)?.page || 1);
  const metadata = (row.media.post.model.metadata as any) || {};
  const externalId = String(metadata.catalogExternalId || metadata.externalId || row.media.post.model.externalId).split(':').pop() || '';
  const catalogSlug = String(metadata.catalogSlug || row.media.post.model.slug);
  const profileSlug = row.media.post.model.service !== 'onlyfans' && catalogSlug.startsWith(`${row.media.post.model.service}-`)
    ? catalogSlug.slice(row.media.post.model.service.length + 1)
    : catalogSlug;

  const targets = [
    `https://coomerfans.com/p/${row.media.post.externalId}`,
    `https://coomerfans.com/u/${row.media.post.model.service}/${externalId}/${profileSlug}${page > 1 ? `?page=${page}` : ''}`,
  ];

  const candidates: string[] = [];
  for (const target of targets) {
    try {
      candidates.push(...collectMediaUrls(await fetchHtml(target)));
    } catch {}
  }

  const nextUrl = candidates.find((url) => fileNameKey(url) === oldFile)
    || candidates.find((url) => fileNameKey(url).includes(oldFile) || oldFile.includes(fileNameKey(url)))
    || null;

  if (!nextUrl || nextUrl === oldUrl) return null;

  await prisma.$transaction([
    prisma.media.update({ where: { id: row.mediaId }, data: { url: nextUrl } }),
    prisma.downloadMedia.update({ where: { id: row.id }, data: { url: nextUrl } }),
  ]);

  return nextUrl;
}

export function formatDiagnostic(message: string, events: string[]) {
  return [message, ...events.slice(-6)].join(' | ').slice(0, 1800);
}
