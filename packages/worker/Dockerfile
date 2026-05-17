FROM node:20-bookworm-slim

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/worker/package.json packages/worker/package.json
RUN pnpm install --frozen-lockfile --filter @coomerfans/worker...

COPY packages/shared packages/shared
COPY packages/worker packages/worker

WORKDIR /app/packages/worker
RUN pnpm db:generate

CMD ["pnpm", "start"]
