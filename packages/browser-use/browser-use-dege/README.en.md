---
description: "Status and maintainer reference for the disabled browser-use-dege placeholder backend."
kind: "package-reference"
---

# browser-use-dege

English | [中文](README.zh.md)

## Summary

`browser-use-dege` reserves a separate package and backend identity for a future Microsoft Edge implementation. It currently registers backend `dege` and lifecycle service `browserUse.backend.dege`, but exposes an empty tool catalog, allocates no browser resources, ignores settings, and rejects direct execution. The shipped `dsh-browser-use` bundle keeps it disabled.

The `dege` spelling is the current package and backend identity and is intentionally preserved for compatibility. This package must not be treated as a working Edge integration.

## Current behavior

| Contract member | Current implementation |
|---|---|
| `browserType` | `dege` |
| `tools()` | Returns an empty array |
| `execute()` | Rejects with a placeholder error |
| `release()` | No-op |
| `reconfigure()` | Resolved no-op |
| `close()` | Resolved no-op |
| Registry identity | `dege` |
| Lifecycle service | `browserUse.backend.dege` |

If this backend is manually enabled and selected by `browser-use-domain`, the Domain activates successfully but registers no browser tools because the catalog is empty.

## Bundle status

The root patch declares the package but disables its row:

```yaml
- id: browser-use-dege
  name: browser-use-dege
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

- [Package group map](../README.md)
- [Hub backend contract](../browser-use/README.md)
- [Domain reference](../browser-use-domain/README.md)
- [Working Chrome backend](../browser-use-chrome/README.md)
- [Repository guide](../../../README.md)
