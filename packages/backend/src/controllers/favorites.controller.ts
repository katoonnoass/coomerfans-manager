import { Response } from 'express';
import { prisma } from '../config/database';
import { AuthRequest, GUEST_USER_ID } from '../middleware/auth.middleware';
import { resolveCatalogProfile, toCatalogPathSlug } from '../scrapers/coomerfans.scraper';
import {
  getFavoriteDownloadStatusMap,
  normalizeFavoriteDownloadStatus,
  setFavoriteDownloadStatus,
} from '../services/favorite-download-status.service';
import { warmThumbnailCache } from '../services/thumbnail-cache.service';

type CoomerCreator = {
  id: string;
  name: string;
  service: string;
  indexed?: string;
  updated?: string;
  public_id?: string | null;
  relation_id?: number | null;
  faved_seq?: number | null;
  last_imported?: string | null;
};

type FavoriteAuditIssue = {
  id: string;
  name: string;
  service: string;
  slug: string;
  status: 'OK' | 'MISMATCH' | 'NOT_FOUND' | 'ERROR';
  currentCatalogExternalId: string | null;
  currentCatalogSlug: string | null;
  siteCatalogExternalId: string | null;
  siteCatalogSlug: string | null;
  fixed?: boolean;
  error?: string;
};

function userId(req: AuthRequest) {
  return req.userId || GUEST_USER_ID;
}

function safeSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'creator';
}

function coomerThumb(service: string, id: string) {
  return `https://coomer.st/icons/${encodeURIComponent(service)}/${encodeURIComponent(id)}`;
}

export async function listFavorites(req: AuthRequest, res: Response) {
  const requestedStatus = normalizeFavoriteDownloadStatus(req.query.status);
  const favorites = await prisma.favorite.findMany({
    where: { userId: userId(req) },
    include: { model: true },
    orderBy: { createdAt: 'desc' },
  });
  const statusMap = await getFavoriteDownloadStatusMap(userId(req), favorites.map((favorite) => favorite.modelId));
  const filteredFavorites = requestedStatus
    ? favorites.filter((favorite) => statusMap.get(favorite.modelId) === requestedStatus)
    : favorites;
  warmThumbnailCache(favorites.map((favorite) => ({
    slug: favorite.model.slug,
    thumbnailUrl: favorite.model.thumbnailUrl,
  })));

  res.json(filteredFavorites.map((f) => ({
    ...f.model,
    metadata: f.model.metadata as Record<string, unknown> | null,
    lastScrapedAt: f.model.lastScrapedAt?.toISOString() ?? null,
    createdAt: f.model.createdAt.toISOString(),
    updatedAt: f.model.updatedAt.toISOString(),
    favoritedAt: f.createdAt.toISOString(),
    favoriteDownloadStatus: statusMap.get(f.modelId) || 'PENDING',
  })));
}

export async function addFavorite(req: AuthRequest, res: Response) {
  const { modelId } = req.params;

  const model = await prisma.model.findUnique({ where: { id: modelId } });
  if (!model) {
    res.status(404).json({ error: 'Model not found' });
    return;
  }

  const existing = await prisma.favorite.findUnique({
    where: { userId_modelId: { userId: userId(req), modelId } },
  });

  if (existing) {
    res.json({ message: 'Already favorited' });
    return;
  }

  await prisma.favorite.create({
    data: { userId: userId(req), modelId },
  });

  res.status(201).json({ message: 'Favorited' });
}

export async function removeFavorite(req: AuthRequest, res: Response) {
  const { modelId } = req.params;

  await prisma.favorite.deleteMany({
    where: { userId: userId(req), modelId },
  });

  res.json({ message: 'Removed from favorites' });
}

export async function updateFavoriteDownloadStatus(req: AuthRequest, res: Response) {
  const { modelId } = req.params;
  const status = normalizeFavoriteDownloadStatus(req.body?.status);
  if (!status) {
    res.status(400).json({ error: 'Invalid download status' });
    return;
  }

  const favorite = await prisma.favorite.findUnique({
    where: { userId_modelId: { userId: userId(req), modelId } },
  });
  if (!favorite) {
    res.status(404).json({ error: 'Favorite not found' });
    return;
  }

  await setFavoriteDownloadStatus(userId(req), modelId, status);
  res.json({ modelId, favoriteDownloadStatus: status });
}

export async function importCoomerFavorites(req: AuthRequest, res: Response) {
  const creators = Array.isArray(req.body?.creators)
    ? req.body.creators as CoomerCreator[]
    : Array.isArray(req.body)
      ? req.body as CoomerCreator[]
      : [];

  if (creators.length === 0) {
    res.status(400).json({ error: 'No coomer.st creators found. Send { creators: [...] }.' });
    return;
  }

  const summary = {
    received: creators.length,
    imported: 0,
    favorited: 0,
    updated: 0,
    skipped: 0,
  };
  const importedModels: Array<{ id: string; name: string; service: string; slug: string }> = [];

  for (const creator of creators) {
    if (!creator?.id || !creator?.name || !creator?.service) {
      summary.skipped += 1;
      continue;
    }

    const service = String(creator.service).toLowerCase();
    const name = String(creator.name).trim();
    const coomerId = String(creator.id);
    const preferredSlug = safeSlug(name);
    const fallbackSlug = `${service}-${preferredSlug}`;
    const coomerExternalId = `coomer.st:${service}:${coomerId}`;
    const catalogProfile = await resolveCatalogProfile(service, name, 5);
    const externalId = catalogProfile?.externalId || coomerExternalId;
    const modelSlug = catalogProfile?.slug || fallbackSlug;
    const thumbnailUrl = catalogProfile?.thumbnailUrl || coomerThumb(service, coomerId);

    const existing = await prisma.model.findFirst({
      where: {
        OR: [
          { externalId },
          { externalId: coomerExternalId },
          { slug: preferredSlug },
          { slug: fallbackSlug },
          { slug: modelSlug },
          { service, name: { equals: name, mode: 'insensitive' } },
        ],
      },
    });

    const existingMetadata = (existing?.metadata as Record<string, unknown> | null) || {};
    const shouldClearWrongPosts = Boolean(
      existing
      && catalogProfile
      && (existing.externalId.startsWith('coomer.st:') || existingMetadata.source === 'coomer.st')
      && (existing.postCount > 0 || existing.mediaCount > 0)
    );
    const metadata = {
      ...existingMetadata,
      source: catalogProfile ? 'coomerfans-catalog' : (existingMetadata.source || 'coomer.st'),
      ...(catalogProfile ? {
        catalogExternalId: catalogProfile.externalId,
        catalogSlug: catalogProfile.slug.replace(new RegExp(`^${service}-`), ''),
      } : {}),
      coomerSt: {
        id: coomerId,
        service,
        name,
        indexed: creator.indexed ?? null,
        updated: creator.updated ?? null,
        publicId: creator.public_id ?? null,
        relationId: creator.relation_id ?? null,
        favedSeq: creator.faved_seq ?? null,
        lastImported: creator.last_imported ?? null,
      },
    };

    const model = existing
      ? await prisma.model.update({
        where: { id: existing.id },
        data: {
          name: existing.name || name,
          service: existing.service || service,
          thumbnailUrl: catalogProfile?.thumbnailUrl || existing.thumbnailUrl || coomerThumb(service, coomerId),
          metadata,
          isActive: true,
        },
      })
      : await prisma.model.create({
        data: {
          externalId,
          service,
          name: catalogProfile?.name || name,
          slug: modelSlug,
          thumbnailUrl,
          metadata,
          isActive: true,
        },
      });

    summary.imported += existing ? 0 : 1;
    summary.updated += existing ? 1 : 0;
    importedModels.push({ id: model.id, name: model.name, service: model.service, slug: model.slug });

    if (shouldClearWrongPosts) {
      await prisma.post.deleteMany({ where: { modelId: model.id } });
      await prisma.model.update({
        where: { id: model.id },
        data: {
          postCount: 0,
          mediaCount: 0,
          lastScrapedAt: null,
        },
      });
    }

    const favorite = await prisma.favorite.findUnique({
      where: { userId_modelId: { userId: userId(req), modelId: model.id } },
    });
    if (!favorite) {
      await prisma.favorite.create({
        data: { userId: userId(req), modelId: model.id },
      });
      summary.favorited += 1;
    }
  }

  res.status(201).json({
    ...summary,
    totalFavorites: await prisma.favorite.count({ where: { userId: userId(req) } }),
    models: importedModels,
  });
}

export async function auditCoomerFavorites(req: AuthRequest, res: Response) {
  const fix = req.body?.fix === true || req.query.fix === '1';
  const includeOk = req.body?.includeOk === true || req.query.includeOk === '1';
  const favorites = await prisma.favorite.findMany({
    where: { userId: userId(req) },
    include: { model: true },
    orderBy: { createdAt: 'desc' },
  });

  const summary = {
    checked: 0,
    ok: 0,
    mismatch: 0,
    notFound: 0,
    errors: 0,
    fixed: 0,
  };
  const issues: FavoriteAuditIssue[] = [];
  const concurrency = 6;

  for (let index = 0; index < favorites.length; index += concurrency) {
    const batch = favorites.slice(index, index + concurrency);
    const results = await Promise.all(batch.map(async ({ model }) => {
      const metadata = (model.metadata as Record<string, unknown> | null) || {};
      const currentCatalogExternalId = String(metadata.catalogExternalId || metadata.externalId || (
        model.externalId.startsWith('coomer.st:') ? '' : model.externalId
      ) || '') || null;
      const currentCatalogSlug = String(metadata.catalogSlug || toCatalogPathSlug(model.service, model.slug) || '') || null;

      try {
        const resolved = await resolveCatalogProfile(model.service, model.name, 5);
        summary.checked += 1;

        if (!resolved) {
          summary.notFound += 1;
          return {
            id: model.id,
            name: model.name,
            service: model.service,
            slug: model.slug,
            status: 'NOT_FOUND' as const,
            currentCatalogExternalId,
            currentCatalogSlug,
            siteCatalogExternalId: null,
            siteCatalogSlug: null,
          };
        }

        const siteCatalogSlug = toCatalogPathSlug(resolved.service, resolved.slug);
        const isOk = currentCatalogExternalId === resolved.externalId && currentCatalogSlug === siteCatalogSlug;
        if (isOk) {
          summary.ok += 1;
          if (!includeOk) return null;
          return {
            id: model.id,
            name: model.name,
            service: model.service,
            slug: model.slug,
            status: 'OK' as const,
            currentCatalogExternalId,
            currentCatalogSlug,
            siteCatalogExternalId: resolved.externalId,
            siteCatalogSlug,
          };
        }

        summary.mismatch += 1;
        let fixed = false;
        if (fix) {
          await prisma.post.deleteMany({ where: { modelId: model.id } });
          await prisma.model.update({
            where: { id: model.id },
            data: {
              thumbnailUrl: resolved.thumbnailUrl,
              postCount: 0,
              mediaCount: 0,
              lastScrapedAt: null,
              metadata: {
                ...metadata,
                source: 'coomerfans-catalog',
                catalogExternalId: resolved.externalId,
                catalogSlug: siteCatalogSlug,
                auditedAt: new Date().toISOString(),
                auditFixedFrom: {
                  catalogExternalId: currentCatalogExternalId,
                  catalogSlug: currentCatalogSlug,
                },
              } as any,
            },
          });
          fixed = true;
          summary.fixed += 1;
        }

        return {
          id: model.id,
          name: model.name,
          service: model.service,
          slug: model.slug,
          status: 'MISMATCH' as const,
          currentCatalogExternalId,
          currentCatalogSlug,
          siteCatalogExternalId: resolved.externalId,
          siteCatalogSlug,
          fixed,
        };
      } catch (error) {
        summary.errors += 1;
        return {
          id: model.id,
          name: model.name,
          service: model.service,
          slug: model.slug,
          status: 'ERROR' as const,
          currentCatalogExternalId,
          currentCatalogSlug,
          siteCatalogExternalId: null,
          siteCatalogSlug: null,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }));

    issues.push(...results.filter(Boolean) as FavoriteAuditIssue[]);
  }

  res.json({
    ...summary,
    totalFavorites: favorites.length,
    issues,
  });
}
