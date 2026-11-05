# Contributing

## Workflow

1. Create a focused branch from `main`.
2. Keep changes small and explain the reasoning.
3. Add or update tests.
4. Run lint, typecheck, tests, and build locally.
5. Open a pull request using the repository template.
6. Resolve CI failures and review comments before merging.

## Commit messages

Use Conventional Commits, for example:

- `feat: add authenticated library source adapter`
- `fix: reject malformed Steam AppIDs`
- `test: cover duplicate application records`
- `docs: record Steam endpoint investigation`
- `chore: configure Firefox extension CI`

## Pull requests

- Explain the user-visible or architectural change.
- Link related issues.
- Include test evidence.
- Call out security, privacy, permission, and data-completeness implications.
- Do not include Steam account identifiers, cookies, session IDs, or private library data in logs, screenshots, fixtures, or PR descriptions.
