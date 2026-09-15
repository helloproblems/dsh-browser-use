# browser-use-edge

中文 | [English](README.en.md)

通过官方 `@playwright/mcp@0.0.80` 和 MCP SDK 接入 Microsoft Edge。使用公开 `createConnection()` API 与 `InMemoryTransport` 在同一 Host 进程内交换 MCP 消息，无需独立的 MCP 服务子进程或监听端口。

```text
DSH Domain → MCP Client → InMemoryTransport (JSON-RPC) → @playwright/mcp → playwright-core → Edge
```

后端使用匹配版本的 `playwright-core` 持有浏览器和上下文，并通过 `createConnection` 的公开 context getter 交给 MCP。关闭会等待启动中的资源、上下文和浏览器全部释放，随后才允许复用持久化目录；重复关闭复用同一个清理任务。`browser_close` 同样释放后端持有的资源。

初始化时通过 `tools/list` 获取稳定工具目录，不启动浏览器。Domain 发布 `mcp__edge__browser_*` 工具；首次调用时才启动 Edge。每个 Agent 拥有独立 MCP 连接与隔离浏览器会话。工具调用使用 `tools/call`，保留内容块和结构化结果，将 MCP `isError` 转为执行错误。

默认 bundle 同时启用 Chrome 与 Edge，初始选择 Chrome。可在设置页热切换到 Edge；仅使用 Edge 的组合示例：

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

空路径使用系统 Edge。设置页切换浏览器类型会保留已填写的路径；若路径与新类型不匹配，需要清空路径以自动发现，或重新选择对应的可执行文件后才能保存。保存后热切换后端，无需重启。已有用户设置优先于 bundle 默认值。

Agent 销毁关闭该 Agent 的会话；`browserPath`、`headless`、`userDataDir` 或 `sessionIsolation` 改变时回收所有会话；插件销毁关闭所有连接。生命周期与工具执行串行化，避免执行中途清理；目前不同 Agent 的工具调用也串行执行。后端 `toolCallTimeoutMs` 控制 MCP 请求超时，默认 120 秒；Domain 超时独立配置。

工作目录通过 MCP roots 传递。启用上游 core 工具；Domain 通过附件服务将截图提供给模型。目录留空时使用临时隔离会话，配置用户数据目录后保留登录状态。当前不提供扩展/CDP 接管模式。依赖版本已固定，升级须重跑兼容性测试。

`execute` 接受可选取消信号。排队期间取消不会执行；运行时取消或 MCP 请求超时会关闭该 owner 的浏览器会话，并等待资源释放后再继续队列。下次调用重新创建会话，不自动重放被中断的操作。

```powershell
pnpm typecheck
pnpm test
$env:EDGE_SMOKE='1'
pnpm test
pnpm build
```

普通测试检查真实 MCP 工具目录和模拟会话生命周期。`EDGE_SMOKE=1` 额外启动本机无头 Edge，验证本地页面导航、点击和 Agent 存储隔离。

## 源码结构

- `config.ts`：后端配置 schema。
- `connection.ts`：MCP 连接、workspace roots 与连接清理；客户端版本从 package.json 读取。
- `index.ts`：插件注册、工具目录、执行与 Agent 生命周期。

浏览器路径发现及其测试归 Hub 管理。Chrome 与 Edge 均采用这三个源码文件。
