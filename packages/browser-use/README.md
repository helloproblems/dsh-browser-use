---
description: "Package-group map for the browser-use Hub, Domain, and replaceable browser backends."
kind: "package-group"
---

# packages/browser-use

English | [中文](README.zh.md)

## Summary

The browser-use package group gives a DSH composition model-callable browser automation without coupling tool registration to one browser implementation. The Hub owns shared contracts and registration, the Domain owns DSH-facing semantics and settings, and each backend owns its browser connection and owner-scoped contexts. Mount the group when Agents need to inspect or operate a browser; omit it when a composition needs no browser tools.

## Packages

| Package | Layer | Runtime contribution |
|---|---|---|
| [`browser-use`](browser-use/README.md) | Hub | Provides `ctx.browserUse`, backend contracts, and the named registry |
| [`browser-use-domain`](browser-use-domain/README.md) | Domain | Publishes `mcp__<browser>__*` tools and the browser automation settings section |
| [`browser-use-chrome`](browser-use-chrome/README.md) | Backend | Registers backend `chrome` and lifecycle service `browserUse.backend.chrome` |
| [`browser-use-dege`](browser-use-dege/README.md) | Backend placeholder | Registers backend `dege`; disabled in the shipped bundle and exposes no tools |

## Dependency direction

```text
browser-use-chrome ─┐
browser-use-dege   ─┼─ register implementations ─> browser-use Hub
browser-use-domain ─┘  resolve selected backend  ─> DSH tools/settings
```

All three leaf packages depend on the Hub contract. Backends do not depend on the Domain, and the Domain does not import a concrete backend. This keeps browser resource ownership replaceable while preserving one DSH-facing tool layer.

## Layer ownership

- **Hub owns contracts and identity.** It defines `BrowserUseBackend`, the backend registry, Hub error codes, and lifecycle service-key derivation. It performs no browser IO and registers no model tools.
- **Domain owns product semantics.** It chooses the configured backend, converts the backend catalog into DSH tool definitions, requires an initiating Agent, manages tool-call timeout, and forwards browser settings.
- **Backend owns resources.** It opens or connects to a browser, creates owner-scoped runtime state, executes tools, and tears down resources on release, reconfiguration, or close.
- **Bundle owns composition.** The repository root patch decides which Hub, Domain, and backend packages are enabled and supplies their initial configuration.

## Activation flow

1. The Hub mounts `ctx.browserUse`.
2. An enabled backend injects the Hub, registers under its configured identity, and provides `browserUse.backend.<name>`.
3. The Domain derives that lifecycle key from its `backend` field and waits for it through `ctx.inject`.
4. Once active, the Domain resolves the same backend by name and registers its tool catalog.
5. `agent/disposed` releases owner-scoped backend state; plugin disposal unregisters and closes the backend.

This service-driven activation prevents registration races without making YAML row order load-bearing.

## Composition example

```yaml
- name: browser-use
- name: browser-use-chrome
- name: browser-use-domain
  config:
    backend: chrome
    headless: false
    browserType: chrome
    browserUrl: ''
    autoDiscover: true
    toolCallTimeoutMs: 120000
```

## Documentation map

- [Repository guide](../../README.md) for installation, workspace commands, and the shipped bundle.
- [Hub reference](browser-use/README.md) for the backend contract and registry errors.
- [Domain reference](browser-use-domain/README.md) for tool naming, settings, and lifecycle behavior.
- [Chrome backend reference](browser-use-chrome/README.md) for discovery and browser ownership.
- [Dege placeholder reference](browser-use-dege/README.md) for its intentionally non-functional status.

## Development

Run validation from the repository root so path aliases, Host bundles, and the Domain client module are checked together:

```powershell
pnpm typecheck
pnpm test
pnpm build
```
