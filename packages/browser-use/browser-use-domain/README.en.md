---
description: "browser-use Domain reference for backend selection, DSH tool publication, settings, and per-Agent lifecycle management."
kind: "package-reference"
---

# browser-use-domain

English | [中文](README.md)

## Summary

`browser-use-domain` is the DSH-facing semantics layer of the browser-use family. It selects one registered backend, waits for that backend's lifecycle service, converts the backend's stable catalog into `ctx.tools` registrations, requires every execution to originate from an Agent, forwards browser settings, and releases owner-scoped resources when the Agent is disposed. Its client module adds the "Browser Automation" section to DSH settings.

The Domain owns tool names, tool timeout, settings, and Agent lifecycle. It does not connect to a browser or import a concrete backend.

## Use this package

Mount it with the Hub and at least one working backend:

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

The `backend` field is a registry identity. The Domain derives `browserUse.backend.<backend>`, waits for that service, then resolves the implementation through `ctx.browserUse.backend.get(backend)`.

## Configuration

| Field | Default | Meaning |
|---|---|---|
| `backend` | `chrome` | Registered backend selected for all browser tools |
| `headless` | `false` | Hide a browser window only when the backend launches one |
| `browserType` | `chrome` | Browser identity; Chrome is selectable and Edge is reserved but disabled in the GUI |
| `browserPath` | empty | Absolute browser executable path; an empty value is auto-detected at startup |
| `toolCallTimeoutMs` | `120000` | Timeout applied to every DSH tool definition published by this Domain |

`backend` and `toolCallTimeoutMs` are composition settings. The settings namespace exposed to the DSH GUI contains `headless`, `browserType`, and `browserPath`.

## Tool publication

For each item returned by `backend.tools()`, the Domain registers one DSH tool:

```text
mcp__<backend.browserType>__<backend-tool-name>
```

For the Chrome backend, examples include `mcp__chrome__click` and `mcp__chrome__take_snapshot`.

Each definition preserves the backend description and JSON Schema, applies `toolCallTimeoutMs`, and forwards an object input to `backend.execute()`. The initiating `Agent` object becomes the opaque owner. Calls without an Agent fail with `browser-use tools require an initiating DSH session`.

Backend output keeps the MCP-style `content` array and optional `structuredContent`. The DSH renderer extracts text blocks from `content`; when no text block exists, it renders `(no textual output)` while retaining the structured result as the tool value.

## Settings behavior

The Host registers settings namespace `browser-use` when `ctx.settings` is available. When no browser path is configured, it detects the selected browser's executable, uses that path as the resolved base, and persists it into the user settings layer. Changes are watched and forwarded to `backend.reconfigure(next)`. Initial configuration and later reconfiguration failures are logged as warnings; they do not remove the already registered tool catalog.

The client module registers a settings section with:

- A Chrome/Edge dropdown whose Edge option is disabled until its backend is available.
- A headless-mode switch.
- An editable browser executable path with a native file chooser.
- Revision-aware replacement through the DSH settings remote API.

## Lifecycle

1. The plugin injects `browserUse` and `tools`.
2. It dynamically injects the selected backend lifecycle service.
3. After that service is available, it resolves the backend and sends the initial settings snapshot.
4. It registers the backend's tool catalog once for that activation.
5. A global `agent/disposed` listener calls `backend.release(agent)`.
6. Backend package disposal remains responsible for unregistering and closing the complete backend.

## Failures and recovery

- **Unknown backend:** the Domain remains waiting if the lifecycle service is absent; ensure the corresponding backend package is mounted and publishes the same identity.
- **Registry mismatch:** if a lifecycle service exists but no registry entry exists, Hub lookup throws `BrowserUseError` with `backend-not-found`; fix the provider lifecycle pattern.
- **No initiating Agent:** tool execution rejects; browser tools are intended for DSH Agent calls, not ownerless direct execution.
- **Backend reconfiguration error:** the Domain logs a warning; inspect the selected backend's connection settings and logs.
- **Tool execution error:** the backend rejection is returned through the normal DSH tool failure path.

## Implementation map

| File | Responsibility |
|---|---|
| [`src/index.ts`](src/index.ts) | Backend activation, tool definitions, output rendering, settings forwarding, and Agent disposal |
| [`src/config.ts`](src/config.ts) | Composition schema, defaults, and the `browser-use` settings namespace |
| [`src/browser-picker.ts`](src/browser-picker.ts) | Same-origin native executable chooser endpoint |
| [`src/client/index.tsx`](src/client/index.tsx) | DSH settings UI and remote settings writes |

## Model experience

This is the only package in the family that directly changes model capabilities. It registers one tool definition per backend catalog entry, so tool names, descriptions, and input schemas enter the model-facing tool list. It injects no system-prompt text and appends no session events of its own.

## Known limitations

- Backend selection is composition-time configuration and is not exposed as a live GUI setting.
- Edge is represented in `browserType` but remains disabled in the GUI until a working Edge backend ships.
- The backend tool catalog is captured once per activation; settings changes do not add or remove tools.
- Reconfiguration failures are warnings rather than an unhealthy plugin state, so tools may stay registered while the backend cannot connect.
- The text renderer ignores non-text content blocks; callers still receive the original structured tool value.
- The settings client currently contains Chinese interface labels only.

## Related documentation

- [Package group map](../README.en.md)
- [Hub reference](../browser-use/README.en.md)
- [Chrome backend reference](../browser-use-chrome/README.en.md)
- [Repository guide](../../../README.en.md)
