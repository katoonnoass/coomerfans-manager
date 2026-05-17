import { Job } from 'bullmq';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { getPrisma } from '../db';
import { downloadToFile } from './download-utils';
import { enqueueIdmDownload, isIdmAvailable } from './idm-utils';
import { formatDiagnostic, refreshDownloadMediaUrl } from './download-recovery';
import { refreshDownloadJobStatus } from './download-job-status';

interface ImageDownloadData {
  downloadMediaId: string;
  url: string;
  storagePath: string;
  jobId: string;
  downloadEngine?: string;
  idmMonitorMode?: string;
  downloadMode?: string;
}

export async function downloadImageProcessor(job: Job<ImageDownloadData>) {
  const { downloadMediaId, storagePath, jobId, downloadEngine = 'NATIVE', idmMonitorMode = 'MONITOR', downloadMode = 'AUTO' } = job.data;
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

  const dir = path.dirname(storagePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const filePath = storagePath;

  const diagnostics: string[] = [];
  const track = (message: string) => diagnostics.push(message);
  try {
    if (String(downloadEngine).toUpperCase() === 'IDM') {
      let lastControlCheck = 0;
      try {
        const result = await enqueueIdmDownload(
          currentUrl,
          filePath,
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
            storagePath: filePath,
            storageKey: filePath,
            fileSize: result.fileSize ? BigInt(result.fileSize) : downloadMedia.fileSize,
            isDownloaded: String(idmMonitorMode).toUpperCase() === 'SEND_ONLY' ? false : true,
          },
        });
        await prisma.downloadMedia.update({
          where: { id: downloadMediaId },
          data: {
            status: 'COMPLETED',
            progress: 100,
            filePath,
            fileSize: result.fileSize ? BigInt(result.fileSize) : downloadMedia.fileSize,
            errorMessage: null,
          },
        });
        await refreshDownloadJobStatus(prisma, jobId);
        await job.updateProgress(100);
        return { filePath, fileSize: result.fileSize, speed: result.averageSpeed, engine: 'IDM' };
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
        result = await downloadToFile(
          currentUrl,
          filePath,
          (progress) => {
            job.updateProgress(progress).catch(() => {});
          },
          {
            keepPartialOnAbort: true,
            expectedType: 'IMAGE',
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
          const idmResult = await enqueueIdmDownload(currentUrl, filePath, (progress) => {
            job.updateProgress(progress).catch(() => {});
          }, { monitor: true });
          result = {
            filePath,
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
    const buffer = fs.readFileSync(filePath);

    if (!buffer || buffer.length === 0 || result.fileSize === 0) {
      throw new Error('Downloaded file is empty');
    }

    await job.updateProgress(80);

    const thumbDir = path.join(dir, 'thumbnails');
    if (!fs.existsSync(thumbDir)) {
      fs.mkdirSync(thumbDir, { recursive: true });
    }

    const thumbPath = path.join(thumbDir, path.basename(storagePath));

    try {
      const metadata = await sharp(buffer).metadata();
      const thumbBuffer = await sharp(buffer)
        .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();

      fs.writeFileSync(thumbPath, thumbBuffer);

      await prisma.media.update({
        where: { id: downloadMedia.mediaId },
        data: {
          storagePath: filePath,
          storageKey: filePath,
          fileSize: BigInt(result.fileSize),
          width: metadata.width || null,
          height: metadata.height || null,
          thumbnailKey: thumbPath,
          mimeType: `image/${metadata.format || 'jpeg'}`,
          isDownloaded: true,
        },
      });

      await prisma.downloadMedia.update({
        where: { id: downloadMediaId },
        data: {
          status: 'COMPLETED',
          progress: 100,
          filePath,
          fileSize: BigInt(result.fileSize),
          errorMessage: null,
        },
      });
    } catch {
      // Thumbnail failed but download succeeded
      await prisma.media.update({
        where: { id: downloadMedia.mediaId },
        data: {
          storagePath: filePath,
          storageKey: filePath,
          fileSize: BigInt(result.fileSize),
          isDownloaded: true,
        },
      });

      await prisma.downloadMedia.update({
        where: { id: downloadMediaId },
        data: {
          status: 'COMPLETED',
          progress: 100,
          filePath,
          fileSize: BigInt(result.fileSize),
          errorMessage: null,
        },
      });
    }

    await refreshDownloadJobStatus(prisma, jobId);
    await job.updateProgress(100);
    return { filePath, fileSize: result.fileSize, speed: result.averageSpeed };
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
