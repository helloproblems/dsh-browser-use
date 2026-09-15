---
description: "Chrome backend using the standard MCP stdio protocol."
kind: "package-reference"
---

# browser-use-chrome

[中文](README.md) | English

## Integration

The official MCP SDK `Client` and `StdioClientTransport` launch the installed `chrome-devtools-mcp` CLI. Its entry point is resolved from the dependency's declared `bin` field. No runtime package download, listening port or upstream internal tool imports are required.

```text
DSH Domain → MCP Client → stdin/stdout JSON-RPC → chrome-devtools-mcp → Chrome
```

Initialization performs an MCP handshake and `tools/list`, preserving names, descriptions and original JSON Schema, then closes the discovery connection without launching Chrome. Execution uses `tools/call`, preserving `content` and `structuredContent` and rejecting MCP `isError` results. Client version metadata comes from this package's package.json.

Domain publishes this backend's tools as `mcp__chrome__*`, including `new_page`, `click` and `take_snapshot`. Input schemas come directly from the server.

## Configuration

This backend registers as `chrome` through the Hub, and Domain publishes its tools. Mount it as follows:

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

Each Agent lazily creates a separate MCP server process and reuses its connection. Profile sharing depends on the Domain settings:

- Empty `userDataDir`: use `--isolated`, with a separate temporary profile for each Agent.
- Non-empty `userDataDir` and `sessionIsolation: false` (default): use `--user-data-dir`, reusing a persistent directory by workdir name and browser. Different Agents can use the same directory, but only one browser session can use it at a time.
- Non-empty `userDataDir` and `sessionIsolation: true`: further partition directories by session identity. Restoring the same session ID in the same workdir reuses its data.

See [Domain configuration](../browser-use-domain/README.en.md#configuration) for directory rules and behavior when a session ID is absent.

The Agent workspace is supplied through MCP `roots/list` and used as the server cwd, falling back to the Host cwd. stdout is reserved for MCP; stderr is drained into debug logs. Usage statistics, CrUX and update checks are disabled; network header redaction and file path restrictions remain enabled.

Releasing an Agent closes its MCP connection. The SDK ends stdin, and the upstream server closes the browser and exits. Changes to `browserPath`, `headless`, `userDataDir`, or `sessionIsolation` recycle all sessions. After releasing an owner, the backend remains available for new calls and can establish a new connection. Plugin disposal closes all connections. Calls and cleanup are serialized.

`execute` accepts an optional cancellation signal. A cancelled queued call never starts its tool. Cancellation during execution forwards the signal to MCP and closes the owner's connection to stop browser work. MCP timeouts and connection errors also release that connection, and subsequent calls wait until cleanup completes.

Failed connections are not cached. An unexpected server exit fails the current call; a later call reconnects without replaying potentially side-effecting operations.

## Verification

From the repository root, run `pnpm typecheck`, `pnpm build` and `pnpm test packages/browser-use/browser-use-chrome/tests`. Ordinary tests launch the real MCP server for schema discovery, without launching a browser. Set `CHROME_SMOKE=1` and repeat the package test command for installed-browser tests covering Chrome navigation, script execution, Agent storage isolation and release/recreation.

See `src/index.ts` for catalog/execution/lifecycle, `src/connection.ts` for stdio/CLI/roots, and `tests/backend.spec.ts` for validation. Dependencies remain pinned; upgrades require verifying public CLI and protocol compatibility.

The backend source contains `config.ts`, `connection.ts` and `index.ts`. Executable discovery and its tests live in the Hub; the Chrome discovery re-export has been removed.
