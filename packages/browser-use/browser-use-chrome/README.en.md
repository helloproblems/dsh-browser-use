---
description: "Chrome backend reference for executable discovery, browser ownership, per-Agent contexts, and chrome-devtools-mcp tool execution."
kind: "package-reference"
---

# browser-use-chrome

English | [中文](README.md)

## Summary

`browser-use-chrome` is the working backend for the browser-use family. It registers backend `chrome`, publishes lifecycle service `browserUse.backend.chrome`, builds a tool catalog from `chrome-devtools-mcp@1.8.0`, and executes those tools through one process-shared browser with one `McpContext` per opaque owner. It launches the configured browser executable, or lets Puppeteer resolve the system Chrome channel when no path is available.

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
    browserPath: ''
    toolCallTimeoutMs: 120000
```

When `browserPath` is empty, the Domain detects the selected browser executable and persists it to DSH settings. If no executable is found, the backend still asks `chrome-devtools-mcp` to resolve and launch the stable Chrome channel.

## Configuration ownership

Browser connection fields are defined by `browser-use-domain` and forwarded through `BrowserUseSettings`:

| Domain field | Effect in this backend |
|---|---|
| `headless` | Passed to the browser launch operation |
| `browserPath` | Passed to Puppeteer as `executablePath` when non-empty |
| `browserType` | Chrome is active; Edge is represented but disabled in the settings UI |

The backend package schema also accepts `toolCallTimeoutMs` with default `120000`. This field is currently retained for composition compatibility but is not read by `ChromeBrowserUseBackend`; the effective registered tool timeout is `browser-use-domain.config.toolCallTimeoutMs`.

## Browser selection

When opening the shared browser, the backend follows these rules:

| Settings | Behavior |
|---|---|
| Non-empty `browserPath` | Launch that executable directly |
| Empty `browserPath` | Launch Puppeteer's stable Chrome channel |

### Discovery order

`discoverBrowserExecutable()` checks platform installation candidates in order and returns the first executable path:

1. Windows per-user and Program Files Chrome/Edge locations.
2. macOS system and per-user application bundles.
3. Linux standard binary directories followed by entries from `PATH`.

The Domain runs discovery before registering the settings namespace and persists a detected path when the user layer does not already contain one.

## Resource lifecycle

- **Shared browser:** `browserPromise` ensures concurrent first calls share one launch operation.
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
- **Launch failure:** the shared browser promise clears after rejection, so a later call retries the launch.
- **Tool failure:** upstream `isError` content becomes a normal rejected tool call.
- **Missing detected executable:** discovery continues through the remaining platform candidates; an empty result falls back to Puppeteer's stable channel.

## Implementation map

| File | Responsibility |
|---|---|
| [`src/index.ts`](src/index.ts) | Backend registration, browser ownership, owner contexts, catalog, and execution |
| [`src/discovery.ts`](src/discovery.ts) | Re-export of shared browser executable discovery |
| [`src/json-schema.ts`](src/json-schema.ts) | Minimal Zod-to-JSON-Schema projection for upstream tool inputs |
| [`src/config.ts`](src/config.ts) | Backend plugin configuration schema |
| [`src/chrome-types.d.ts`](src/chrome-types.d.ts) | Local declarations for pinned upstream internal modules |
| [`tests/discovery.spec.ts`](tests/discovery.spec.ts) | Chrome/Edge executable candidate and fallback behavior |
| [`tests/json-schema.spec.ts`](tests/json-schema.spec.ts) | Projection of a real upstream Chrome tool schema |

## Model experience

This backend supplies the tool names, descriptions, schemas, and results that the Domain exposes to the model. It injects no prompt by itself. Network headers are configured for redaction, and unrestricted filesystem paths are disabled in the upstream MCP context.

## Known limitations

- The implementation imports `chrome-devtools-mcp` internal `build/src` modules and is pinned to version `1.8.0`; upstream internal changes can break it.
- The settings UI keeps Edge disabled until a complete Edge backend is available, although executable discovery already knows common Edge locations.
- The upstream browser helper is process-global. Reconfiguration or closure calls `closeBrowser()` for that shared helper.
- All owners share one browser connection and one backend mutex, so some operations may serialize.
- Schema conversion is intentionally partial; unsupported Zod nodes degrade to an unconstrained schema.
- Tests use mocks and schema projection. They do not launch a browser or validate a live DevTools session.

## Related documentation

- [Package group map](../README.en.md)
- [Hub reference](../browser-use/README.en.md)
- [Domain reference](../browser-use-domain/README.en.md)
- [Repository guide](../../../README.en.md)
