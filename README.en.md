---
description: "Repository guide for the dsh-browser-use bundle and its layered browser automation packages."
kind: "repository"
---

# dsh-browser-use

English | [中文](README.md)

## Summary

`dsh-browser-use` provides browser automation for DSH. The project consists of three layers: the Hub defines browser backend contracts and a named registry, each Backend manages browser resources and executes tools, and the Domain selects a backend and publishes its tools and settings to DSH. The repository root owns workspace and bundle assembly; all runtime source lives under `packages/browser-use/`.

## Package layout

| Directory | Package | Responsibility |
|---|---|---|
| [`packages/browser-use/browser-use`](packages/browser-use/browser-use/README.en.md) | `browser-use` | `ctx.browserUse` Hub, backend contracts, registry, lifecycle service keys, and stable Hub errors |
| [`packages/browser-use/browser-use-domain`](packages/browser-use/browser-use-domain/README.en.md) | `browser-use-domain` | Selects a backend, registers DSH tools, releases per-agent resources, and owns browser settings |
| [`packages/browser-use/browser-use-chrome`](packages/browser-use/browser-use-chrome/README.en.md) | `browser-use-chrome` | Chrome backend powered by `chrome-devtools-mcp`, including discovery and per-agent contexts |
| [`packages/browser-use/browser-use-edge`](packages/browser-use/browser-use-edge/README.en.md) | `browser-use-edge` | Playwright MCP backend with isolated per-agent Edge sessions |

See the [browser-use package group map](packages/browser-use/README.en.md) for dependency direction and layer ownership.

## Architecture

The family keeps composition, semantics, and resources separate:

1. `browser-use` mounts `ctx.browserUse` and exposes a name-to-backend registry. It performs no browser IO.
2. A backend plugin injects the Hub, registers an implementation, and publishes `browserUse.backend.<name>` as a lifecycle-only Cordis service.
3. `browser-use-domain` waits for the configured lifecycle service, resolves the backend through the registry, and registers its stable tool catalog with `ctx.tools`.
4. Tool execution passes the initiating Agent object to the backend as an opaque owner, allowing independent MCP sessions and browser resources for each owner.
5. Settings changes are forwarded to the backend; agent disposal releases only that agent's resources, while plugin disposal closes the complete backend.

Cordis service availability controls activation. YAML row order is for readability and is not the synchronization mechanism.

## Bundle

The root package is `dsh-browser-use`. Its [`cordis.patch.yml`](cordis.patch.yml) mounts the Hub, both Chrome and Edge backends, and Domain, selecting Chrome initially with hot switching through settings.

| Row | Default state | Important configuration |
|---|---|---|
| `browser-use` | enabled | none |
| `browser-use-chrome` | enabled | `toolCallTimeoutMs: 120000` |
| `browser-use-domain` | enabled | backend `chrome`, visible Chrome, automatic discovery, 120-second tool timeout |
| `browser-use-edge` | enabled | Playwright MCP |

The effective DSH tool timeout is owned by the Domain configuration. Browser connection settings are also owned by the Domain and forwarded to the selected backend.

## Requirements

- Node.js `^22.19.0` or `>=24.0.0`
- pnpm `11.7.0`
- A compatible DeepSeek Harness installation
- Microsoft Edge, or Google Chrome when selecting the Chrome backend

## Development

Run all commands from the repository root:

```powershell
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm pack --dry-run
pnpm pack:bundle
```

The workspace pattern is `packages/*/*`. Tests live with their owning package, and `scripts/build.mjs` emits the four Host bundles plus the Domain client module. `pnpm pack --dry-run` only previews the regular package contents and creates no file.

See the [development guide](docs/development.en.md) for TypeScript project layout, source tests, and the build pipeline.

## Install into DSH

This repository does not provide the `dsh` executable. Plugin management requires pnpm on `PATH` plus either an installed DSH CLI or a prepared `deepseek-harness` source checkout.

### Install the source checkout

Build this repository first, then add its root directory with an installed CLI:

```powershell
pnpm build
dsh plugin --profile web add .
```

When running DSH from source, first run `pnpm install` and `pnpm run build` in the `deepseek-harness` checkout, then invoke its root `dsh` script and pass this repository as an absolute `file:` spec:

```powershell
cd C:\path\to\deepseek-harness
pnpm dsh plugin --profile web add file:C:/path/to/dsh-browser-use
```

### Install a packed bundle

Create a self-contained local-install tarball from this repository:

```powershell
pnpm install
pnpm pack:bundle
```

The command builds the workspace, stages the four runtime packages as bundled dependencies, and writes:

```text
.artifacts/pack/dsh-browser-use-0.3.0.tgz
```

Install that tarball with an installed CLI:

```powershell
dsh plugin --profile web add file:C:/path/to/dsh-browser-use/.artifacts/pack/dsh-browser-use-0.3.0.tgz
```

Or use the CLI from a `deepseek-harness` source checkout:

```powershell
pnpm --dir C:\path\to\deepseek-harness dsh plugin --profile web add file:C:/path/to/dsh-browser-use/.artifacts/pack/dsh-browser-use-0.3.0.tgz
```

Use `pnpm pack:bundle` for an unpublished local installation. A plain `pnpm pack` rewrites `workspace:^` dependencies to registry version ranges and therefore produces a root tarball that works only when the matching `browser-use`, `browser-use-domain`, `browser-use-chrome`, and `browser-use-edge` packages are available from the configured registry.

`pnpm dsh` works in the `deepseek-harness` source root because that package defines the script; it does not work in this plugin repository. Restart a running `web` profile after adding, removing, or updating a bundle.

## Known limitations

- Edge uses isolated sessions; it does not attach to everyday browser windows or persist logins across restarts.
- Browser settings hot-switch the active backend without restarting. Both provider plugins must be enabled.
- Chrome connects to `chrome-devtools-mcp@1.8.0` through standard MCP stdio; upgrades require CLI and tool protocol compatibility checks.
- Browser state is process-local and is not restored after a Host restart.
- Tests cover MCP discovery and lifecycle. Set `EDGE_SMOKE=1` to test navigation, clicking and session isolation in installed Edge.

## License

[MIT](LICENSE)
