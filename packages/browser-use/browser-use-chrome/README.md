---
description: "Chrome 后端参考：通过标准 MCP stdio 协议集成 chrome-devtools-mcp。"
kind: "package-reference"
---

# browser-use-chrome

中文 | [English](README.en.md)

## 接入方式

本包使用官方 MCP SDK 的 `Client` 与 `StdioClientTransport`，启动已安装的 `chrome-devtools-mcp` 命令行服务。入口从依赖 package.json 的 `bin` 字段解析；运行时不下载包、不导入上游内部工具模块，也不开放监听端口。

```text
DSH Domain → MCP Client → stdin/stdout JSON-RPC → chrome-devtools-mcp → Chrome
```

初始化完成 MCP 握手，通过 `tools/list` 获取工具名称、描述和原始 JSON Schema，随后关闭用于发现目录的连接。此时不启动 Chrome。工具调用通过 `tools/call` 完成，保留 `content` 与 `structuredContent`，将 `isError` 转为工具执行错误。客户端版本号从本包 package.json 读取。

Domain 将本后端工具发布为 `mcp__chrome__*`，包括 `new_page`、`click`、`take_snapshot` 等。输入 schema 直接来自服务器。

## 配置

本后端通过 Hub 注册为 `chrome`，并由 Domain 发布工具。挂载示例：

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

每个 Agent 首次调用时创建独立 MCP 服务进程，同一 Agent 复用连接。浏览器数据是否共享取决于 Domain 的设置：

- `userDataDir` 为空：使用 `--isolated`，每个 Agent 使用独立临时用户目录。
- `userDataDir` 非空且 `sessionIsolation: false`（默认）：使用 `--user-data-dir`，按工作目录名称和浏览器复用持久化目录。不同 Agent 可使用同一目录，但同一目录同时只能供一个浏览器会话使用。
- `userDataDir` 非空且 `sessionIsolation: true`：进一步按会话身份分配目录；同一工作目录下恢复相同会话 ID 时复用原数据。

目录规则及缺少会话 ID 时的行为见 [Domain 配置](../browser-use-domain/README.md#配置)。

Agent 的 `session.header.cwd` 通过 MCP `roots/list` 传递，同时用作服务工作目录；没有该字段时使用 Host 工作目录。标准输出只用于 MCP 协议，标准错误单独接入 debug 日志。关闭使用统计、CrUX 查询与更新检查；保留网络请求头脱敏与文件路径限制。

`release(owner)` 关闭该 Agent 的 MCP 连接，SDK 关闭 stdin，上游服务负责关闭浏览器并退出。`browserPath`、`headless`、`userDataDir` 或 `sessionIsolation` 改变时回收所有会话。释放单个 owner 后，后端仍可处理新调用并重新建立连接；插件销毁最终关闭全部连接。调用与清理串行执行，避免在工具执行中途回收资源。

连接建立失败不会缓存失败实例。服务意外退出后，当前调用报错，下一次调用重新连接；不会自动重放可能已产生副作用的操作。

`execute` 接受可选取消信号。排队时取消不会启动工具；运行时取消会向 MCP 传递信号，并关闭当前 owner 的连接以停止浏览器操作。MCP 超时或连接错误同样释放该连接，清理完成后才允许后续调用继续。

## 验证

```powershell
pnpm typecheck
pnpm build
pnpm test packages/browser-use/browser-use-chrome/tests
$env:CHROME_SMOKE='1'
pnpm test packages/browser-use/browser-use-chrome/tests
```

从仓库根目录运行上述命令。普通测试会启动真实 MCP 服务并获取 schema，但不会启动浏览器。`CHROME_SMOKE=1` 可选测试覆盖真实 Chrome 导航、脚本执行、Agent 存储隔离和释放后重建。

实现见 `src/index.ts`（目录、执行和生命周期）、`src/connection.ts`（stdio 连接、CLI 参数与 roots）和 `tests/backend.spec.ts`。依赖版本固定，升级仍需验证公开 CLI 参数和工具协议兼容性。

后端源码由 `config.ts`、`connection.ts` 和 `index.ts` 组成。浏览器路径发现与测试归 Hub 管理，Chrome 的 discovery 转发文件已移除。
