# browser-use-edge

[English](README.en.md) | 中文

通过官方 `@playwright/mcp@0.0.80` 和 MCP SDK 接入 Microsoft Edge。使用公开 `createConnection()` API 与 `InMemoryTransport` 交换 MCP 消息，无需子进程、调试端口或单独配置 MCP 服务。

初始化时通过 `tools/list` 获取稳定工具目录，不启动浏览器。Domain 发布 `mcp__edge__browser_*` 工具；首次调用时才启动 Edge。每个 Agent 拥有独立 MCP 连接与隔离浏览器会话。工具调用使用 `tools/call`，保留内容块和结构化结果，将 MCP `isError` 转为执行错误。

默认 bundle 同时启用 Chrome 与 Edge，初始选择 Chrome。可在设置页热切换到 Edge；仅使用 Edge 的组合示例：

```yaml
- name: browser-use
- name: browser-use-edge
- name: browser-use-domain
  config:
    backend: edge
    browserType: edge
    headless: false
    browserPath: ''
    toolCallTimeoutMs: 120000
```

空路径使用系统 Edge。设置页切换类型会清空旧路径并热切换后端，无需重启。已有用户设置优先于 bundle 默认值。

Agent 销毁关闭该 Agent 的会话；实际路径或 headless 设置变化会回收所有会话；插件销毁关闭所有连接。生命周期与工具执行串行化，避免执行中途清理；目前不同 Agent 的工具调用也串行执行。MCP 单次请求上限为 120 秒，Domain 超时独立配置。

工作目录通过 MCP roots 传递。启用上游 core 工具；截图内容块保留，但现有 Domain UI 摘要只渲染文字。当前不提供扩展/CDP 接管模式，不保存跨重启登录状态。依赖版本已固定，升级须重跑兼容性测试。

```powershell
pnpm typecheck
pnpm test
$env:EDGE_SMOKE='1'
pnpm test
pnpm build
```

普通测试检查真实 MCP 工具目录和模拟会话生命周期。`EDGE_SMOKE=1` 额外启动本机无头 Edge，验证本地页面导航、点击和 Agent 存储隔离。
