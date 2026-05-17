import { Response } from 'express';
import { prisma } from '../config/database';
import { AuthRequest, GUEST_USER_ID } from '../middleware/auth.middleware';

export async function getStats(req: AuthRequest, res: Response) {
  const uid = req.userId || GUEST_USER_ID;
  const [
    totalModels,
    totalMedia,
    totalDownloads,
    activeDownloads,
    completedDownloads,
    favoriteCount,
    recentDownloads,
    topModels,
  ] = await Promise.all([
    prisma.model.count({ where: { isActive: true } }),
    prisma.media.count(),
    prisma.downloadJob.count({ where: { userId: uid } }),
    prisma.downloadJob.count({ where: { userId: uid, status: { in: ['PENDING', 'DOWNLOADING'] } } }),
    prisma.downloadJob.count({ where: { userId: uid, status: 'COMPLETED' } }),
    prisma.favorite.count({ where: { userId: uid } }),
    prisma.downloadJob.findMany({
      where: { userId: uid },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        modelName: true,
        status: true,
        progress: true,
        totalItems: true,
        completedItems: true,
        createdAt: true,
      },
    }),
    prisma.model.findMany({
      where: { downloads: { some: { userId: uid } } },
      orderBy: { postCount: 'desc' },
      take: 5,
      select: {
        id: true,
        name: true,
        slug: true,
        postCount: true,
        mediaCount: true,
        thumbnailUrl: true,
      },
    }),
  ]);

  const user = await prisma.user.findUnique({
    where: { id: uid },
    select: { storageUsed: true, storageLimit: true },
  });

  res.json({
    totals: {
      models: totalModels,
      media: totalMedia,
      downloads: totalDownloads,
      activeDownloads,
      completedDownloads,
      favorites: favoriteCount,
      storageUsed: user ? Number(user.storageUsed) : 0,
      storageLimit: user ? Number(user.storageLimit) : 0,
    },
    recentDownloads: recentDownloads.map((d) => ({
      ...d,
      createdAt: d.createdAt.toISOString(),
    })),
    topModels,
  });
}
