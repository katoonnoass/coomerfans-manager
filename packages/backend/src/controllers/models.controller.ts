import { Request, Response } from 'express';
import { prisma } from '../config/database';
import type { ModelProfile } from '@coomerfans/shared';
import { scrapeProfilePosts, syncCatalog } from '../scrapers/coomerfans.scraper';
import fs from 'fs';
import { dedupeModelList } from '../services/model-dedupe.service';
import { getCachedThumbnailPath, warmThumbnailCache } from '../services/thumbnail-cache.service';
import { getModelRefresh, startModelRefresh, stopModelRefresh } from '../services/model-refresh.service';

const modelSelect = {
  id: true,
  externalId: true,
  service: true,
  name: true,
  slug: true,
  description: true,
  thumbnailUrl: true,
  bannerUrl: true,
  postCount: true,
  mediaCount: true,
  likesCount: true,
  isVerified: true,
  isActive: true,
  metadata: true,
  lastScrapedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

function cachePublic(res: Response, seconds = 30) {
  res.setHeader('Cache-Control', `public, max-age=${seconds}, stale-while-revalidate=${seconds * 4}`);
}

function publicModel(model: {
  thumbnailUrl: string | null;
  bannerUrl?: string | null;
  slug: string;
  service?: string;
}) {
  return {
    ...model,
    thumbnailUrl: `/api/models/${model.slug}/thumbnail`,
    bannerUrl: model.bannerUrl || `/api/models/${model.slug}/avatar.svg?banner=1`,
  };
}

const DEFAULT_SYNC_QUERIES = ['a', 'e', 'i', 'o', 'u', 's', 'm', 'n', 'l', 'r'];

export async function listModels(req: Request, res: Response) {
  const page = Number(req.query.page) || 1;
  const pageSize = Math.min(Number(req.query.pageSize) || 40, 120);
  const service = req.query.service as string | undefined;
  const q = String(req.query.q || '').trim();
  const sort = String(req.query.sort || 'updated');
  const content = String(req.query.content || 'all').toUpperCase();

  const where: any = { isActive: true };
  if (service && service !== 'all') {
    where.service = service;
  }
  if (q) {
    where.name = { contains: q, mode: 'insensitive' };
  }
  if (content === 'WITH_POSTS') {
    where.postCount = { gt: 0 };
  } else if (['IMAGE', 'VIDEO', 'GIF'].includes(content)) {
    where.posts = { some: { media: { some: { type: content } } } };
  }

  const orderBy = sort === 'posts'
    ? { postCount: 'desc' as const }
    : sort === 'media'
      ? { mediaCount: 'desc' as const }
      : sort === 'name'
        ? { name: 'asc' as const }
        : { updatedAt: 'desc' as const };

  const [models, total] = await Promise.all([
    prisma.model.findMany({
      where,
      select: modelSelect,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.model.count({ where }),
  ]);

  const dedupedModels = dedupeModelList(models);
  const data = dedupedModels.map((m) => ({
    ...publicModel(m),
    service: m.service as ModelProfile['service'],
    metadata: m.metadata as Record<string, unknown> | null,
    lastScrapedAt: m.lastScrapedAt?.toISOString() ?? null,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  }));
  warmThumbnailCache(dedupedModels);

  const response = {
    data,
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total,
  };

  cachePublic(res, 20);
  res.json(response);
}

export async function syncModels(req: Request, res: Response) {
  const rawQueries = req.body?.queries ?? req.query.queries;
  const queries = Array.isArray(rawQueries)
    ? rawQueries.map(String)
    : typeof rawQueries === 'string'
      ? rawQueries.split(',')
      : DEFAULT_SYNC_QUERIES;
  const pages = Number(req.body?.pages ?? req.query.pages) || 1;
  const limit = Number(req.body?.limit ?? req.query.limit) || 500;

  const result = await syncCatalog({
    queries: queries.map((q) => q.trim()).filter(Boolean),
    pages,
    limit,
  });
  const totalModels = await prisma.model.count({ where: { isActive: true } });

  res.json({
    ...result,
    totalModels,
  });
}

export async function refreshModelPosts(req: Request, res: Response) {
  const maxPages = Math.max(1, Math.min(Number(req.body?.pages ?? req.query.pages) || 10, 50));
  const mode = String(req.body?.mode ?? req.query.mode ?? 'FAST').toUpperCase() === 'FULL' ? 'FULL' : 'FAST';
  const model = await prisma.model.findUnique({
    where: { slug: req.params.slug },
    select: {
      id: true,
      name: true,
      slug: true,
      postCount: true,
      mediaCount: true,
      lastScrapedAt: true,
      _count: { select: { posts: true } },
    },
  });

  if (!model) {
    res.status(404).json({ error: 'Model not found' });
    return;
  }

  const progress = startModelRefresh(req.params.slug, maxPages, mode);
  res.status(202).json({
    slug: model.slug,
    name: model.name,
    pagesChecked: progress.pagesChecked,
    currentPage: progress.currentPage,
    maxPages: progress.maxPages,
    status: progress.status,
    mode: progress.mode,
    pageLogs: progress.pageLogs || [],
    hasMorePages: progress.hasMorePages,
    postsImported: progress.postsImported,
    mediaImported: progress.mediaImported,
    postsInDatabase: model._count.posts,
    mediaCount: model.mediaCount,
    postCount: model.postCount,
    lastScrapedAt: model.lastScrapedAt?.toISOString() ?? null,
  });
}

export async function stopRefreshModelPosts(req: Request, res: Response) {
  const reason = String(req.body?.reason || req.query.reason || 'cancelled') === 'paused' ? 'paused' : 'cancelled';
  const progress = stopModelRefresh(req.params.slug, reason);
  if (!progress) {
    res.status(404).json({ error: 'No active refresh' });
    return;
  }
  res.json(progress);
}

export async function getRefreshModelPostsStatus(req: Request, res: Response) {
  const progress = getModelRefresh(req.params.slug);
  if (!progress) {
    res.status(404).json({ error: 'No active refresh' });
    return;
  }
  res.json(progress);
}

export async function refreshModelPostsPage(req: Request, res: Response) {
  const page = Math.max(1, Math.min(Number(req.body?.page ?? req.query.page) || 1, 500));
  const result = await scrapeProfilePosts(req.params.slug, page);

  const model = await prisma.model.findUnique({
    where: { slug: req.params.slug },
    select: {
      id: true,
      name: true,
      slug: true,
      postCount: true,
      mediaCount: true,
      lastScrapedAt: true,
      _count: { select: { posts: true } },
    },
  });

  if (!model) {
    res.status(404).json({ error: 'Model not found' });
    return;
  }

  res.json({
    slug: model.slug,
    name: model.name,
    page,
    hasMorePages: result.hasNext,
    postsImported: result.postsImported,
    mediaImported: result.mediaImported,
    postsInDatabase: model._count.posts,
    mediaCount: model.mediaCount,
    postCount: model.postCount,
    lastScrapedAt: model.lastScrapedAt?.toISOString() ?? null,
  });
}

export async function getModel(req: Request, res: Response) {
  const model = await prisma.model.findUnique({
    where: { slug: req.params.slug },
    select: modelSelect,
  });

  if (!model) {
    res.status(404).json({ error: 'Model not found' });
    return;
  }

  cachePublic(res, 45);
  res.json({
    ...publicModel(model),
    metadata: model.metadata as Record<string, unknown> | null,
    lastScrapedAt: model.lastScrapedAt?.toISOString() ?? null,
    createdAt: model.createdAt.toISOString(),
    updatedAt: model.updatedAt.toISOString(),
  });
}

export async function getModelAvatar(req: Request, res: Response) {
  const model = await prisma.model.findUnique({
    where: { slug: req.params.slug },
    select: { name: true, service: true, slug: true },
  });

  if (!model) {
    res.status(404).send('Not found');
    return;
  }

  const banner = req.query.banner === '1';
  const width = banner ? 1200 : 600;
  const height = banner ? 420 : 800;
  const seed = [...model.slug].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const hueA = seed % 360;
  const hueB = (hueA + 70) % 360;
  const hueC = (hueA + 150) % 360;
  const initials = model.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
  const safeName = model.name.replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] || ch
  ));

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${hueA},92%,42%)"/>
      <stop offset="48%" stop-color="hsl(${hueB},95%,30%)"/>
      <stop offset="100%" stop-color="hsl(${hueC},90%,18%)"/>
    </linearGradient>
    <radialGradient id="r" cx="50%" cy="35%" r="70%">
      <stop offset="0%" stop-color="rgba(255,255,255,.34)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
    </radialGradient>
    <filter id="glow"><feGaussianBlur stdDeviation="10" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect width="100%" height="100%" fill="#080812"/>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <rect width="100%" height="100%" fill="url(#r)"/>
  <g opacity=".22">
    <circle cx="${width * 0.18}" cy="${height * 0.22}" r="${width * 0.22}" fill="hsl(${hueB},100%,62%)"/>
    <circle cx="${width * 0.86}" cy="${height * 0.75}" r="${width * 0.28}" fill="hsl(${hueC},100%,58%)"/>
  </g>
  <g filter="url(#glow)">
    <text x="50%" y="${banner ? '48%' : '45%'}" text-anchor="middle" dominant-baseline="middle" font-family="Segoe UI, Arial, sans-serif" font-size="${banner ? 130 : 170}" font-weight="800" fill="white" opacity=".92">${initials}</text>
  </g>
  <text x="50%" y="${banner ? '73%' : '66%'}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="${banner ? 46 : 42}" font-weight="700" fill="white" opacity=".92">${safeName}</text>
  <text x="50%" y="${banner ? '84%' : '73%'}" text-anchor="middle" font-family="Consolas, monospace" font-size="${banner ? 24 : 22}" fill="white" opacity=".62">${model.service}</text>
</svg>`;

  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
  res.send(svg);
}

export async function getModelThumbnail(req: Request, res: Response) {
  const model = await prisma.model.findUnique({
    where: { slug: req.params.slug },
    select: { slug: true, thumbnailUrl: true },
  });

  if (!model) {
    res.status(404).send('Not found');
    return;
  }

  const fallback = `/api/models/${model.slug}/avatar.svg`;
  if (!model.thumbnailUrl) {
    res.redirect(fallback);
    return;
  }

  const cachePath = await getCachedThumbnailPath(model.slug, model.thumbnailUrl);
  if (cachePath && fs.existsSync(cachePath)) {
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    res.type('image/webp');
    res.sendFile(cachePath);
    return;
  }

  res.redirect(fallback);
}

export async function getModelPosts(req: Request, res: Response) {
  const model = await prisma.model.findUnique({
    where: { slug: req.params.slug },
    select: { id: true, metadata: true },
  });

  if (!model) {
    res.status(404).json({ error: 'Model not found' });
    return;
  }

  const page = Number(req.query.page) || 1;
  const pageSize = Math.min(Number(req.query.pageSize) || 24, 72);
  const mediaType = String(req.query.mediaType || 'all').toUpperCase();
  const skip = (page - 1) * pageSize;

  const mediaWhere = mediaType && mediaType !== 'ALL'
    ? { type: mediaType }
    : {};
  const postWhere = {
    modelId: model.id,
    ...(mediaType && mediaType !== 'ALL' ? { media: { some: mediaWhere } } : {}),
  };

  const [posts, total] = await Promise.all([
    prisma.post.findMany({
      where: postWhere,
      select: {
        id: true,
        externalId: true,
        modelId: true,
        title: true,
        description: true,
        postedAt: true,
        scrapedAt: true,
        metadata: true,
        media: {
          where: mediaWhere,
          select: {
            id: true,
            postId: true,
            type: true,
            url: true,
            storageKey: true,
            storagePath: true,
            fileSize: true,
            width: true,
            height: true,
            duration: true,
            thumbnailKey: true,
            mimeType: true,
            quality: true,
            isDownloaded: true,
            createdAt: true,
          },
        },
      },
      orderBy: { postedAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.post.count({ where: postWhere }),
  ]);

  cachePublic(res, 20);
  res.json({
    data: posts.map((p) => ({
      ...p,
      postedAt: p.postedAt?.toISOString() ?? null,
      scrapedAt: p.scrapedAt.toISOString(),
      metadata: p.metadata as Record<string, unknown> | null,
      media: p.media.map((m) => ({
        ...m,
        fileSize: m.fileSize ? Number(m.fileSize) : null,
        createdAt: m.createdAt.toISOString(),
      })),
    })),
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total,
  });
}
