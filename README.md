---
description: "Repository guide for the dsh-browser-use bundle and its layered browser automation packages."
kind: "repository"
---

# dsh-browser-use

English | [中文](README.zh.md)

## Summary

`dsh-browser-use` adds browser automation to DeepSeek Harness through a layered Hub, Domain, and Backend design modeled after the harness storage subsystem. The Hub defines contracts and a named backend registry, backend packages own browser resources, and the Domain selects one backend and publishes its tools to DSH. The repository root is only the workspace and bundle assembly; all runtime source lives under `packages/browser-use/`.

## Package layout

| Directory | Package | Responsibility |
|---|---|---|
| [`packages/browser-use/browser-use`](packages/browser-use/browser-use/README.md) | `browser-use` | `ctx.browserUse` Hub, backend contracts, registry, lifecycle service keys, and stable Hub errors |
| [`packages/browser-use/browser-use-domain`](packages/browser-use/browser-use-domain/README.md) | `browser-use-domain` | Selects a backend, registers DSH tools, releases per-agent resources, and owns browser settings |
| [`packages/browser-use/browser-use-chrome`](packages/browser-use/browser-use-chrome/README.md) | `browser-use-chrome` | Chrome backend powered by `chrome-devtools-mcp`, including discovery and per-agent contexts |
| [`packages/browser-use/browser-use-dege`](packages/browser-use/browser-use-dege/README.md) | `browser-use-dege` | Disabled placeholder for a future Edge backend; it is not a working browser implementation |

See the [browser-use package group map](packages/browser-use/README.md) for dependency direction and layer ownership.

## Architecture

The family keeps composition, semantics, and resources separate:

1. `browser-use` mounts `ctx.browserUse` and exposes a name-to-backend registry. It performs no browser IO.
2. A backend plugin injects the Hub, registers an implementation, and publishes `browserUse.backend.<name>` as a lifecycle-only Cordis service.
3. `browser-use-domain` waits for the configured lifecycle service, resolves the backend through the registry, and registers its stable tool catalog with `ctx.tools`.
4. Tool execution passes the initiating Agent object to the backend as an opaque owner, allowing one shared browser connection with isolated owner contexts.
5. Settings changes are forwarded to the backend; agent disposal releases only that agent's resources, while plugin disposal closes the complete backend.

Cordis service availability controls activation. YAML row order is for readability and is not the synchronization mechanism.

## Bundle

The root package is `dsh-browser-use`. Its [`cordis.patch.yml`](cordis.patch.yml) mounts the Hub, Chrome backend, and Domain, while leaving the future Dege backend disabled.

| Row | Default state | Important configuration |
|---|---|---|
| `browser-use` | enabled | none |
| `browser-use-chrome` | enabled | `toolCallTimeoutMs: 120000` |
| `browser-use-domain` | enabled | backend `chrome`, visible Chrome, automatic discovery, 120-second tool timeout |
| `browser-use-dege` | disabled | placeholder only |

The effective DSH tool timeout is owned by the Domain configuration. Browser connection settings are also owned by the Domain and forwarded to the selected backend.

## Requirements

- Node.js `^22.19.0` or `>=24.0.0`
- pnpm `11.7.0`
- A compatible DeepSeek Harness installation
- Google Chrome, or a reachable Chrome remote-debugging endpoint

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

Use `pnpm pack:bundle` for an unpublished local installation. A plain `pnpm pack` rewrites `workspace:^` dependencies to registry version ranges and therefore produces a root tarball that works only when the matching `browser-use`, `browser-use-domain`, `browser-use-chrome`, and `browser-use-dege` packages are available from the configured registry.

`pnpm dsh` works in the `deepseek-harness` source root because that package defines the script; it does not work in this plugin repository. Restart a running `web` profile after adding, removing, or updating a bundle.

## Known limitations

- Chrome is the only working backend. `browser-use-dege` registers an empty placeholder and is disabled by default.
- The shared settings contract currently fixes `browserType` to `chrome`.
- The Chrome implementation imports pinned internal modules from `chrome-devtools-mcp@1.8.0`; upgrading that dependency requires compatibility verification.
- Browser state is process-local and is not restored after a Host restart.
- The current test suite covers the Hub registry, Chrome discovery, and schema conversion, but does not launch a real browser in CI.

## License

[MIT](LICENSE)
