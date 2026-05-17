# Contributing

## Development Setup

```powershell
copy .env.example .env
pnpm install
pnpm --filter @coomerfans/backend db:generate
pnpm --filter @coomerfans/worker db:generate
pnpm --filter @coomerfans/backend db:push
pnpm dev
```

## Quality Checks

Run before opening a pull request:

```bash
pnpm --filter @coomerfans/backend typecheck
pnpm --filter @coomerfans/worker typecheck
pnpm --filter @coomerfans/frontend typecheck
pnpm --filter @coomerfans/frontend build
pnpm validate
```

## Pull Requests

- Keep changes focused.
- Include screenshots for UI changes.
- Include reproduction steps for bug fixes.
- Do not commit `.env`, media, logs, generated `.ef2/.ief`, executables, or local database artifacts.

## Issues

Include:

- OS and Node version
- How services were started
- Relevant logs
- Whether Redis/PostgreSQL are running
- Steps to reproduce
