---
description: "Chrome backend reference for discovery, connection ownership, per-Agent contexts, and chrome-devtools-mcp tool execution."
kind: "package-reference"
---

# browser-use-chrome

English | [中文](README.zh.md)

## Summary

`browser-use-chrome` is the working backend for the browser-use family. It registers backend `chrome`, publishes lifecycle service `browserUse.backend.chrome`, builds a tool catalog from `chrome-devtools-mcp@1.8.0`, and executes those tools through one process-shared Chrome connection with one `McpContext` per opaque owner. It can connect to an existing remote-debugging endpoint, discover a local debug-enabled Chrome, or launch stable Chrome itself.

The package owns browser resources only. `browser-use-domain` owns DSH tool registration, tool timeout, settings, and Agent lifecycle.

## Use this package

Mount it between the Hub and Domain in a composition:

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

A remote browser must expose the Chrome DevTools HTTP endpoint, including `/json/version` and a `webSocketDebuggerUrl`. When no usable endpoint is selected, the backend asks `chrome-devtools-mcp` to launch stable Chrome.

## Configuration ownership

Browser connection fields are defined by `browser-use-domain` and forwarded through `BrowserUseSettings`:

| Domain field | Effect in this backend |
|---|---|
| `headless` | Passed to Chrome only when this backend launches it |
| `browserUrl` | Remote-debugging HTTP endpoint to discover or connect to |
| `autoDiscover` | Enables endpoint validation, active-port lookup, and local port scanning |
| `browserType` | Currently fixed to `chrome` |

The backend package schema also accepts `toolCallTimeoutMs` with default `120000`. This field is currently retained for composition compatibility but is not read by `ChromeBrowserUseBackend`; the effective registered tool timeout is `browser-use-domain.config.toolCallTimeoutMs`.

## Browser selection

When opening the shared browser connection, the backend follows these rules:

| Settings | Behavior |
|---|---|
| `autoDiscover: true`, reachable `browserUrl` | Validate and connect to the configured endpoint |
| `autoDiscover: true`, configured URL unavailable | Continue with active-port files, then local ports |
| `autoDiscover: true`, no discovered endpoint | Launch stable Chrome |
| `autoDiscover: false`, non-empty `browserUrl` | Connect directly without discovery preflight |
| `autoDiscover: false`, empty `browserUrl` | Launch stable Chrome |

### Discovery order

`discoverBrowser()` checks candidates in strict order:

1. The configured URL, normalized by removing one trailing slash.
2. Chrome `DevToolsActivePort` files.
3. `http://127.0.0.1:9222` through `:9229`.

Each candidate must answer `<url>/json/version` within 350 ms and return a string `webSocketDebuggerUrl`.

Active-port locations currently cover:

- Windows: Chrome Stable, Beta, Dev, and Canary under `%LOCALAPPDATA%`.
- macOS: Google Chrome under `~/Library/Application Support`.
- Linux: `~/.config/google-chrome/DevToolsActivePort`.

## Resource lifecycle

- **Shared connection:** `browserPromise` ensures concurrent first calls share one connect or launch operation.
- **Owner isolation:** the backend maps each owner object to one pending or ready `McpContext`.
- **Workspace root:** when the owner carries `session.header.cwd`, that directory is exposed to the context as root `workspace` through a file URL.
- **Initial page:** every new owner context opens a page named `browser-use-<owner-id>`.
- **Release:** `release(owner)` removes the owner entry and disposes its context without closing other owners.
- **Reconfigure:** replaces the settings supplier, disposes all owner contexts, clears the connection promise, and calls upstream `closeBrowser()`.
- **Close:** marks the backend disposed and performs the same complete reset; repeated close calls are harmless.

A failed owner-context creation removes its cached promise so a later tool call can retry.

## Tool catalog and execution

The constructor obtains the upstream tool list through `createTools()`, keeps only handlers whose `shouldRegister` flag is true, and converts each registered Zod input schema to JSON Schema. The catalog is stable for the backend instance and is consumed once by the Domain.

Execution reuses one `ToolHandler` per owner and tool. The upstream result's `content` array and optional `structuredContent` are returned unchanged at the shared contract boundary. An upstream `isError` result becomes a rejected `Error`, using textual content when available.

Important upstream options disable usage statistics and experimental categories, disallow unrestricted paths, isolate page handling, and redact network headers before exposure.

## Schema conversion

[`src/json-schema.ts`](src/json-schema.ts) supports the Zod shapes currently used by `chrome-devtools-mcp`: strings, numbers, booleans, literals, enums, arrays, optional/default/effect wrappers, unions, records, and objects. Unknown shapes fall back to `{}`, and object schemas allow additional properties.

## Failures and recovery

- **Disposed backend:** further execution rejects; reactivate the backend plugin rather than reusing the closed instance.
- **Unknown tool name:** execution rejects before creating an owner context; the Domain should only publish names from `tools()`.
- **Connection or launch failure:** the shared browser promise clears after rejection, so a later call retries discovery or launch.
- **Tool failure:** upstream `isError` content becomes a normal rejected tool call.
- **Bad discovery candidate:** discovery ignores it and continues to the next candidate.

## Implementation map

| File | Responsibility |
|---|---|
| [`src/index.ts`](src/index.ts) | Backend registration, browser ownership, owner contexts, catalog, and execution |
| [`src/discovery.ts`](src/discovery.ts) | Configured URL validation, active-port discovery, and local port scanning |
| [`src/json-schema.ts`](src/json-schema.ts) | Minimal Zod-to-JSON-Schema projection for upstream tool inputs |
| [`src/config.ts`](src/config.ts) | Backend plugin configuration schema |
| [`src/chrome-types.d.ts`](src/chrome-types.d.ts) | Local declarations for pinned upstream internal modules |
| [`tests/discovery.spec.ts`](tests/discovery.spec.ts) | Configured URL and local port discovery behavior |
| [`tests/json-schema.spec.ts`](tests/json-schema.spec.ts) | Projection of a real upstream Chrome tool schema |

## Model experience

This backend supplies the tool names, descriptions, schemas, and results that the Domain exposes to the model. It injects no prompt by itself. Network headers are configured for redaction, and unrestricted filesystem paths are disabled in the upstream MCP context.

## Known limitations

- The implementation imports `chrome-devtools-mcp` internal `build/src` modules and is pinned to version `1.8.0`; upstream internal changes can break it.
- Discovery targets Google Chrome paths only, not Chromium, Edge, or arbitrary browser profiles.
- The upstream browser helper is process-global. Reconfiguration or closure calls `closeBrowser()` for that shared helper.
- All owners share one browser connection and one backend mutex, so some operations may serialize.
- Schema conversion is intentionally partial; unsupported Zod nodes degrade to an unconstrained schema.
- Tests use mocks and schema projection. They do not launch Chrome or validate a live DevTools session.

## Related documentation

- [Package group map](../README.md)
- [Hub reference](../browser-use/README.md)
- [Domain reference](../browser-use-domain/README.md)
- [Repository guide](../../../README.md)
