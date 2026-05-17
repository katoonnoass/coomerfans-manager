import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.middleware';
import * as ctrl from '../controllers/admin.controller';

const router = Router();

router.use(requireAuth);
router.get('/health', (req, res) => ctrl.health(req as AuthRequest, res));
router.post('/recalculate-counters', (req, res) => ctrl.recalculateCounters(req as AuthRequest, res));
router.post('/dedupe-media', (req, res) => ctrl.dedupeMedia(req as AuthRequest, res));
router.post('/requeue-downloads', (req, res) => ctrl.requeueDownloads(req as AuthRequest, res));
router.post('/cleanup-partials', (req, res) => ctrl.cleanupPartials(req as AuthRequest, res));
router.get('/idm-import-files', (req, res) => ctrl.idmImportFiles(req as AuthRequest, res));

export default router;
