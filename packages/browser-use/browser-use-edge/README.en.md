# browser-use-edge

[中文](README.md) | English

Microsoft Edge backend using pinned `@playwright/mcp@0.0.80` and the official MCP SDK. The public `createConnection()` API and `InMemoryTransport` exchange real MCP messages without subprocesses or listening ports.

Initialization discovers the catalog using `tools/list` without launching a browser. Domain publishes `mcp__edge__browser_*` tools. Each Agent lazily gets an independent MCP connection and isolated browser session. `tools/call` preserves content blocks and structured results; MCP `isError` becomes an execution error.

The shipped bundle enables both backends and initially selects Chrome. Switch to Edge through settings; an Edge-only composition is shown below:

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

An empty path selects system Edge. Changing browser type in settings clears the old path and switches backends without restarting. Stored user settings override bundle defaults.

Agent disposal closes its session. Changes to path or headless settings recycle sessions; plugin disposal closes all connections. Calls and lifecycle operations are serialized, including calls from different Agents. Backend `toolCallTimeoutMs` controls MCP request timeout (default 120 seconds); Domain timeout is configured separately.

Workspace paths are sent via MCP roots. Core tools are enabled. Screenshot blocks are preserved, though the existing Domain UI summary only renders text. This integration does not attach through extensions/CDP or persist logins across restarts. Revalidate compatibility when upgrading dependencies.

Run `pnpm typecheck`, `pnpm test`, and `pnpm build`. Set `EDGE_SMOKE=1` for the optional installed-Edge test covering local-page navigation, clicks and per-Agent storage isolation. Ordinary tests exercise real MCP tool discovery and mocked lifecycle behavior.

## Source layout

- `config.ts`: backend configuration schema.
- `connection.ts`: MCP connection, workspace roots and cleanup; client version is read from package.json.
- `index.ts`: plugin registration, tool catalog, execution and Agent lifecycle.

Executable discovery and its tests belong to the Hub. Both browser backends use this three-file layout.
