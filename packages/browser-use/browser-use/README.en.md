---
description: "browser-use Hub reference for compositions and backend implementers using ctx.browserUse and the named backend registry."
kind: "package-reference"
---

# browser-use

[中文](README.md) | English

## Summary

`browser-use` is the browser automation Hub. It mounts `ctx.browserUse`, defines the backend-facing TypeScript contract, keeps a named backend registry, derives lifecycle-only Cordis service keys, and exposes stable Hub error codes. It owns no browser process, page, model tool, settings document, or Agent state; concrete backends and the Domain layer own those responsibilities.

## Use this package

Mount the Hub before any browser-use backend or Domain package:

```yaml
- name: browser-use
- name: browser-use-chrome
- name: browser-use-domain
  config:
    backend: chrome
```

The Hub alone has no model-visible behavior. A backend registers an implementation, and the Domain turns that implementation's catalog into DSH tools.

## Public API

| Export | Purpose |
|---|---|
| `BrowserUse` | Cordis `Service` mounted as `ctx.browserUse` |
| `BackendRegistry` | Mutable name-to-`BrowserUseBackend` registry |
| `BrowserUseBackendRegistry` | Deprecated compatibility alias of `BackendRegistry` |
| `BrowserUseBackend` | Backend lifecycle and execution contract |
| `BrowserUseSettings` | Settings snapshot forwarded by the Domain |
| `BrowserUseTool` | Backend-local tool metadata and JSON Schema |
| `BrowserUseResult` | JSON-safe MCP-style tool result |
| `BrowserUseError` | Hub error with a stable `code` discriminant |
| `browserUseBackendServiceKey(name)` | Returns `browserUse.backend.<name>` for activation synchronization |

### Registry behavior

```ts
const unregister = ctx.browserUse.backend.register('custom', backend)
const selected = ctx.browserUse.backend.get('custom')
const names = ctx.browserUse.backend.names()
unregister()
```

`register()` returns a disposer that removes only its own registration. It deliberately does not close the backend; the provider plugin owns closure and should unregister before calling `backend.close()`. A stale disposer cannot remove a later registration that reused the same name.

### Stable Hub errors

| Code | Meaning | Recovery |
|---|---|---|
| `duplicate-backend` | The name is already registered | Fix the composition so only one provider owns that name |
| `backend-not-found` | No backend is registered under the requested name | Mount the provider and inject its lifecycle service before resolving it |

Consumers may switch on `BrowserUseError.code`. Error messages are diagnostic text and are not a stable parsing surface.

## Backend contract

A backend implementation must provide:

- A stable `browserType` namespace used in published tool names.
- A stable tool catalog from `tools()`; the Domain reads it once during activation.
- `execute(owner, toolName, args)`, returning losslessly JSON-serializable output.
- Idempotent `release(owner)` that removes only that owner's state.
- `reconfigure(settings)`, which applies the latest settings snapshot and may recycle shared resources.
- Idempotent asynchronous `close()`, resolving after all backend resources are released.

The `owner` object is opaque. Backends may use object identity as a key but must not serialize or retain unrelated Agent internals.

### Provider pattern

```ts
export const inject = ['browserUse']

export function apply(ctx: Context): void {
  const backend = createBackend()
  ctx.effect(() => {
    const unregister = ctx.browserUse.backend.register('custom', backend)
    return async () => {
      unregister()
      await backend.close()
    }
  })
  ctx.provide(browserUseBackendServiceKey('custom'), backend)
}
```

Publishing the lifecycle service lets the Domain wait for registration without treating the service value as the business API; runtime lookup still goes through the Hub registry.

## Implementation map

| File | Responsibility |
|---|---|
| [`src/index.ts`](src/index.ts) | `BrowserUse` service, public exports, and lifecycle-key derivation |
| [`src/backend.ts`](src/backend.ts) | Normative backend, settings, tool, and result contracts |
| [`src/registry.ts`](src/registry.ts) | `BackendRegistry` and stale-disposer protection |
| [`src/error.ts`](src/error.ts) | `BrowserUseError` and stable Hub error codes |
| [`tests/registry.spec.ts`](tests/registry.spec.ts) | Registry, errors, compatibility alias, and Cordis mounting tests |

## Model experience

The Hub registers no tools and injects no prompts, so it contributes zero direct request tokens. Model-visible behavior starts only when `browser-use-domain` registers a backend's catalog.

## Known limitations

- The Hub validates duplicate and missing registrations but does not validate backend names or compare a registry name with `backend.browserType`.
- Tool catalogs are assumed stable for one Domain activation; dynamic catalog mutation is unsupported.
- Edge uses Playwright MCP. Enable both backend plugins to switch browsers through settings without restarting.
- Unregistering never closes a backend. Provider plugins must implement the lifecycle pattern above.

## Related documentation

- [Package group map](../README.en.md)
- [Domain reference](../browser-use-domain/README.en.md)
- [Chrome backend reference](../browser-use-chrome/README.en.md)
- [Repository guide](../../../README.en.md)
