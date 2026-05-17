import { Router } from 'express';
import * as ctrl from '../controllers/downloads.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { createDownloadSchema } from '@coomerfans/shared';
import { AuthRequest } from '../middleware/auth.middleware';

const router = Router();

router.get('/idm-proxy/:downloadMediaId', (req, res) => ctrl.proxyIdmDownload(req, res));

router.use(requireAuth);

router.get('/', (req, res) => ctrl.listDownloads(req as AuthRequest, res));
router.post('/', validate(createDownloadSchema), (req, res) => ctrl.createDownload(req as AuthRequest, res));
router.post('/model/:modelId', (req, res) => ctrl.createModelDownload(req as AuthRequest, res));
router.delete('/history', (req, res) => ctrl.clearDownloadHistory(req as AuthRequest, res));
router.post('/retry-failed', (req, res) => ctrl.retryAllFailedDownloads(req as AuthRequest, res));
router.post('/:id/pause', (req, res) => ctrl.pauseDownload(req as AuthRequest, res));
router.post('/:id/resume', (req, res) => ctrl.resumeDownload(req as AuthRequest, res));
router.post('/:id/cancel', (req, res) => ctrl.cancelDownload(req as AuthRequest, res));
router.post('/:id/retry', (req, res) => ctrl.retryDownload(req as AuthRequest, res));

export default router;
