# Repository Guidelines

`dsh-browser-use` is a Cordis plugin bundle. Read the [package map](packages/browser-use/README.en.md) before runtime changes and the [development guide](docs/development.en.md) for detailed workflows.

## Repository layout

```text
packages/browser-use/
  browser-use/          Hub contracts and registry
  browser-use-domain/   DSH tools/settings; UI in src/client/
  browser-use-chrome/   Chrome via chrome-devtools-mcp
  browser-use-edge/     Edge via Playwright MCP
scripts/                Build, packaging, and smoke checks
docs/                   Bilingual guides; demos in assets/
cordis.patch.yml        Bundle composition
```

Each package owns `src/` and `tests/`; client tests belong in `tests/client/`. `lib/`, `.cache/`, and `.artifacts/` are generated.

## Commands

Use Node.js `^22.19.0 || >=24.0.0` and pnpm `11.7.0`; run from the repository root:

```sh
pnpm install --frozen-lockfile  # install dependencies
pnpm clean                      # remove build outputs
pnpm dev                        # watch compilation and bundles
pnpm typecheck                  # check Host/Client projects
pnpm test                       # Vitest source tests
pnpm build                      # compile and bundle
pnpm pack:bundle                # create .artifacts/pack/*.tgz
pnpm verify:bundle              # verify a fresh bundle installation
```

Launch DSH separately through its CLI or the `deepseek-harness` checkout. Never run clean/build alongside watch.

### Run relevant checks locally

Add behavior regressions as `tests/*.spec.ts`; no coverage threshold is configured. Enable installed-browser tests with `EDGE_SMOKE=1`, `CHROME_SMOKE=1`, `BROWSER_SWITCH_SMOKE=1`, or `BROWSER_LIFECYCLE_SMOKE=1`. Follow the development guide for packaging, watch, and Windows picker checks.

## Secrets / .env

Never commit credentials, `.env`, or browser profile data. Configure browser paths and isolation through Domain settings.

## Conventions

- Use ESM, two-space indentation, single quotes, and no statement semicolons. No formatter/linter is configured.
- Use camelCase functions/variables, PascalCase types/components, and kebab-case filenames.
- Import package names across packages and `.ts` paths locally.
- Keep browser I/O outside the Hub and concrete backend imports outside the Domain. Register Cordis contributions through effects with disposers.
- Backend packages must not import or depend on each other.

## Defensive patterns

Backends own browser resources. Keep `release(owner)` idempotent and owner-scoped; `close()` must finish teardown. Cancellation settles after active browser work stops.

## Type safety and documentation

Preserve strict checks and separate Host/Client projects. Validate Remote JSON; keep in-process calls typed. Update affected bilingual READMEs and exported API JSDoc.

## Commit and pull requests

Use focused Chinese or English summaries; history occasionally uses `fix:` and `version:`. Describe behavior changes, link relevant issues, include UI screenshots, and report actual checks/platform/skips. End files with one newline; run `git diff --check`.

## Editing these instructions

Keep rules self-contained, link detailed workflows to their owning documents, and verify commands against `package.json`.
