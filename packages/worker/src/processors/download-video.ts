import { Job } from 'bullmq';
import path from 'path';
import { getPrisma } from '../db';
import { downloadToFileSegmented } from './download-utils';
import { enqueueIdmDownload, isIdmAvailable } from './idm-utils';
import { formatDiagnostic, refreshDownloadMediaUrl } from './download-recovery';
import { refreshDownloadJobStatus } from './download-job-status';

interface VideoDownloadData {
  downloadMediaId: string;
  url: string;
  storagePath: string;
  jobId: string;
  downloadSegments?: number;
  downloadEngine?: string;
  idmMonitorMode?: string;
  downloadMode?: string;
}

export async function downloadVideoProcessor(job: Job<VideoDownloadData>) {
  const { downloadMediaId, storagePath, jobId, downloadSegments = 16, downloadEngine = 'NATIVE', idmMonitorMode = 'MONITOR', downloadMode = 'AUTO' } = job.data;
  let currentUrl = job.data.url;
  const prisma = getPrisma();
  const downloadMedia = await prisma.downloadMedia.findUnique({
    where: { id: downloadMediaId },
  });

  if (!downloadMedia) {
    throw new Error(`Download media ${downloadMediaId} not found`);
  }

  if (downloadMedia.status === 'PAUSED' || downloadMedia.status === 'CANCELLED') {
    return { skipped: downloadMedia.status };
  }

  await prisma.downloadMedia.update({
    where: { id: downloadMediaId },
    data: { status: 'DOWNLOADING', progress: 0 },
  });
  await prisma.downloadJob.update({
    where: { id: jobId },
    data: { status: 'DOWNLOADING', startedAt: new Date() },
  }).catch(() => {});

  await job.updateProgress(0);

  const diagnostics: string[] = [];
  const track = (message: string) => diagnostics.push(message);
  try {
    if (String(downloadEngine).toUpperCase() === 'IDM') {
      let lastControlCheck = 0;
      try {
        const result = await enqueueIdmDownload(
          currentUrl,
          storagePath,
          (progress) => {
            job.updateProgress(progress).catch(() => {});
          },
          {
            monitor: String(idmMonitorMode).toUpperCase() !== 'SEND_ONLY',
            shouldContinue: async () => {
              const now = Date.now();
              if (now - lastControlCheck < 1000) return true;
              lastControlCheck = now;
              const current = await prisma.downloadMedia.findUnique({
                where: { id: downloadMediaId },
                select: { status: true },
              });
              return current?.status !== 'PAUSED' && current?.status !== 'CANCELLED';
            },
          }
        );
        await prisma.media.update({
          where: { id: downloadMedia.mediaId },
          data: {
            storagePath,
            storageKey: storagePath,
            fileSize: result.fileSize ? BigInt(result.fileSize) : downloadMedia.fileSize,
            mimeType: guessVideoMimeType(storagePath),
            isDownloaded: String(idmMonitorMode).toUpperCase() === 'SEND_ONLY' ? false : true,
          },
        });
        await prisma.downloadMedia.update({
          where: { id: downloadMediaId },
          data: {
            status: 'COMPLETED',
            progress: 100,
            filePath: storagePath,
            fileSize: result.fileSize ? BigInt(result.fileSize) : downloadMedia.fileSize,
            errorMessage: null,
          },
        });
        await refreshDownloadJobStatus(prisma, jobId);
        await job.updateProgress(100);
        return { filePath: storagePath, fileSize: result.fileSize, speed: result.averageSpeed, engine: 'IDM' };
      } catch (error: any) {
        if (String(error?.message || '').includes('paused or cancelled')) throw error;
        const refreshed = await refreshDownloadMediaUrl(prisma, downloadMediaId, error);
        if (refreshed) currentUrl = refreshed;
        track(`IDM falhou, fallback nativo: ${error?.message || 'erro desconhecido'}`);
        await prisma.downloadMedia.update({
          where: { id: downloadMediaId },
          data: { errorMessage: formatDiagnostic('IDM falhou, tentando nativo', diagnostics) },
        });
      }
    }

    let lastControlCheck = 0;
    let result;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        result = await downloadToFileSegmented(
          currentUrl,
          storagePath,
          (progress) => {
            job.updateProgress(progress).catch(() => {});
          },
          {
            keepPartialOnAbort: true,
            segments: downloadSegments,
            expectedType: 'VIDEO',
            mode: normalizeDownloadMode(downloadMode),
            onDiagnostic: (event) => track(`${event.phase} ${event.status || ''} ${event.contentType || ''}`.trim()),
            shouldContinue: async () => {
              const now = Date.now();
              if (now - lastControlCheck < 1000) return true;
              lastControlCheck = now;
              const current = await prisma.downloadMedia.findUnique({
                where: { id: downloadMediaId },
                select: { status: true },
              });
              return current?.status !== 'PAUSED' && current?.status !== 'CANCELLED';
            },
          }
        );
        break;
      } catch (error: any) {
        if (attempt === 1) {
          const refreshed = await refreshDownloadMediaUrl(prisma, downloadMediaId, error);
          if (refreshed) {
            currentUrl = refreshed;
            track(`URL renovada apos ${error?.message || 'falha'}`);
            continue;
          }
        }
        if (String(downloadEngine).toUpperCase() !== 'IDM' && isIdmAvailable() && !String(error?.message || '').includes('paused or cancelled')) {
          track(`Nativo falhou, fallback IDM: ${error?.message || 'erro desconhecido'}`);
          const idmResult = await enqueueIdmDownload(currentUrl, storagePath, (progress) => {
            job.updateProgress(progress).catch(() => {});
          }, { monitor: true });
          result = {
            filePath: storagePath,
            fileSize: idmResult.fileSize,
            averageSpeed: idmResult.averageSpeed,
            totalBytes: idmResult.fileSize || null,
          };
          break;
        }
        throw error;
      }
    }
    if (!result) throw new Error('Download failed without result');

    if (result.fileSize === 0) {
      throw new Error('Downloaded file is empty');
    }

    await prisma.media.update({
      where: { id: downloadMedia.mediaId },
      data: {
        storagePath: result.filePath,
        storageKey: result.filePath,
        fileSize: BigInt(result.fileSize),
        mimeType: guessVideoMimeType(result.filePath),
        isDownloaded: true,
      },
    });

    await prisma.downloadMedia.update({
      where: { id: downloadMediaId },
      data: {
        status: 'COMPLETED',
        progress: 100,
        filePath: result.filePath,
        fileSize: BigInt(result.fileSize),
        errorMessage: null,
      },
    });

    await refreshDownloadJobStatus(prisma, jobId);
    await job.updateProgress(100);
    return { filePath: result.filePath, fileSize: result.fileSize, speed: result.averageSpeed };
  } catch (error: any) {
    const current = await prisma.downloadMedia.findUnique({
      where: { id: downloadMediaId },
      select: { status: true },
    });
    if (current?.status === 'PAUSED' || current?.status === 'CANCELLED') {
      return { skipped: current.status };
    }

    await prisma.downloadMedia.update({
      where: { id: downloadMediaId },
      data: {
        status: 'FAILED',
        errorMessage: formatDiagnostic(error.message || 'Download failed', diagnostics),
      },
    });
    await refreshDownloadJobStatus(prisma, jobId);
    throw error;
  }
}

function normalizeDownloadMode(mode: string): 'SAFE' | 'AUTO' | 'TURBO' {
  const normalized = String(mode).toUpperCase();
  if (normalized === 'SAFE' || normalized === 'TURBO') return normalized;
  return 'AUTO';
}

function guessVideoMimeType(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.webm') return 'video/webm';
  if (ext === '.mov') return 'video/quicktime';
  if (ext === '.m3u8') return 'application/vnd.apple.mpegurl';
  return 'video/mp4';
}
