import { Router } from 'express';
import * as auth from '../controllers/auth.controller';
import { validate } from '../middleware/validate.middleware';
import { loginSchema, registerSchema } from '@coomerfans/shared';
import { requireAuth } from '../middleware/auth.middleware';
import { AuthRequest } from '../middleware/auth.middleware';
import { rateLimiter } from '../middleware/rate-limiter.middleware';

const router = Router();

router.post('/register', rateLimiter('auth'), validate(registerSchema), auth.register);
router.post('/login', rateLimiter('auth'), validate(loginSchema), auth.login);
router.post('/refresh', rateLimiter('auth'), auth.refresh);
router.post('/logout', requireAuth, auth.logout);
router.get('/me', requireAuth, (req, res) => auth.me(req as AuthRequest, res));

export default router;
