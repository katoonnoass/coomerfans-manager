import { Router } from 'express';
import * as ctrl from '../controllers/search.controller';
import { rateLimiter } from '../middleware/rate-limiter.middleware';

const router = Router();

router.get('/', rateLimiter('search'), ctrl.search);

export default router;
