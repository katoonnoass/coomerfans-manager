import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { searchCatalog, upsertCatalogProfiles } from '../scrapers/coomerfans.scraper';
import { dedupeModelList } from '../services/model-dedupe.service';
import { warmThumbnailCache } from '../services/thumbnail-cache.service';

function publicThumbnail(slug: string, thumbnailUrl: string | null) {
  return `/api/models/${slug}/thumbnail`;
}

export async function search(req: Request, res: Response) {
  const q = (req.query.q as string) || '';
  const service = req.query.service as string | undefined;
  const content = String(req.query.content || 'all').toUpperCase();
  const sort = String(req.query.sort || 'posts');
  const page = Math.max(Number(req.query.page) || 1, 1);
  const pageSize = Math.min(Number(req.query.pageSize) || 24, 100);

  const where: any = {
    isActive: true,
    name: { contains: q, mode: 'insensitive' },
  };

  if (service) {
    where.service = service;
  }
  if (content === 'WITH_POSTS') {
    where.postCount = { gt: 0 };
  } else if (['IMAGE', 'VIDEO', 'GIF'].includes(content)) {
    where.posts = { some: { media: { some: { type: content } } } };
  }

  const orderBy = sort === 'name'
    ? { name: 'asc' as const }
    : sort === 'media'
      ? { mediaCount: 'desc' as const }
      : { postCount: 'desc' as const };

  let [models, total] = await Promise.all([
    prisma.model.findMany({
      where,
      select: {
        id: true,
        externalId: true,
        name: true,
        slug: true,
        service: true,
        thumbnailUrl: true,
        postCount: true,
      },
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.model.count({ where }),
  ]);

  if (q.trim().length >= 2 && page === 1 && models.length < Math.min(pageSize, 12)) {
    try {
      const discovered = await searchCatalog(q.trim(), 1);
      await upsertCatalogProfiles(discovered.profiles.slice(0, 60));

      [models, total] = await Promise.all([
        prisma.model.findMany({
          where,
          select: {
            id: true,
            externalId: true,
            name: true,
            slug: true,
            service: true,
            thumbnailUrl: true,
            postCount: true,
          },
          orderBy,
          skip: 0,
          take: pageSize,
        }),
        prisma.model.count({ where }),
      ]);
    } catch {
      // Local results are still returned if the external catalog is temporarily unavailable.
    }
  }

  const allSearchModels = q.trim()
    ? await prisma.model.findMany({
      where,
      select: {
        id: true,
        externalId: true,
        name: true,
        slug: true,
        service: true,
        thumbnailUrl: true,
        postCount: true,
        mediaCount: true,
        updatedAt: true,
      },
      orderBy,
      take: 500,
    })
    : null;
  const dedupedAllModels = allSearchModels ? dedupeModelList(allSearchModels) : null;
  const dedupedModels = dedupedAllModels
    ? dedupedAllModels.slice((page - 1) * pageSize, page * pageSize)
    : dedupeModelList(models);
  const dedupedTotal = dedupedAllModels ? dedupedAllModels.length : total;

  res.json({
    models: dedupedModels.map((m, i) => ({
      ...m,
      thumbnailUrl: publicThumbnail(m.slug, m.thumbnailUrl),
      rank: (page - 1) * pageSize + i + 1,
    })),
    total: dedupedTotal,
    page,
    pageSize,
  });
  warmThumbnailCache(dedupedModels);
}
