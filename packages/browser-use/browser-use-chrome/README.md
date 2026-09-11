---
description: "Chrome 后端参考：通过标准 MCP stdio 协议集成 chrome-devtools-mcp。"
kind: "package-reference"
---

# browser-use-chrome

中文 | [English](README.en.md)

## 接入方式

本包使用官方 MCP SDK 的 `Client` 与 `StdioClientTransport`，启动已安装的 `chrome-devtools-mcp@1.8.0` 命令行服务。入口从依赖 package.json 的 `bin` 字段解析；运行时不下载包、不导入上游内部工具模块，也不开放监听端口。

```text
DSH Domain → MCP Client → stdin/stdout JSON-RPC → chrome-devtools-mcp → Chrome
```

初始化完成 MCP 握手，通过 `tools/list` 获取工具名称、描述和原始 JSON Schema，随后关闭用于发现目录的连接。此时不启动 Chrome。工具调用通过 `tools/call` 完成，保留 `content` 与 `structuredContent`，将 `isError` 转为工具执行错误。客户端版本号从本包 package.json 读取。

Domain 继续发布 `mcp__chrome__*` 工具，包括 `new_page`、`click`、`take_snapshot` 等；不需要迁移到 Playwright 工具名称。输入 schema 直接来自服务器，已移除旧 Zod 转换器和内部模块类型声明。

## 配置

默认 bundle 选择 Chrome，同时启用 Edge 以支持设置页热切换。Chrome 单后端组合：

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

- `browserPath` 非空时传入 `--executable-path`；空路径由 Domain 自动发现，或回退到上游 `--channel stable`。
- `headless` 控制浏览器是否显示窗口。
- 后端 `toolCallTimeoutMs` 控制 MCP 请求超时，默认 120 秒；Domain 的同名配置控制 DSH 工具超时，两处可保持一致。
- MCP 连接握手超时为 30 秒。

## 会话与清理

每个 Agent 首次调用时创建独立 MCP 服务进程；服务使用 `--isolated` 启动带临时用户目录的 Chrome。同一 Agent 复用连接，不同 Agent 不共享浏览器配置。与旧实现相比，这提高了进程隔离程度，也增加了多 Agent 的资源开销。

Agent 的 `session.header.cwd` 通过 MCP `roots/list` 传递，同时用作服务工作目录；没有该字段时使用 Host 工作目录。标准输出只用于 MCP 协议，标准错误单独接入 debug 日志。关闭使用统计、CrUX 查询与更新检查；保留网络请求头脱敏与文件路径限制。

`release(owner)` 关闭该 Agent 的 MCP 连接，SDK 关闭 stdin，上游服务负责关闭浏览器并退出。设置中的路径或 headless 改变时回收所有会话。热切换释放旧 owner 会话，但保留后端可再次激活；插件销毁最终关闭全部连接。调用与清理串行执行，避免在工具执行中途回收资源。

连接建立失败不会缓存失败实例。服务意外退出后，当前调用报错，下一次调用重新连接；不会自动重放可能已产生副作用的操作。

## 验证

```powershell
pnpm typecheck
pnpm build
pnpm test
$env:CHROME_SMOKE='1'
$env:EDGE_SMOKE='1'
$env:BROWSER_SWITCH_SMOKE='1'
pnpm test
```

普通测试会启动真实 MCP 服务并获取 schema，但不会启动浏览器。可选测试覆盖真实 Chrome 导航、脚本执行、Agent 存储隔离、释放后重建，以及 Edge → Chrome → Edge 热切换。

实现见 `src/index.ts`（目录、执行和生命周期）、`src/connection.ts`（stdio 连接、CLI 参数与 roots）和 `tests/backend.spec.ts`。依赖版本固定，升级仍需验证公开 CLI 参数和工具协议兼容性。

后端源码由 `config.ts`、`connection.ts` 和 `index.ts` 组成。浏览器路径发现与测试归 Hub 管理，Chrome 的 discovery 转发文件已移除。
