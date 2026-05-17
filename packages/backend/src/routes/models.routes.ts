import { Router } from 'express';
import * as ctrl from '../controllers/models.controller';
import * as scrapeCtrl from '../controllers/scrape.controller';
import { requireAuth, AuthRequest } from '../middleware/auth.middleware';

const router = Router();

router.get('/', ctrl.listModels);
router.post('/sync', requireAuth, ctrl.syncModels);
router.get('/sync', ctrl.syncModels);
router.get('/:slug/avatar.svg', ctrl.getModelAvatar);
router.get('/:slug/thumbnail', ctrl.getModelThumbnail);
router.get('/:slug', ctrl.getModel);
router.get('/:slug/posts', ctrl.getModelPosts);
router.post('/:slug/refresh-page', requireAuth, ctrl.refreshModelPostsPage);
router.post('/:slug/refresh', requireAuth, ctrl.refreshModelPosts);
router.post('/:slug/refresh/stop', requireAuth, ctrl.stopRefreshModelPosts);
router.get('/:slug/refresh/status', requireAuth, ctrl.getRefreshModelPostsStatus);
router.post('/:slug/scrape', requireAuth, (req, res) => scrapeCtrl.triggerScrape(req as AuthRequest, res));
router.get('/:slug/scrape', (req, res) => scrapeCtrl.getScrapeStatus(req as AuthRequest, res));

export default router;
