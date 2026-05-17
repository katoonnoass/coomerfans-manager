import { Server as SocketIOServer } from 'socket.io';
import type { WsEventMap } from '@coomerfans/shared';
import {
  downloadQueue,
  downloadEvents,
  scrapeEvents,
} from '../services/download.service';
import { prisma } from '../config/database';
import { syncFavoriteStatusFromDownloadJob } from './favorite-download-status.service';
import { scrapeProfilePosts } from '../scrapers/coomerfans.scraper';
import { onModelRefreshProgress } from './model-refresh.service';

const activeDownloadSpeeds = new Map<string, Map<string, number>>();
let favoriteMonitorStarted = false;
let favoriteMonitorCursor = 0;
let favoriteMonitorRunning = false;

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function setActiveSpeed(downloadJobId: string, downloadMediaId: string, speed: number) {
  if (!activeDownloadSpeeds.has(downloadJobId)) {
    activeDownloadSpeeds.set(downloadJobId, new Map());
  }

  activeDownloadSpeeds.get(downloadJobId)?.set(downloadMediaId, Math.max(0, speed));
}

function clearActiveSpeed(downloadJobId: string, downloadMediaId: string) {
  const speeds = activeDownloadSpeeds.get(downloadJobId);
  if (!speeds) return;
  speeds.delete(downloadMediaId);
  if (speeds.size === 0) activeDownloadSpeeds.delete(downloadJobId);
}

async function refreshDownloadJobAggregate(downloadJobId: string) {
  const media = await prisma.downloadMedia.findMany({
    where: { downloadJobId },
  });

  const totalItems = media.length;
  const completedItems = media.filter((item) => item.status === 'COMPLETED').length;
  const failedItems = media.filter((item) => item.status === 'FAILED').length;
  const cancelledItems = media.filter((item) => item.status === 'CANCELLED').length;
  const pausedItems = media.filter((item) => item.status === 'PAUSED').length;
  const totalSize = media.reduce((sum, item) => sum + (item.fileSize ? Number(item.fileSize) : 0), 0);
  const hasKnownSize = media.some((item) => item.fileSize);
  const downloadedSize = media.reduce((sum, item) => {
    const fileSize = item.fileSize ? Number(item.fileSize) : 0;
    if (item.status === 'COMPLETED') return sum + fileSize;
    if (!fileSize || !item.progress) return sum;
    return sum + Math.floor((fileSize * item.progress) / 100);
  }, 0);
  const progress = totalItems > 0
    ? hasKnownSize && totalSize > 0
      ? Math.min(100, (downloadedSize / totalSize) * 100)
      : media.reduce((sum, item) => sum + (item.status === 'COMPLETED' ? 100 : item.progress), 0) / totalItems
    : 0;
  const speed = Array.from(activeDownloadSpeeds.get(downloadJobId)?.values() || [])
    .reduce((sum, value) => sum + value, 0);
  const finished = totalItems > 0 && completedItems + failedItems + cancelledItems >= totalItems;
  const status = finished
    ? cancelledItems > 0 ? 'CANCELLED' : failedItems > 0 ? 'FAILED' : 'COMPLETED'
    : pausedItems > 0 && completedItems + failedItems + cancelledItems + pausedItems >= totalItems ? 'PAUSED'
    : completedItems > 0 || progress > 0 ? 'DOWNLOADING' : 'PENDING';

  await prisma.downloadJob.update({
    where: { id: downloadJobId },
    data: {
      completedItems,
      failedItems,
      downloadedSize: BigInt(downloadedSize),
      totalSize: hasKnownSize ? BigInt(totalSize) : undefined,
      progress: Math.round(progress),
      speed,
      status,
      completedAt: finished ? new Date() : undefined,
    },
  });
  await syncFavoriteStatusFromDownloadJob(downloadJobId, status);

  return {
    completedItems,
    failedItems,
    downloadedSize,
    totalSize: hasKnownSize ? totalSize : null,
    progress: Math.round(progress),
    speed,
    status,
  };
}

export function setupWebSocket(io: SocketIOServer) {
  io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    const userId = socket.handshake.auth?.userId;
    if (userId) {
      socket.join(`user:${userId}`);
    }

    socket.on('subscribe:downloads', (downloadJobId?: string) => {
      if (downloadJobId) {
        socket.join(`download:${downloadJobId}`);
      }
    });

    socket.on('subscribe:scrapes', (slug?: string) => {
      if (slug) {
        socket.join(`scrape:${slug}`);
      }
    });

    socket.on('subscribe:model-refresh', (slug?: string) => {
      if (slug) {
        socket.join(`model-refresh:${slug}`);
      }
    });

    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
    });
  });

  onModelRefreshProgress((progress) => {
    io.to(`model-refresh:${progress.slug}`).emit('model-refresh:progress', progress);
  });

  downloadEvents.on('progress', async ({ jobId, data }: { jobId: string; data: any }) => {
    try {
      const progress = typeof data === 'number' ? data : toNumber(data?.progress);
      const downloadedBytes = typeof data === 'number' ? 0 : toNumber(data?.downloadedBytes);
      const totalBytes = typeof data === 'number' || data?.totalBytes == null
        ? null
        : toNumber(data.totalBytes);
      const speed = typeof data === 'number' ? 0 : toNumber(data?.speed);
      const job = await downloadQueue.getJob(jobId);
      if (!job) return;

      const { downloadMediaId } = job.data as any;

      const current = await prisma.downloadMedia.findUnique({
        where: { id: downloadMediaId },
        select: { status: true },
      });
      if (current?.status === 'PAUSED' || current?.status === 'CANCELLED' || current?.status === 'FAILED') return;

      await prisma.downloadMedia.update({
        where: { id: downloadMediaId },
        data: {
          progress,
          status: progress >= 100 ? 'COMPLETED' : 'DOWNLOADING',
          fileSize: totalBytes ? BigInt(totalBytes) : undefined,
        },
      });

      const dm = await prisma.downloadMedia.findUnique({
        where: { id: downloadMediaId },
        include: { downloadJob: true },
      });

      if (dm) {
        setActiveSpeed(dm.downloadJobId, dm.id, speed);
        const aggregate = await refreshDownloadJobAggregate(dm.downloadJobId);

        io.to(`user:${dm.downloadJob.userId}`).emit('download:progress', {
          downloadJobId: dm.downloadJobId,
          downloadMediaId: dm.id,
          mediaId: dm.mediaId,
          progress: typeof progress === 'number' ? progress : 0,
          downloadedSize: downloadedBytes,
          speed,
          status: dm.status,
          fileSize: totalBytes ?? (dm.fileSize ? Number(dm.fileSize) : null),
          jobProgress: aggregate.progress,
          jobDownloadedSize: aggregate.downloadedSize,
          jobTotalSize: aggregate.totalSize,
          jobSpeed: aggregate.speed,
        });
      }
    } catch {}
  });

  downloadEvents.on('completed', async ({ jobId }) => {
    try {
      const job = await downloadQueue.getJob(jobId);
      if (!job) return;

      const { downloadMediaId } = job.data as any;

      const dm = await prisma.downloadMedia.findUnique({
        where: { id: downloadMediaId },
        include: { downloadJob: true },
      });

      if (!dm) return;
      if (dm.status === 'PAUSED' || dm.status === 'CANCELLED') {
        clearActiveSpeed(dm.downloadJobId, dm.id);
        await refreshDownloadJobAggregate(dm.downloadJobId);
        return;
      }

      const returnValue = (job.returnvalue || {}) as { filePath?: string; fileSize?: number };
      if (returnValue.filePath || returnValue.fileSize) {
        await prisma.downloadMedia.update({
          where: { id: dm.id },
          data: {
            status: 'COMPLETED',
            progress: 100,
            filePath: returnValue.filePath || dm.filePath,
            fileSize: returnValue.fileSize ? BigInt(returnValue.fileSize) : dm.fileSize,
            errorMessage: null,
          },
        });
        await prisma.media.update({
          where: { id: dm.mediaId },
          data: {
            storagePath: returnValue.filePath || undefined,
            storageKey: returnValue.filePath || undefined,
            fileSize: returnValue.fileSize ? BigInt(returnValue.fileSize) : undefined,
            isDownloaded: true,
          },
        }).catch(() => undefined);
      }

      clearActiveSpeed(dm.downloadJobId, dm.id);
      const aggregate = await refreshDownloadJobAggregate(dm.downloadJobId);

      io.to(`user:${dm.downloadJob.userId}`).emit('download:complete', {
        downloadJobId: dm.downloadJobId,
        downloadMediaId: dm.id,
        mediaId: dm.mediaId,
        filePath: dm.filePath || '',
        fileSize: dm.fileSize ? Number(dm.fileSize) : 0,
        completedItems: aggregate.completedItems,
        failedItems: aggregate.failedItems,
        progress: aggregate.progress,
        status: aggregate.status,
        downloadedSize: aggregate.downloadedSize,
        totalSize: aggregate.totalSize,
        speed: aggregate.speed,
      });

      io.to(`user:${dm.downloadJob.userId}`).emit('download:job-update', {
        downloadJobId: dm.downloadJobId,
        status: aggregate.status,
        progress: aggregate.progress,
      });
    } catch {}
  });

  downloadEvents.on('failed', async ({ jobId, failedReason }) => {
    try {
      const job = await downloadQueue.getJob(jobId);
      if (!job) return;

      const { downloadMediaId } = job.data as any;

      const dm = await prisma.downloadMedia.findUnique({
        where: { id: downloadMediaId },
        include: { downloadJob: true },
      });

      if (dm) {
        clearActiveSpeed(dm.downloadJobId, dm.id);
        if (dm.status !== 'PAUSED' && dm.status !== 'CANCELLED') {
          await prisma.downloadMedia.update({
            where: { id: dm.id },
            data: {
              status: 'FAILED',
              errorMessage: failedReason || 'Download failed',
            },
          });
        }
        const aggregate = await refreshDownloadJobAggregate(dm.downloadJobId);

        io.to(`user:${dm.downloadJob.userId}`).emit('download:job-update', {
          downloadJobId: dm.downloadJobId,
          status: aggregate.status,
          progress: aggregate.progress,
        });
      }
    } catch {}
  });

  scrapeEvents.on('completed', async ({ jobId }) => {
    try {
      const job = await import('../services/download.service').then(
        (m) => m.scrapeQueue
      ).then((q) => q.getJob(jobId));
      if (!job) return;

      const { slug } = job.data as any;
      io.to(`scrape:${slug}`).emit('scrape:progress', {
        modelId: slug,
        modelName: slug,
        postsFound: 0,
        mediaFound: 0,
        status: 'completed',
      });
    } catch {}
  });

  startFavoritePostMonitor(io);
}

function startFavoritePostMonitor(io: SocketIOServer) {
  if (favoriteMonitorStarted) return;
  favoriteMonitorStarted = true;

  const intervalMs = Math.max(30 * 60_000, Number(process.env.FAVORITE_POST_CHECK_INTERVAL_MS || 60 * 60_000));
  const batchSize = Math.max(1, Math.min(5, Number(process.env.FAVORITE_POST_CHECK_BATCH_SIZE || 3)));
  const run = async () => {
    if (favoriteMonitorRunning || io.engine.clientsCount === 0) return;
    favoriteMonitorRunning = true;
    try {
      const favorites = await prisma.favorite.findMany({
        include: {
          model: {
            select: {
              id: true,
              name: true,
              slug: true,
              postCount: true,
              mediaCount: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      });

      if (favorites.length === 0) return;
      const batch = Array.from({ length: Math.min(batchSize, favorites.length) }, (_, index) => {
        const favorite = favorites[(favoriteMonitorCursor + index) % favorites.length];
        return favorite;
      });
      favoriteMonitorCursor = (favoriteMonitorCursor + batch.length) % favorites.length;

      for (const favorite of batch) {
        const beforePosts = favorite.model.postCount;
        const beforeMedia = favorite.model.mediaCount;
        try {
          await scrapeProfilePosts(favorite.model.slug, 1);
          const updated = await prisma.model.findUnique({
            where: { id: favorite.model.id },
            select: { postCount: true, mediaCount: true },
          });
          if (!updated) continue;

          const newPosts = Math.max(0, updated.postCount - beforePosts);
          const newMedia = Math.max(0, updated.mediaCount - beforeMedia);
          if (newPosts > 0 || newMedia > 0) {
            io.to(`user:${favorite.userId}`).emit('notification', {
              title: 'Novos posts encontrados',
              message: `${favorite.model.name}: ${newPosts} posts novos, ${newMedia} mídias novas`,
              type: 'success',
            });
          }
        } catch {}
      }
    } catch {
    } finally {
      favoriteMonitorRunning = false;
    }
  };

  setTimeout(run, intervalMs);
  setInterval(run, intervalMs);
}

export function emitToUser<T extends keyof WsEventMap>(
  io: SocketIOServer,
  userId: string,
  event: T,
  data: WsEventMap[T]
) {
  io.to(`user:${userId}`).emit(event, data);
}

export function emitToDownload<T extends keyof WsEventMap>(
  io: SocketIOServer,
  downloadJobId: string,
  event: T,
  data: WsEventMap[T]
) {
  io.to(`download:${downloadJobId}`).emit(event, data);
}
