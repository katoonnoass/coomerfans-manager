import Redis from 'ioredis';
import { env } from './env';

let redisInstance: Redis | null = null;

function createRedis(): Redis {
  const r = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    connectTimeout: 10000,
    commandTimeout: 60000,
    lazyConnect: true,
    retryStrategy(times) {
      if (times > 3) return null;
      return Math.min(times * 500, 3000);
    },
  });

  r.on('error', () => {
    // Silently ignore Redis errors — Redis is optional for core functionality
  });

  return r;
}

export const redis: Redis = (globalThis as any).__redis || createRedis();

if (env.NODE_ENV !== 'production') {
  (globalThis as any).__redis = redis;
}
