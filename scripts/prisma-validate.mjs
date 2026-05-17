import { spawnSync } from 'node:child_process';

const env = {
  ...process.env,
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/coomerfans?schema=public',
};

const checks = [
  ['@coomerfans/backend', 'src/prisma/schema.prisma'],
  ['@coomerfans/worker', 'prisma/schema.prisma'],
];

for (const [filter, schema] of checks) {
  const result = spawnSync(
    'pnpm',
    ['--filter', filter, 'exec', 'prisma', 'validate', '--schema', schema],
    { stdio: 'inherit', shell: true, env }
  );
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) process.exit(result.status || 1);
}
