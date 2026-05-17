import { Router } from 'express';
import * as ctrl from '../controllers/media.controller';
import * as settings from '../controllers/media.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { AuthRequest } from '../middleware/auth.middleware';

const router = Router();

router.get('/:mediaId/stream', ctrl.streamMedia);
router.get('/:mediaId/thumbnail', ctrl.getThumbnail);

const settingsRouter = Router();
settingsRouter.use(requireAuth);
settingsRouter.get('/', (req, res) => settings.getSettings(req as AuthRequest, res));
settingsRouter.put('/', (req, res) => settings.updateSettings(req as AuthRequest, res));

export { router as mediaRouter, settingsRouter };
