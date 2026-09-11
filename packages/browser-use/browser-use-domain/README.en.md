---
description: "browser-use Domain reference for backend selection, DSH tool publication, settings, and per-Agent lifecycle management."
kind: "package-reference"
---

# browser-use-domain

[中文](README.md) | English

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
    userDataDir: ''
    sessionIsolation: false
    toolCallTimeoutMs: 120000
```

The `backend` field names the provider for the initial browser type. Domain watches the configured provider plus Chrome and Edge lifecycle services, selecting the active implementation from browser settings.

## Configuration

| Field | Default | Meaning |
|---|---|---|
| `backend` | `chrome` | Registered backend for the initial browser type |
| `headless` | `false` | Hide a browser window only when the backend launches one |
| `browserType` | `chrome` / `edge` | Selects the active backend at runtime |
| `browserPath` | empty | Absolute browser executable path; an empty value is auto-detected at startup |
| `userDataDir` | empty | Absolute persistent browser profile directory; empty keeps temporary isolated sessions |
| `sessionIsolation` | `false` | Data isolation level: `false` for workspace, `true` for session |
| `toolCallTimeoutMs` | `120000` | Timeout applied to every DSH tool definition published by this Domain |

`backend` and `toolCallTimeoutMs` are composition settings. The settings namespace exposed to the DSH GUI contains `headless`, `browserType`, `browserPath`, `userDataDir`, and `sessionIsolation`.

Changing the directory or data isolation level closes existing sessions; the next call uses the new configuration without deleting existing data. The workdir comes from the execution context's `agent.session.header.cwd`, falling back to `process.cwd()`. The normalized path is hashed with SHA-256, ignoring case on Windows.

With `sessionIsolation` enabled, profiles live in `<userDataDir>/workdirs/<workdir hash>/sessions/<chrome|edge>/<session identity hash>`. Restored sessions in the same workdir reuse their directory; different workdirs, sessions and browsers use separate profiles. Owners without a session ID receive a random identity stable for that object within the process. Existing login data is not copied into isolated profiles.

With workspace isolation selected, profiles use `<userDataDir>/workdirs/<workdir hash>/<chrome|edge>`, retaining workdir and browser isolation. Only one browser session can use a directory at a time. An empty directory always retains temporary per-Agent isolated sessions. The GUI offers a "Data isolation level" dropdown with Workspace / Session options, preserving compatibility with the existing `sessionIsolation` boolean. The user data directory has a "Select" button that opens a directory chooser on the DSH host; cancelling preserves the current value, and saving applies the selection.

## Tool publication

For each item returned by `backend.tools()`, the Domain registers one DSH tool:

```text
mcp__<backend.browserType>__<backend-tool-name>
```

For the Chrome backend, examples include `mcp__chrome__click` and `mcp__chrome__take_snapshot`.

Each definition preserves the backend description and JSON Schema, applies `toolCallTimeoutMs`, and forwards an object input to `backend.execute()`. The initiating `Agent` object becomes the opaque owner. Calls without an Agent fail with `browser-use tools require an initiating DSH session`.

Backend output keeps the MCP-style `content` array and optional `structuredContent`. The DSH renderer extracts text blocks from `content`; when no text block exists, it renders `(no textual output)` while retaining the structured result as the tool value.

## Settings behavior

The Host registers settings namespace `browser-use` when `ctx.settings` is available. Empty paths select automatic executable discovery without persisting the detected path. Browser-type changes replace the tool catalog; other changes reconfigure the active backend. Settings updates are serialized and failures are logged as warnings.

The client module registers a settings section with:

- Edge uses Playwright MCP. Enable both backend plugins to switch browsers through settings without restarting.
- A headless-mode switch.
- An editable browser executable path with a Select button that uses DSH to choose the installation directory and locates the executable inside it.
- Revision-aware replacement through the DSH settings remote API.

Both Select buttons prefer `ctx.directoryPicker`. For browser location, Windows resolves `chrome.exe` or `msedge.exe` in the selected installation directory or its Application subdirectory; macOS supports application bundles and their containing directory; Linux checks the corresponding browser programs. Missing or mismatched installations leave the current value intact and display an error. A full executable path can still be entered manually. Cancelling preserves the current value; Save applies the selection.

Both selection fields share the path control, request lifecycle, and native capability of `ctx.directoryPicker`, the same service used by Add Workspace, preserving the host's native names. Service failures do not launch another chooser. Only older hosts without that service use the plugin's fallback file or directory picker.

The fallback file and directory pickers read the client's `ctx.locale.getLocale().active`, falling back to the Windows user's display language; installed Windows resources determine available translations. A dedicated STA thread prevents PowerShell from overriding the Windows dialog language. During selection, the existing button becomes Cancel selection without adding a status row or changing its width. A two-minute deadline restores the controls, and leaving settings also aborts pending selection. Executable and directory validation remain specific to each mode.

## Lifecycle

1. The plugin injects `browserUse` and `tools`.
2. It watches the configured backend plus Chrome and Edge lifecycle services.
3. After that service is available, it resolves the backend and sends the initial settings snapshot.
4. Browser changes replace the tool catalog and release old sessions.
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
- Edge uses Playwright MCP. Enable both backend plugins to switch browsers through settings without restarting.
- The backend tool catalog is captured once per activation; settings changes do not add or remove tools.
- Reconfiguration failures are warnings rather than an unhealthy plugin state, so tools may stay registered while the backend cannot connect.
- The text renderer ignores non-text content blocks; callers still receive the original structured tool value.
- The settings client currently contains Chinese interface labels only.

## Related documentation

- [Package group map](../README.en.md)
- [Hub reference](../browser-use/README.en.md)
- [Chrome backend reference](../browser-use-chrome/README.en.md)
- [Repository guide](../../../README.en.md)

## Backend hot switching

Both Chrome and Edge providers stay mounted. The browser type setting selects the active tool catalog. Switching waits for current calls, unregisters old tools and releases old Agent sessions. Stale tool references fail explicitly. A missing or failing target leaves the previous catalog active and logs an error; mounting the selected provider retries activation. Saved settings are asynchronous, so saving does not confirm browser launch. The next tool call launches the selected browser. The `backend` configuration remains an alias for the initial browser type; other types resolve by name.

Run the optional installed-browser round-trip test with `BROWSER_SWITCH_SMOKE=1`: it navigates in Edge, switches to Chrome, then switches back to Edge in one process.
