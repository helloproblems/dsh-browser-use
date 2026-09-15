# browser-use-edge

[中文](README.md) | English

Microsoft Edge backend using pinned `@playwright/mcp@0.0.80` and the official MCP SDK. The public `createConnection()` API and `InMemoryTransport` exchange MCP messages within the same Host process, without a separate MCP server subprocess or listening port.

```text
DSH Domain → MCP Client → InMemoryTransport (JSON-RPC) → @playwright/mcp → playwright-core → Edge
```

The backend owns its browser and context through the matching `playwright-core` version and supplies the context using the public `createConnection` context getter. Shutdown waits for pending launches, contexts, and browsers to finish closing before a persistent profile can be reused. Repeated close calls share the same cleanup promise. `browser_close` also releases these owned resources.

Initialization discovers the catalog using `tools/list` without launching a browser. Domain publishes `mcp__edge__browser_*` tools. Each Agent lazily gets an independent MCP connection and isolated browser session. `tools/call` preserves content blocks and structured results; MCP `isError` becomes an execution error.

This backend registers as `edge` through the Hub, and Domain publishes its tools. Mount it as follows:

```yaml
- name: browser-use
- name: browser-use-edge
  config:
    toolCallTimeoutMs: 120000
- name: browser-use-domain
  config:
    backend: edge
    browserType: edge
    headless: false
    browserPath: ''
    toolCallTimeoutMs: 120000
```

An empty `browserPath` selects system Edge; a non-empty path selects that executable. This backend receives connection and data isolation settings through `reconfigure(settings)`; see [Domain settings](../browser-use-domain/README.en.md#settings-behavior) for GUI behavior.

Agent disposal closes its session. Changes to `browserPath`, `headless`, `userDataDir`, or `sessionIsolation` recycle all sessions; plugin disposal closes all connections. Calls and lifecycle operations are serialized, including calls from different Agents. Backend `toolCallTimeoutMs` controls MCP request timeout (default 120 seconds); Domain timeout is configured separately.

Workspace paths are sent via MCP roots. Core tools are enabled, and Domain delivers screenshots to the model through the attachment service. A blank user data directory uses temporary isolated sessions; a configured directory preserves login state. This integration does not attach through extensions/CDP. Revalidate compatibility when upgrading dependencies.

`execute` accepts an optional cancellation signal. Cancelled queued calls do not execute. Cancellation during execution or an MCP timeout closes the owner's browser session and drains cleanup before the queue continues. The next call creates a new session without replaying interrupted operations.

From the repository root, run `pnpm typecheck`, `pnpm test packages/browser-use/browser-use-edge/tests`, and `pnpm build`. Set `EDGE_SMOKE=1` and repeat the package test command for the optional installed-Edge test covering local-page navigation, clicks and per-Agent storage isolation. Ordinary tests exercise real MCP tool discovery and mocked lifecycle behavior.

## Source layout

- `config.ts`: backend configuration schema.
- `connection.ts`: MCP connection, workspace roots and cleanup; client version is read from package.json.
- `index.ts`: plugin registration, tool catalog, execution and Agent lifecycle.

Executable discovery and its tests belong to the Hub.
