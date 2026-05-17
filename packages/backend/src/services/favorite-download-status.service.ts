import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';

export const FAVORITE_DOWNLOAD_STATUSES = [
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED_WAITING_UPDATES',
] as const;

export type FavoriteDownloadStatus = typeof FAVORITE_DOWNLOAD_STATUSES[number];

export function normalizeFavoriteDownloadStatus(value: unknown): FavoriteDownloadStatus | null {
  const status = String(value || '').trim().toUpperCase();
  return FAVORITE_DOWNLOAD_STATUSES.includes(status as FavoriteDownloadStatus)
    ? status as FavoriteDownloadStatus
    : null;
}

export async function setFavoriteDownloadStatus(
  userId: string,
  modelId: string,
  status: FavoriteDownloadStatus
) {
  await prisma.$executeRaw`
    UPDATE "Favorite"
    SET "downloadStatus" = ${status}
    WHERE "userId" = ${userId}
      AND "modelId" = ${modelId}
  `;
}

export async function getFavoriteDownloadStatusMap(userId: string, modelIds: string[]) {
  if (modelIds.length === 0) return new Map<string, FavoriteDownloadStatus>();

  const rows = await prisma.$queryRaw<Array<{ modelId: string; downloadStatus: string }>>`
    SELECT "modelId", "downloadStatus"
    FROM "Favorite"
    WHERE "userId" = ${userId}
      AND "modelId" IN (${Prisma.join(modelIds)})
  `;

  return new Map(rows.map((row) => [
    row.modelId,
    normalizeFavoriteDownloadStatus(row.downloadStatus) || 'PENDING',
  ]));
}

export async function syncFavoriteStatusFromDownloadJob(downloadJobId: string, jobStatus: string) {
  const job = await prisma.downloadJob.findUnique({
    where: { id: downloadJobId },
    select: { userId: true, modelId: true },
  });
  if (!job) return;

  const status = jobStatus === 'COMPLETED'
    ? 'COMPLETED_WAITING_UPDATES'
    : ['PENDING', 'PAUSED'].includes(jobStatus)
      ? 'PENDING'
      : ['DOWNLOADING'].includes(jobStatus)
        ? 'IN_PROGRESS'
        : null;

  if (status) {
    await setFavoriteDownloadStatus(job.userId, job.modelId, status);
  }
}
