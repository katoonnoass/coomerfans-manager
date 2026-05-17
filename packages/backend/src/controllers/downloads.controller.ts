import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { AuthRequest, GUEST_USER_ID } from '../middleware/auth.middleware';
import { enqueueDownload, downloadQueue } from '../services/download.service';
import { createIdmImportFiles, streamIdmProxyDownload } from '../services/idm-import.service';
import {
  getFavoriteDownloadStatusMap,
  setFavoriteDownloadStatus,
} from '../services/favorite-download-status.service';

function userId(req: AuthRequest) {
  return req.userId || GUEST_USER_ID;
}

async function removeQueuedDownloadMedia(downloadMediaId: string) {
  try {
    await downloadQueue.remove(downloadMediaId);
  } catch {}

  const jobs = await downloadQueue.getJobs(['waiting', 'delayed', 'prioritized', 'paused'], 0, 500);
  await Promise.all(
    jobs
      .filter((job) => (job.data as any)?.downloadMediaId === downloadMediaId)
      .map((job) => job.remove().catch(() => undefined))
  );
}

async function mapLimit<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>) {
  const results: PromiseSettledResult<R>[] = [];
  let cursor = 0;

  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      try {
        results[index] = { status: 'fulfilled', value: await worker(items[index]) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

export async function listDownloads(req: AuthRequest, res: Response) {
  const downloads = await prisma.downloadJob.findMany({
    where: { userId: userId(req) },
    include: { media: true, model: { select: { slug: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  res.json(downloads.map((d) => ({
    ...d,
    totalSize: d.totalSize ? Number(d.totalSize) : null,
    downloadedSize: Number(d.downloadedSize),
    startedAt: d.startedAt?.toISOString() ?? null,
    completedAt: d.completedAt?.toISOString() ?? null,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
    media: d.media.map((m) => ({
      ...m,
      fileSize: m.fileSize ? Number(m.fileSize) : null,
    })),
  })));
}

export async function createDownload(req: AuthRequest, res: Response) {
  const { modelId, mediaIds, priority = 'NORMAL', downloadPath } = req.body;
  const uid = userId(req);

  const model = await prisma.model.findUnique({ where: { id: modelId } });
  if (!model) {
    res.status(404).json({ error: 'Model not found' });
    return;
  }

  const favoriteStatus = (await getFavoriteDownloadStatusMap(uid, [model.id])).get(model.id);
  const activeProfileDownload = favoriteStatus === 'PENDING' || favoriteStatus === 'IN_PROGRESS'
    ? await prisma.downloadJob.findFirst({
      where: {
        userId: uid,
        modelId: model.id,
        status: { in: ['PENDING', 'DOWNLOADING', 'PAUSED'] },
      },
      select: { id: true, status: true },
    })
    : null;
  if (activeProfileDownload) {
    res.status(409).json({
      error: 'Profile download is already pending or in progress',
      favoriteDownloadStatus: favoriteStatus,
      downloadJobId: activeProfileDownload.id,
      downloadJobStatus: activeProfileDownload.status,
    });
    return;
  }

  const media = await prisma.media.findMany({
    where: { id: { in: mediaIds } },
  });

  if (media.length === 0) {
    res.status(400).json({ error: 'No valid media found' });
    return;
  }

  const requestedUrls = Array.from(new Set(media.map((m) => m.url).filter(Boolean)));
  const [downloadedMedia, completedDownloadMedia] = await Promise.all([
    prisma.media.findMany({
      where: { url: { in: requestedUrls }, isDownloaded: true },
      select: { url: true },
    }),
    prisma.downloadMedia.findMany({
      where: { url: { in: requestedUrls }, status: 'COMPLETED' },
      select: { url: true },
    }),
  ]);
  const alreadyDownloadedUrls = new Set([
    ...downloadedMedia.map((m) => m.url),
    ...completedDownloadMedia.map((m) => m.url),
  ]);
  const seenUrls = new Set<string>();
  const mediaToDownload = media.filter((m) => {
    if (alreadyDownloadedUrls.has(m.url) || seenUrls.has(m.url)) return false;
    seenUrls.add(m.url);
    return true;
  });

  if (mediaToDownload.length === 0) {
    res.status(200).json({
      message: 'All selected links were already downloaded',
      skipped: media.length,
      enqueued: 0,
      total: media.length,
    });
    return;
  }

  const settings = await prisma.userSetting.findUnique({
    where: { userId: uid },
  });
  const downloadRoot = downloadPath?.trim() || settings?.downloadPath || null;
  const downloadSegments = Math.max(1, Math.min(16, Number(settings?.downloadSegments || 16)));
  const downloadEngine = String((settings as any)?.downloadEngine || 'NATIVE').toUpperCase() === 'IDM' ? 'IDM' : 'NATIVE';
  const idmMonitorMode = String((settings as any)?.idmMonitorMode || 'MONITOR').toUpperCase() === 'SEND_ONLY' ? 'SEND_ONLY' : 'MONITOR';
  const idmModeRaw = String((settings as any)?.idmMonitorMode || 'MONITOR').toUpperCase();
  const idmImportFileMode = downloadEngine === 'IDM' && idmModeRaw === 'IMPORT_FILE';
  const downloadMode = ['SAFE', 'TURBO'].includes(String((settings as any)?.downloadMode || '').toUpperCase())
    ? String((settings as any)?.downloadMode).toUpperCase()
    : 'AUTO';

  const job = await prisma.downloadJob.create({
    data: {
      userId: uid,
      modelId: model.id,
      modelName: model.name,
      totalItems: mediaToDownload.length,
      totalSize: mediaToDownload.reduce((acc, m) => acc + (m.fileSize || 0n), 0n),
      status: 'PENDING',
      priority,
      media: {
        create: mediaToDownload.map((m) => ({
          mediaId: m.id,
          url: m.url,
          type: m.type,
        })),
      },
    },
    include: { media: true },
  });
  await setFavoriteDownloadStatus(uid, model.id, 'PENDING');

  if (idmImportFileMode) {
    const importFiles = createIdmImportFiles({
      jobId: job.id,
      modelName: model.name,
      downloadRoot,
      media: job.media.map((item) => ({ id: item.id, url: item.url, type: item.type })),
    });

    await prisma.downloadJob.update({
      where: { id: job.id },
      data: {
        status: 'PENDING',
        errorMessage: `Arquivo IDM gerado: ${importFiles.cmdPath}`,
      },
    });

    res.status(201).json({
      ...job,
      errorMessage: `Arquivo IDM gerado: ${importFiles.cmdPath}`,
      totalSize: job.totalSize ? Number(job.totalSize) : null,
      downloadedSize: Number(job.downloadedSize),
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
      media: job.media.map((m) => ({
        ...m,
        fileSize: m.fileSize ? Number(m.fileSize) : null,
      })),
      enqueued: 0,
      skipped: media.length - mediaToDownload.length,
      total: media.length,
      idmImport: importFiles,
    });
    return;
  }

  // Enqueue each download media item
  const enqueueResults = await mapLimit(
    job.media,
    20,
    async (dm) => {
      // Only enqueue if Redis is available
      try {
        await enqueueDownload(dm.id, dm.type as 'IMAGE' | 'VIDEO', dm.url, job.id, model.name, downloadRoot, downloadSegments, downloadEngine, idmMonitorMode, downloadMode, priority);
      } catch {
        // Redis might not be available — jobs will stay as PENDING
        console.warn(`Redis unavailable, download ${dm.id} queued in DB only`);
        throw new Error('Redis unavailable');
      }
    }
  );

  const enqueued = enqueueResults.filter((r) => r.status === 'fulfilled').length;

  await prisma.downloadJob.update({
    where: { id: job.id },
    data: { status: enqueued > 0 ? 'PENDING' : 'PENDING' },
  });

  res.status(201).json({
    ...job,
    totalSize: job.totalSize ? Number(job.totalSize) : null,
    downloadedSize: Number(job.downloadedSize),
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    media: job.media.map((m) => ({
      ...m,
      fileSize: m.fileSize ? Number(m.fileSize) : null,
    })),
    enqueued,
    skipped: media.length - mediaToDownload.length,
    total: media.length,
  });
}

export async function createModelDownload(req: AuthRequest, res: Response) {
  const mediaType = String(req.body?.mediaType || req.query.mediaType || 'all').toUpperCase();
  const onlyNotDownloaded = req.body?.onlyNotDownloaded !== false;
  const media = await prisma.media.findMany({
    where: {
      post: { modelId: req.params.modelId },
      ...(mediaType && mediaType !== 'ALL' ? { type: mediaType } : {}),
      ...(onlyNotDownloaded ? { isDownloaded: false } : {}),
    },
    select: { id: true },
    take: 5000,
  });

  if (media.length === 0) {
    res.status(400).json({ error: 'Nenhuma mídia disponível para este filtro' });
    return;
  }

  req.body = {
    ...req.body,
    modelId: req.params.modelId,
    mediaIds: media.map((item) => item.id),
  };
  return createDownload(req, res);
}

export async function cancelDownload(req: AuthRequest, res: Response) {
  const job = await prisma.downloadJob.findFirst({
    where: { id: req.params.id, userId: userId(req) },
    include: { media: true },
  });

  if (!job) {
    res.status(404).json({ error: 'Download not found' });
    return;
  }

  // Remove pending jobs from queue
  for (const dm of job.media) {
    if (dm.status === 'PENDING' || dm.status === 'DOWNLOADING') {
      await removeQueuedDownloadMedia(dm.id);
    }
  }

  await prisma.downloadJob.update({
    where: { id: job.id },
    data: { status: 'CANCELLED' },
  });
  await setFavoriteDownloadStatus(job.userId, job.modelId, 'PENDING');

  await prisma.downloadMedia.updateMany({
    where: {
      downloadJobId: job.id,
      status: { in: ['PENDING', 'DOWNLOADING'] },
    },
    data: { status: 'CANCELLED' },
  });

  res.json({ message: 'Download cancelled' });
}

export async function pauseDownload(req: AuthRequest, res: Response) {
  const job = await prisma.downloadJob.findFirst({
    where: { id: req.params.id, userId: userId(req) },
    include: { media: true },
  });

  if (!job) {
    res.status(404).json({ error: 'Download not found' });
    return;
  }

  for (const dm of job.media) {
    if (dm.status === 'PENDING' || dm.status === 'DOWNLOADING') {
      await removeQueuedDownloadMedia(dm.id);
    }
  }

  await prisma.downloadMedia.updateMany({
    where: {
      downloadJobId: job.id,
      status: { in: ['PENDING', 'DOWNLOADING'] },
    },
    data: { status: 'PAUSED' },
  });

  await prisma.downloadJob.update({
    where: { id: job.id },
    data: { status: 'PAUSED', speed: 0 },
  });
  await setFavoriteDownloadStatus(job.userId, job.modelId, 'PENDING');

  res.json({ message: 'Download paused' });
}

export async function resumeDownload(req: AuthRequest, res: Response) {
  const job = await prisma.downloadJob.findFirst({
    where: { id: req.params.id, userId: userId(req) },
    include: { media: true, model: true },
  });

  if (!job) {
    res.status(404).json({ error: 'Download not found' });
    return;
  }

  const settings = await prisma.userSetting.findUnique({
    where: { userId: userId(req) },
  });
  const resumableItems = job.media.filter((m) => m.status === 'PAUSED');

  await Promise.all(
    resumableItems.map(async (dm) => {
      await prisma.downloadMedia.update({
        where: { id: dm.id },
        data: { status: 'PENDING', errorMessage: null },
      });

      try {
        await enqueueDownload(
          dm.id,
          dm.type as 'IMAGE' | 'VIDEO',
          dm.url,
          job.id,
          job.model.name,
          settings?.downloadPath || null,
          Math.max(1, Math.min(16, Number(settings?.downloadSegments || 16))),
          String((settings as any)?.downloadEngine || 'NATIVE').toUpperCase() === 'IDM' ? 'IDM' : 'NATIVE',
          String((settings as any)?.idmMonitorMode || 'MONITOR').toUpperCase() === 'SEND_ONLY' ? 'SEND_ONLY' : 'MONITOR',
          ['SAFE', 'TURBO'].includes(String((settings as any)?.downloadMode || '').toUpperCase()) ? String((settings as any)?.downloadMode).toUpperCase() : 'AUTO',
          job.priority
        );
      } catch {}
    })
  );

  await prisma.downloadJob.update({
    where: { id: job.id },
    data: { status: resumableItems.length > 0 ? 'PENDING' : job.status, errorMessage: null, speed: 0 },
  });
  await setFavoriteDownloadStatus(job.userId, job.modelId, 'PENDING');

  res.json({ message: `Resuming ${resumableItems.length} items`, resumedCount: resumableItems.length });
}

export async function retryDownload(req: AuthRequest, res: Response) {
  const job = await prisma.downloadJob.findFirst({
    where: { id: req.params.id, userId: userId(req) },
    include: { media: true, model: true },
  });

  if (!job) {
    res.status(404).json({ error: 'Download not found' });
    return;
  }

  const failedItems = job.media.filter((m) => m.status === 'FAILED');

  await Promise.all(
    failedItems.map(async (dm) => {
      await prisma.downloadMedia.update({
        where: { id: dm.id },
        data: { status: 'PENDING', errorMessage: null, progress: 0 },
      });

      try {
        const settings = await prisma.userSetting.findUnique({ where: { userId: userId(req) } });
        await enqueueDownload(
          dm.id,
          dm.type as 'IMAGE' | 'VIDEO',
          dm.url,
          job.id,
          job.model.name,
          settings?.downloadPath || null,
          Math.max(1, Math.min(16, Number(settings?.downloadSegments || 16))),
          String((settings as any)?.downloadEngine || 'NATIVE').toUpperCase() === 'IDM' ? 'IDM' : 'NATIVE',
          String((settings as any)?.idmMonitorMode || 'MONITOR').toUpperCase() === 'SEND_ONLY' ? 'SEND_ONLY' : 'MONITOR',
          ['SAFE', 'TURBO'].includes(String((settings as any)?.downloadMode || '').toUpperCase()) ? String((settings as any)?.downloadMode).toUpperCase() : 'AUTO',
          job.priority
        );
      } catch {}
    })
  );

  await prisma.downloadJob.update({
    where: { id: job.id },
    data: { status: 'PENDING', errorMessage: null, retryCount: { increment: 1 } },
  });
  await setFavoriteDownloadStatus(job.userId, job.modelId, 'PENDING');

  res.json({ message: `Retrying ${failedItems.length} items`, retriedCount: failedItems.length });
}

export async function retryAllFailedDownloads(req: AuthRequest, res: Response) {
  const jobs = await prisma.downloadJob.findMany({
    where: {
      userId: userId(req),
      status: 'FAILED',
    },
    include: { media: true, model: true },
    take: 100,
  });

  let retriedCount = 0;
  for (const job of jobs) {
    const failedItems = job.media.filter((m) => m.status === 'FAILED');
    const settings = await prisma.userSetting.findUnique({ where: { userId: userId(req) } });
    for (const dm of failedItems) {
      await prisma.downloadMedia.update({
        where: { id: dm.id },
        data: { status: 'PENDING', errorMessage: null, progress: 0 },
      });
      try {
        await enqueueDownload(
          dm.id,
          dm.type as 'IMAGE' | 'VIDEO',
          dm.url,
          job.id,
          job.model.name,
          settings?.downloadPath || null,
          Math.max(1, Math.min(16, Number(settings?.downloadSegments || 16))),
          String((settings as any)?.downloadEngine || 'NATIVE').toUpperCase() === 'IDM' ? 'IDM' : 'NATIVE',
          String((settings as any)?.idmMonitorMode || 'MONITOR').toUpperCase() === 'SEND_ONLY' ? 'SEND_ONLY' : 'MONITOR',
          ['SAFE', 'TURBO'].includes(String((settings as any)?.downloadMode || '').toUpperCase()) ? String((settings as any)?.downloadMode).toUpperCase() : 'AUTO',
          job.priority
        );
        retriedCount += 1;
      } catch {}
    }
    await prisma.downloadJob.update({
      where: { id: job.id },
      data: { status: 'PENDING', errorMessage: null, retryCount: { increment: 1 } },
    });
    await setFavoriteDownloadStatus(job.userId, job.modelId, 'PENDING');
  }

  res.json({ message: `Retrying ${retriedCount} failed items`, jobs: jobs.length, retriedCount });
}

export async function clearDownloadHistory(req: AuthRequest, res: Response) {
  const result = await prisma.downloadJob.deleteMany({
    where: {
      userId: userId(req),
      status: { in: ['COMPLETED', 'FAILED', 'CANCELLED'] },
    },
  });

  res.json({ message: 'Download history cleared', deletedCount: result.count });
}

export async function proxyIdmDownload(req: Request, res: Response) {
  await streamIdmProxyDownload(req.params.downloadMediaId, String(req.query.token || ''), res);
}
