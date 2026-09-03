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
```

The workspace pattern is `packages/*/*`. Tests live with their owning package, and `scripts/build.mjs` emits the four Host bundles plus the Domain client module.

## Install into DSH

After building, add the repository root as the bundle package:

```powershell
pnpm dsh plugin --profile web add .
```

The root package contains only the bundle entry and patch; the four runtime packages are installed through its workspace dependencies.

## Known limitations

- Chrome is the only working backend. `browser-use-dege` registers an empty placeholder and is disabled by default.
- The shared settings contract currently fixes `browserType` to `chrome`.
- The Chrome implementation imports pinned internal modules from `chrome-devtools-mcp@1.8.0`; upgrading that dependency requires compatibility verification.
- Browser state is process-local and is not restored after a Host restart.
- The current test suite covers the Hub registry, Chrome discovery, and schema conversion, but does not launch a real browser in CI.

## License

[MIT](LICENSE)
