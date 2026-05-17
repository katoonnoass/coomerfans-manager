import { Router } from 'express';
import authRoutes from './auth.routes';
import modelRoutes from './models.routes';
import searchRoutes from './search.routes';
import downloadRoutes from './downloads.routes';
import favoriteRoutes from './favorites.routes';
import adminRoutes from './admin.routes';
import { mediaRouter, settingsRouter } from './media.routes';
import { requireAuth, AuthRequest } from '../middleware/auth.middleware';
import * as statsCtrl from '../controllers/stats.controller';
import { prisma } from '../config/database';
import { redis } from '../config/redis';

const router = Router();

router.use('/auth', authRoutes);
router.use('/models', modelRoutes);
router.use('/search', searchRoutes);
router.use('/downloads', downloadRoutes);
router.use('/favorites', favoriteRoutes);
router.use('/admin', adminRoutes);
router.use('/media', mediaRouter);
router.use('/settings', settingsRouter);
router.get('/stats', requireAuth, (req, res) => statsCtrl.getStats(req as AuthRequest, res));

router.get('/health', async (_req, res) => {
  const checks = {
    database: false,
    redis: false,
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = true;
  } catch {
    checks.database = false;
  }

  try {
    if (redis.status === 'wait' || redis.status === 'close' || redis.status === 'end') {
      await redis.connect();
    }
    await redis.ping();
    checks.redis = true;
  } catch {
    checks.redis = false;
  }

  const ok = checks.database && checks.redis;
  res.status(ok ? 200 : 503).json({
    status: ok ? 'ok' : 'degraded',
    service: 'coomerfans-backend',
    version: process.env.npm_package_version || '0.0.1',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    checks,
  });
});

export default router;
