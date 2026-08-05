## Summary

<!-- What does this PR do, and why? Reference the issue it resolves, e.g. "Closes #123". -->

## Checklist

- [ ] Branched from `develop`
- [ ] PR targets `develop`
- [ ] Linked issue
- [ ] `npm run lint` passes
- [ ] `npm run test:coverage` passes
- [ ] `npm run build` passes
- [ ] `supabase db reset` produces a clean, lint-free database (if migrations changed)
- [ ] `npm run test:integration` passes (if schema/RLS/RPC changed)
- [ ] `npm run test:e2e` passes (if UI flows changed)

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor
- [ ] Documentation
- [ ] Dependency / build tooling

## Scope of impact

<!-- Tick anything this PR touches. If you check a backend area, migrations and integration tests are expected. -->

- [ ] Frontend UI
- [ ] Schema / RLS / migrations
- [ ] Realtime contracts
- [ ] Storage / signed URLs
- [ ] Notifications
- [ ] Governance / votes
- [ ] Matching
- [ ] Tests only

## Migration notes

<!-- If this PR adds a migration, describe it in one or two lines, and confirm you did not edit an applied migration. Note that migrations are only applied to staging when this PR merges to develop. -->

## Screenshots

<!-- If applicable, add screenshots for UI changes. -->

## Additional context

<!-- Anything else reviewers should know. -->
