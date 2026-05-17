import type { PrismaClient } from '@prisma/client';

export async function refreshDownloadJobStatus(prisma: PrismaClient, downloadJobId: string) {
  const items = await prisma.downloadMedia.findMany({
    where: { downloadJobId },
    select: { status: true, progress: true, fileSize: true },
  });
  if (items.length === 0) return;

  const completedItems = items.filter((item) => item.status === 'COMPLETED').length;
  const failedItems = items.filter((item) => item.status === 'FAILED').length;
  const activeItems = items.filter((item) => ['PENDING', 'DOWNLOADING', 'PAUSED'].includes(item.status)).length;
  const downloadedSize = items.reduce((sum, item) => item.status === 'COMPLETED' && item.fileSize ? sum + item.fileSize : sum, 0n);
  const progress = Math.round(items.reduce((sum, item) => sum + Number(item.progress || 0), 0) / items.length);
  const status = activeItems > 0
    ? items.some((item) => item.status === 'DOWNLOADING') ? 'DOWNLOADING' : 'PENDING'
    : failedItems > 0 ? 'FAILED' : 'COMPLETED';

  await prisma.downloadJob.update({
    where: { id: downloadJobId },
    data: {
      completedItems,
      failedItems,
      downloadedSize,
      progress,
      status,
      completedAt: status === 'COMPLETED' || status === 'FAILED' ? new Date() : null,
      errorMessage: failedItems > 0 ? `${failedItems} item(s) falharam` : null,
    },
  }).catch(() => undefined);
}
