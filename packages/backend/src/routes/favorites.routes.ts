import { Router } from 'express';
import * as ctrl from '../controllers/favorites.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { AuthRequest } from '../middleware/auth.middleware';

const router = Router();

router.use(requireAuth);

router.get('/', (req, res) => ctrl.listFavorites(req as AuthRequest, res));
router.post('/import/coomer', (req, res) => ctrl.importCoomerFavorites(req as AuthRequest, res));
router.post('/audit/coomer', (req, res) => ctrl.auditCoomerFavorites(req as AuthRequest, res));
router.post('/:modelId', (req, res) => ctrl.addFavorite(req as AuthRequest, res));
router.patch('/:modelId/status', (req, res) => ctrl.updateFavoriteDownloadStatus(req as AuthRequest, res));
router.delete('/:modelId', (req, res) => ctrl.removeFavorite(req as AuthRequest, res));

export default router;
