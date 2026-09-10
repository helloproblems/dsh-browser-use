---
description: "Status and maintainer reference for the disabled browser-use-edge placeholder backend."
kind: "package-reference"
---

# browser-use-edge

English | [中文](README.md)

## Summary

`browser-use-edge` reserves a separate package and backend identity for a future Microsoft Edge implementation. It currently registers backend `edge` and lifecycle service `browserUse.backend.edge`, but exposes an empty tool catalog, allocates no browser resources, ignores settings, and rejects direct execution. The shipped `dsh-browser-use` bundle keeps it disabled.

This package must not be treated as a working Edge integration.

## Current behavior

| Contract member | Current implementation |
|---|---|
| `browserType` | `edge` |
| `tools()` | Returns an empty array |
| `execute()` | Rejects with a placeholder error |
| `release()` | No-op |
| `reconfigure()` | Resolved no-op |
| `close()` | Resolved no-op |
| Registry identity | `edge` |
| Lifecycle service | `browserUse.backend.edge` |

If this backend is manually enabled and selected by `browser-use-domain`, the Domain activates successfully but registers no browser tools because the catalog is empty.

## Bundle status

The root patch declares the package but disables its row:

```yaml
- id: browser-use-edge
  name: browser-use-edge
  disabled: true
```

Keep it disabled in user compositions until it owns a real Edge connection, tool catalog, owner contexts, and cleanup behavior.

## Intended implementation boundary

A future implementation should stay within the existing backend contract:

1. Build a stable Edge-compatible tool catalog.
2. Connect to or launch Edge without adding browser IO to the Hub or Domain.
3. Isolate runtime state by opaque owner object.
4. Release one owner's state through `release(owner)`.
5. Apply Domain settings through `reconfigure(settings)`.
6. Unregister before closing all resources during plugin disposal.

If Edge requires settings that cannot be represented by the current Chrome-shaped `BrowserUseSettings`, evolve the shared Hub contract and Domain settings schema explicitly rather than adding hidden backend-only behavior.

## Implementation map

| File | Responsibility |
|---|---|
| [`src/index.ts`](src/index.ts) | Placeholder backend class, Hub registration, and lifecycle service publication |

## Model experience

None in the shipped bundle because the package is disabled. Even when manually enabled and selected, its empty catalog causes the Domain to register no tools and inject no prompt text.

## Known limitations

- No Edge process is launched or connected.
- No browser tools are available.
- Direct execution always rejects.
- Settings and owner lifecycle calls are no-ops.
- There are no package-specific tests yet.

## Related documentation

- [Package group map](../README.en.md)
- [Hub backend contract](../browser-use/README.en.md)
- [Domain reference](../browser-use-domain/README.en.md)
- [Working Chrome backend](../browser-use-chrome/README.en.md)
- [Repository guide](../../../README.en.md)
