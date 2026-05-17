import { prisma } from '../config/database';

type ModelLike = {
  id: string;
  externalId: string;
  service: string;
  name: string;
  slug: string;
  postCount?: number;
  mediaCount?: number;
  metadata?: unknown;
  updatedAt?: Date | string;
};

type ProfileLike = {
  externalId: string;
  service: string;
  name: string;
  slug: string;
};

export function normalizeCreatorKey(service: string, value: string) {
  const prefix = `${service.toLowerCase()}-`;
  const cleaned = value.toLowerCase().trim().startsWith(prefix)
    ? value.toLowerCase().trim().slice(prefix.length)
    : value.toLowerCase().trim();
  return cleaned.replace(/[^a-z0-9]+/g, '');
}

export function modelIdentityKey(model: Pick<ModelLike, 'service' | 'name' | 'slug'>) {
  return `${model.service.toLowerCase()}:${normalizeCreatorKey(model.service, model.name || model.slug)}`;
}

export function dedupeModelList<T extends ModelLike>(models: T[]) {
  const byKey = new Map<string, T>();

  for (const model of models) {
    const key = modelIdentityKey(model);
    const current = byKey.get(key);
    if (!current || scoreModel(model) > scoreModel(current)) {
      byKey.set(key, model);
    }
  }

  return Array.from(byKey.values());
}

export async function mergeDuplicateModelsForProfile(profile: ProfileLike) {
  const service = profile.service.toLowerCase();
  const normalizedName = normalizeCreatorKey(service, profile.name);
  const normalizedSlug = normalizeCreatorKey(service, profile.slug);

  const candidates = await prisma.model.findMany({
    where: {
      OR: [
        { externalId: profile.externalId },
        { slug: profile.slug },
        { slug: `${service}-${profile.slug}` },
        { service, name: { equals: profile.name, mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      externalId: true,
      service: true,
      name: true,
      slug: true,
      postCount: true,
      mediaCount: true,
      metadata: true,
      updatedAt: true,
    },
  });

  const matching = candidates.filter((model) => {
    if (model.service.toLowerCase() !== service) return false;
    const modelName = normalizeCreatorKey(service, model.name);
    const modelSlug = normalizeCreatorKey(service, model.slug);
    return model.externalId === profile.externalId
      || modelName === normalizedName
      || modelName === normalizedSlug
      || modelSlug === normalizedName
      || modelSlug === normalizedSlug;
  });

  if (matching.length <= 1) return matching[0]?.id ?? null;

  const canonical = matching.sort((a, b) => {
    const aExact = a.externalId === profile.externalId ? 1 : 0;
    const bExact = b.externalId === profile.externalId ? 1 : 0;
    if (aExact !== bExact) return bExact - aExact;
    return scoreModel(b) - scoreModel(a);
  })[0];

  for (const duplicate of matching) {
    if (duplicate.id === canonical.id) continue;
    await mergeModelInto(duplicate.id, canonical.id);
  }

  await refreshModelCounts(canonical.id);
  return canonical.id;
}

export async function mergeAllDuplicateModels() {
  const models = await prisma.model.findMany({
    select: {
      id: true,
      externalId: true,
      service: true,
      name: true,
      slug: true,
      postCount: true,
      mediaCount: true,
      metadata: true,
      updatedAt: true,
    },
    orderBy: [{ service: 'asc' }, { name: 'asc' }],
  });

  const groups = new Map<string, typeof models>();
  for (const model of models) {
    const key = modelIdentityKey(model);
    groups.set(key, [...(groups.get(key) || []), model]);
  }

  let merged = 0;
  for (const group of groups.values()) {
    if (group.length <= 1) continue;
    const canonical = group.sort((a, b) => scoreModel(b) - scoreModel(a))[0];
    for (const duplicate of group) {
      if (duplicate.id === canonical.id) continue;
      await mergeModelInto(duplicate.id, canonical.id);
      merged += 1;
    }
    await refreshModelCounts(canonical.id);
  }

  return { merged };
}

async function mergeModelInto(sourceModelId: string, targetModelId: string) {
  const source = await prisma.model.findUnique({ where: { id: sourceModelId } });
  const target = await prisma.model.findUnique({ where: { id: targetModelId } });
  if (!source || !target) return;

  const favorites = await prisma.favorite.findMany({ where: { modelId: sourceModelId } });
  for (const favorite of favorites) {
    const exists = await prisma.favorite.findUnique({
      where: { userId_modelId: { userId: favorite.userId, modelId: targetModelId } },
    });
    if (exists) {
      await prisma.favorite.delete({ where: { id: favorite.id } });
    } else {
      await prisma.favorite.update({ where: { id: favorite.id }, data: { modelId: targetModelId } });
    }
  }

  await prisma.downloadJob.updateMany({
    where: { modelId: sourceModelId },
    data: { modelId: targetModelId, modelName: target.name },
  });

  const sourcePosts = await prisma.post.findMany({
    where: { modelId: sourceModelId },
    select: { id: true, externalId: true },
  });
  for (const post of sourcePosts) {
    const existing = await prisma.post.findUnique({
      where: { externalId_modelId: { externalId: post.externalId, modelId: targetModelId } },
      select: { id: true },
    });
    if (!existing) {
      await prisma.post.update({ where: { id: post.id }, data: { modelId: targetModelId } });
      continue;
    }

    const media = await prisma.media.findMany({ where: { postId: post.id } });
    for (const item of media) {
      const duplicateMedia = await prisma.media.findFirst({
        where: { postId: existing.id, url: item.url },
        select: { id: true },
      });
      if (duplicateMedia) {
        await prisma.media.delete({ where: { id: item.id } });
      } else {
        await prisma.media.update({ where: { id: item.id }, data: { postId: existing.id } });
      }
    }
    await prisma.post.delete({ where: { id: post.id } });
  }

  const sourceMetadata = (source.metadata as Record<string, unknown> | null) || {};
  const targetMetadata = (target.metadata as Record<string, unknown> | null) || {};
  await prisma.model.update({
    where: { id: targetModelId },
    data: {
      thumbnailUrl: target.thumbnailUrl || source.thumbnailUrl,
      metadata: {
        ...sourceMetadata,
        ...targetMetadata,
        mergedDuplicateIds: [
          ...new Set([
            ...((targetMetadata.mergedDuplicateIds as string[] | undefined) || []),
            sourceModelId,
          ]),
        ],
        mergedAt: new Date().toISOString(),
      },
    },
  });

  await prisma.model.delete({ where: { id: sourceModelId } });
}

async function refreshModelCounts(modelId: string) {
  const [postCount, mediaCount] = await Promise.all([
    prisma.post.count({ where: { modelId } }),
    prisma.media.count({ where: { post: { modelId } } }),
  ]);
  await prisma.model.update({ where: { id: modelId }, data: { postCount, mediaCount } });
}

function scoreModel(model: Pick<ModelLike, 'externalId' | 'postCount' | 'mediaCount' | 'updatedAt'>) {
  const canonicalExternalId = model.externalId.startsWith('coomer.st:') ? 0 : 1_000_000;
  const contentScore = (model.postCount || 0) * 1_000 + (model.mediaCount || 0);
  const updatedScore = model.updatedAt ? Math.floor(new Date(model.updatedAt).getTime() / 1_000_000_000) : 0;
  return canonicalExternalId + contentScore + updatedScore;
}
