import { z } from 'zod';

const isDev = process.env.NODE_ENV !== 'production';

const envSchema = z.object({
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/coomerfans?schema=public'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_ACCESS_SECRET: isDev
    ? z.string().default('dev-access-secret-change-me-in-production-32chars')
    : z.string().min(32),
  JWT_REFRESH_SECRET: isDev
    ? z.string().default('dev-refresh-secret-change-me-in-production-32chars!!')
    : z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  PORT: z.coerce.number().default(3001),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  STORAGE_PATH: z.string().default('./storage'),
  MEDIA_PATH: z.string().default('./media'),
  SCRAPER_DELAY_MS: z.coerce.number().default(2000),
  SCRAPER_MAX_CONCURRENT: z.coerce.number().default(3),
  SCRAPER_USER_AGENT: z.string().default('Mozilla/5.0'),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid environment variables:', result.error.format());
    process.exit(1);
  }
  return result.data;
}

export const env = loadEnv();
