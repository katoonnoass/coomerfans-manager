# Release Checklist

## Before Publishing

- [ ] Remove local `.env` files from staged changes.
- [ ] Remove generated media, logs, IDM queue files, and executables.
- [ ] Run `pnpm install --frozen-lockfile`.
- [ ] Run backend Prisma generate and validate.
- [ ] Run worker Prisma generate and validate.
- [ ] Run backend, worker, and frontend typechecks.
- [ ] Run frontend build.
- [ ] Test startup from a clean clone.
- [ ] Test Docker Compose startup.
- [ ] Confirm README commands are current.
- [ ] Confirm screenshots do not expose private content.
- [ ] Create release tag.

## Commands

```bash
pnpm --filter @coomerfans/backend db:generate
pnpm --filter @coomerfans/worker db:generate
pnpm validate
pnpm --filter @coomerfans/backend typecheck
pnpm --filter @coomerfans/worker typecheck
pnpm --filter @coomerfans/frontend typecheck
pnpm --filter @coomerfans/frontend build
```
