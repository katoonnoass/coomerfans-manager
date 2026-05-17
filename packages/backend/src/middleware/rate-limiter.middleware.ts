import { Request, Response, NextFunction } from 'express';
import { redis } from '../config/redis';

interface RateLimitConfig {
  windowMs: number;
  max: number;
  keyPrefix: string;
}

const defaults: Record<string, RateLimitConfig> = {
  auth: { windowMs: 60_000, max: 10, keyPrefix: 'rl:auth' },
  api: { windowMs: 60_000, max: 100, keyPrefix: 'rl:api' },
  download: { windowMs: 60_000, max: 20, keyPrefix: 'rl:dl' },
  search: { windowMs: 60_000, max: 60, keyPrefix: 'rl:search' },
};

export function rateLimiter(type: keyof typeof defaults = 'api') {
  const config = defaults[type];

  return async (req: Request, res: Response, next: NextFunction) => {
    const key = `${config.keyPrefix}:${req.ip || 'unknown'}`;
    const now = Date.now();
    const windowStart = now - config.windowMs;

    try {
      const multi = redis.multi();
      multi.zremrangebyscore(key, 0, windowStart);
      multi.zadd(key, now, `${now}-${Math.random()}`);
      multi.zcard(key);
      multi.pexpire(key, config.windowMs);

      const results = await multi.exec();
      const count = (results?.[2]?.[1] as number) || 0;

      res.setHeader('X-RateLimit-Limit', config.max);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, config.max - count));

      if (count > config.max) {
        res.status(429).json({
          error: 'Too many requests',
          retryAfter: Math.ceil(config.windowMs / 1000),
        });
        return;
      }

      next();
    } catch {
      // Redis unavailable — allow request through
      next();
    }
  };
}
