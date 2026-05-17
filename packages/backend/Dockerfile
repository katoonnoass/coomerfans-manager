FROM node:20-bookworm-slim

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/backend/package.json packages/backend/package.json
RUN pnpm install --frozen-lockfile --filter @coomerfans/backend...

COPY packages/shared packages/shared
COPY packages/backend packages/backend

WORKDIR /app/packages/backend
RUN pnpm db:generate

EXPOSE 3001
CMD ["sh", "-c", "pnpm db:push && pnpm start"]
