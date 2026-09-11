---
description: "Chrome backend using the standard MCP stdio protocol."
kind: "package-reference"
---

# browser-use-chrome

[中文](README.md) | English

## Integration

The official MCP SDK `Client` and `StdioClientTransport` launch the installed `chrome-devtools-mcp@1.8.0` CLI. Its entry point is resolved from the dependency's declared `bin` field. No runtime package download, listening port or upstream internal tool imports are required.

```text
DSH Domain → MCP Client → stdin/stdout JSON-RPC → chrome-devtools-mcp → Chrome
```

Initialization performs an MCP handshake and `tools/list`, preserving names, descriptions and original JSON Schema, then closes the discovery connection without launching Chrome. Execution uses `tools/call`, preserving `content` and `structuredContent` and rejecting MCP `isError` results. Client version metadata comes from this package's package.json.

Domain still publishes `mcp__chrome__*`, including `new_page`, `click` and `take_snapshot`. No migration to Playwright tool names is needed. Schemas now come directly from the server; the old Zod converter and internal module declarations were removed.

## Configuration

The default bundle selects Chrome and enables Edge for hot switching. A Chrome-only composition:

```yaml
- name: browser-use
- name: browser-use-chrome
  config:
    toolCallTimeoutMs: 120000
- name: browser-use-domain
  config:
    backend: chrome
    browserType: chrome
    headless: false
    browserPath: ''
    toolCallTimeoutMs: 120000
```

A non-empty browser path is passed via `--executable-path`; otherwise Domain discovers the executable or the server uses `--channel stable`. `headless` controls browser visibility. Backend `toolCallTimeoutMs` controls MCP requests (default 120 seconds); Domain has its own DSH tool timeout. Handshakes have a 30-second timeout.

## Sessions and cleanup

Each Agent lazily creates a separate MCP server process, which launches Chrome with `--isolated` and a temporary profile. Calls from the same Agent reuse the connection; different Agents do not share profiles. This provides stronger process isolation at a higher multi-Agent resource cost than the old shared browser implementation.

The Agent workspace is supplied through MCP `roots/list` and used as the server cwd, falling back to the Host cwd. stdout is reserved for MCP; stderr is drained into debug logs. Usage statistics, CrUX and update checks are disabled; network header redaction and file path restrictions remain enabled.

Releasing an Agent closes its MCP connection. The SDK ends stdin, and the upstream server closes the browser and exits. Path/headless changes recycle sessions. Hot switching releases old owners without permanently disposing the backend. Plugin disposal closes all connections. Calls and cleanup are serialized.

Failed connections are not cached. An unexpected server exit fails the current call; a later call reconnects without replaying potentially side-effecting operations.

## Verification

Run `pnpm typecheck`, `pnpm build` and `pnpm test`. Ordinary tests launch the real MCP server for schema discovery, without launching a browser. Set `CHROME_SMOKE=1`, `EDGE_SMOKE=1` and `BROWSER_SWITCH_SMOKE=1` for installed-browser tests covering Chrome navigation, script execution, Agent storage isolation, release/recreation and Edge → Chrome → Edge switching.

See `src/index.ts` for catalog/execution/lifecycle, `src/connection.ts` for stdio/CLI/roots, and `tests/backend.spec.ts` for validation. Dependencies remain pinned; upgrades require verifying public CLI and protocol compatibility.

The backend source contains `config.ts`, `connection.ts` and `index.ts`. Executable discovery and its tests live in the Hub; the Chrome discovery re-export has been removed.
