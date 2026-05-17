import fs from 'fs';
import path from 'path';
import { prisma } from '../config/database';
import { downloadQueue, enqueueDownload } from './download.service';

export async function recalculateModelCounters(modelId?: string) {
  const models = await prisma.model.findMany({
    where: modelId ? { id: modelId } : undefined,
    select: { id: true },
  });

  let updated = 0;
  for (const model of models) {
    const [postCount, mediaCount] = await Promise.all([
      prisma.post.count({ where: { modelId: model.id } }),
      prisma.media.count({ where: { post: { modelId: model.id } } }),
    ]);

    await prisma.model.update({
      where: { id: model.id },
      data: { postCount, mediaCount },
    });
    updated += 1;
  }

  return { updated };
}

export async function dedupeAllMedia() {
  const rows = await prisma.media.findMany({
    select: {
      id: true,
      url: true,
      isDownloaded: true,
      createdAt: true,
      post: { select: { modelId: true } },
    },
    orderBy: [
      { url: 'asc' },
      { isDownloaded: 'desc' },
      { createdAt: 'asc' },
    ],
  });

  const seen = new Set<string>();
  const duplicateIds: string[] = [];
  const affectedModelIds = new Set<string>();

  for (const row of rows) {
    const key = `${row.post.modelId}:${row.url}`;
    if (seen.has(key)) {
      duplicateIds.push(row.id);
      affectedModelIds.add(row.post.modelId);
    } else {
      seen.add(key);
    }
  }

  for (let index = 0; index < duplicateIds.length; index += 500) {
    await prisma.media.deleteMany({
      where: { id: { in: duplicateIds.slice(index, index + 500) } },
    });
  }

  for (const modelId of affectedModelIds) {
    await recalculateModelCounters(modelId);
  }

  return {
    duplicatesRemoved: duplicateIds.length,
    modelsUpdated: affectedModelIds.size,
  };
}

export async function requeuePendingDownloads() {
  const jobs = await prisma.downloadJob.findMany({
    where: { status: { in: ['PENDING', 'DOWNLOADING'] } },
    include: {
      model: true,
      user: { include: { settings: true } },
      media: {
        where: { status: { in: ['PENDING', 'DOWNLOADING'] } },
      },
    },
  });

  let enqueued = 0;
  for (const job of jobs) {
    await prisma.downloadJob.update({
      where: { id: job.id },
      data: { status: 'PENDING', speed: 0, errorMessage: null },
    });
    await prisma.downloadMedia.updateMany({
      where: { downloadJobId: job.id, status: 'DOWNLOADING' },
      data: { status: 'PENDING', errorMessage: null },
    });

    const settings = job.user.settings;
    const downloadSegments = Math.max(1, Math.min(16, Number(settings?.downloadSegments || 16)));
    const downloadEngine = String((settings as any)?.downloadEngine || 'NATIVE').toUpperCase() === 'IDM' ? 'IDM' : 'NATIVE';
    const idmMonitorMode = String((settings as any)?.idmMonitorMode || 'MONITOR').toUpperCase() === 'SEND_ONLY' ? 'SEND_ONLY' : 'MONITOR';
    const downloadMode = ['SAFE', 'TURBO'].includes(String((settings as any)?.downloadMode || '').toUpperCase())
      ? String((settings as any)?.downloadMode).toUpperCase()
      : 'AUTO';

    for (const dm of job.media) {
      try {
        await downloadQueue.remove(dm.id).catch(() => undefined);
        await enqueueDownload(
          dm.id,
          dm.type as 'IMAGE' | 'VIDEO',
          dm.url,
          job.id,
          job.model.name,
          settings?.downloadPath || null,
          downloadSegments,
          downloadEngine,
          idmMonitorMode,
          downloadMode,
          job.priority
        );
        enqueued += 1;
      } catch {}
    }
  }

  return { jobs: jobs.length, enqueued };
}

export async function getSystemHealth() {
  const [downloadCounts, mediaCounts, pendingJobs, failedItems, activeItems, lastFailedDownload, lastSyncRun] = await Promise.all([
    prisma.downloadJob.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.media.groupBy({ by: ['isDownloaded'], _count: { _all: true } }),
    downloadQueue.getWaitingCount().catch(() => 0),
    prisma.downloadMedia.count({ where: { status: 'FAILED' } }),
    prisma.downloadMedia.count({ where: { status: { in: ['PENDING', 'DOWNLOADING'] } } }),
    prisma.downloadMedia.findFirst({
      where: { status: 'FAILED' },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, errorMessage: true, updatedAt: true, downloadJob: { select: { modelName: true } } },
    }),
    prisma.syncRun.findFirst({
      orderBy: { updatedAt: 'desc' },
      select: { slug: true, status: true, currentPage: true, pagesChecked: true, errorMessage: true, updatedAt: true },
    }),
  ]);

  const mediaPath = path.resolve(process.env.MEDIA_PATH || './media');
  const disk = folderSize(mediaPath);

  return {
    downloadsByStatus: Object.fromEntries(downloadCounts.map((row) => [row.status, row._count._all])),
    media: {
      downloaded: mediaCounts.find((row) => row.isDownloaded)?._count._all || 0,
      pending: mediaCounts.find((row) => !row.isDownloaded)?._count._all || 0,
    },
    queue: {
      waiting: pendingJobs,
      failedItems,
      activeItems,
    },
    lastFailedDownload: lastFailedDownload ? {
      id: lastFailedDownload.id,
      modelName: lastFailedDownload.downloadJob.modelName,
      errorMessage: lastFailedDownload.errorMessage,
      updatedAt: lastFailedDownload.updatedAt.toISOString(),
    } : null,
    lastSyncRun: lastSyncRun ? {
      ...lastSyncRun,
      updatedAt: lastSyncRun.updatedAt.toISOString(),
    } : null,
    storage: {
      path: mediaPath,
      exists: fs.existsSync(mediaPath),
      bytes: disk,
    },
  };
}

export async function cleanupPartialFiles() {
  const mediaPath = path.resolve(process.env.MEDIA_PATH || './media');
  if (!fs.existsSync(mediaPath)) return { removed: 0, bytes: 0 };

  let removed = 0;
  let bytes = 0;
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const stack = [mediaPath];

  while (stack.length) {
    const current = stack.pop()!;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      try {
        if (entry.isDirectory()) {
          stack.push(full);
          continue;
        }
        if (!entry.isFile() || !/\.part(?:\.\d+)?$/i.test(entry.name)) continue;
        const stat = fs.statSync(full);
        if (stat.mtimeMs > cutoff) continue;
        bytes += stat.size;
        fs.rmSync(full, { force: true });
        removed += 1;
      } catch {}
    }
  }

  return { removed, bytes };
}

export function listIdmImportFiles() {
  const mediaPath = path.resolve(process.env.MEDIA_PATH || './media');
  const dir = path.join(mediaPath, '_idm_imports');
  if (!fs.existsSync(dir)) return { path: dir, files: [] };

  const files = fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(ef2|ief)$/i.test(entry.name))
    .map((entry) => {
      const fullPath = path.join(dir, entry.name);
      const stat = fs.statSync(fullPath);
      return {
        name: entry.name,
        path: fullPath,
        bytes: stat.size,
        updatedAt: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return { path: dir, files };
}

function folderSize(dir: string) {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop()!;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      try {
        if (entry.isDirectory()) stack.push(full);
        else if (entry.isFile()) total += fs.statSync(full).size;
      } catch {}
    }
  }
  return total;
}
