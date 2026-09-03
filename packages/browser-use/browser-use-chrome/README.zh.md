---
description: "Chrome 后端参考，涵盖地址发现、连接所有权、Agent 隔离上下文与 chrome-devtools-mcp 工具执行。"
kind: "package-reference"
---

# browser-use-chrome

[English](README.md) | 中文

## 概述

`browser-use-chrome` 是 browser-use 家族当前可工作的后端。它注册后端 `chrome`，发布生命周期服务 `browserUse.backend.chrome`，从 `chrome-devtools-mcp@1.8.0` 构建工具目录，并通过一个进程共享 Chrome 连接和每个不透明 owner 一个 `McpContext` 来执行工具。它可以连接现有远程调试地址、发现本地已开启调试的 Chrome，也可以自行启动稳定版 Chrome。

本包只拥有浏览器资源。`browser-use-domain` 拥有 DSH 工具注册、工具超时、设置和 Agent 生命周期。

## 使用本包

在组合中把它挂载于 Hub 与 Domain 之间：

```yaml
- name: browser-use
- name: browser-use-chrome
- name: browser-use-domain
  config:
    backend: chrome
    headless: false
    browserType: chrome
    browserUrl: ''
    autoDiscover: true
    toolCallTimeoutMs: 120000
```

远程浏览器必须暴露 Chrome DevTools HTTP 端点，包括 `/json/version` 与 `webSocketDebuggerUrl`。没有选中可用端点时，后端会请求 `chrome-devtools-mcp` 启动稳定版 Chrome。

## 配置所有权

浏览器连接字段由 `browser-use-domain` 定义，再通过 `BrowserUseSettings` 转发：

| Domain 字段 | 在本后端中的作用 |
|---|---|
| `headless` | 仅在本后端自行启动 Chrome 时传入 |
| `browserUrl` | 需要发现或连接的远程调试 HTTP 地址 |
| `autoDiscover` | 启用地址校验、活动端口文件查找和本地端口扫描 |
| `browserType` | 当前固定为 `chrome` |

后端包 schema 也接受默认值为 `120000` 的 `toolCallTimeoutMs`。该字段目前为组合兼容性保留，但 `ChromeBrowserUseBackend` 不读取它；真正生效的工具超时是 `browser-use-domain.config.toolCallTimeoutMs`。

## 浏览器选择

打开共享浏览器连接时，后端遵循以下规则：

| 设置 | 行为 |
|---|---|
| `autoDiscover: true` 且 `browserUrl` 可访问 | 校验并连接配置地址 |
| `autoDiscover: true` 且配置地址不可用 | 继续查找活动端口文件，再扫描本地端口 |
| `autoDiscover: true` 且未发现端点 | 启动稳定版 Chrome |
| `autoDiscover: false` 且 `browserUrl` 非空 | 不做发现预检，直接连接 |
| `autoDiscover: false` 且 `browserUrl` 为空 | 启动稳定版 Chrome |

### 发现顺序

`discoverBrowser()` 按严格顺序检查：

1. 配置地址，并移除一个末尾斜杠。
2. Chrome `DevToolsActivePort` 文件。
3. `http://127.0.0.1:9222` 到 `:9229`。

每个候选地址必须在 350 ms 内响应 `<url>/json/version`，并返回字符串类型的 `webSocketDebuggerUrl`。

当前活动端口路径覆盖：

- Windows：`%LOCALAPPDATA%` 下的 Chrome Stable、Beta、Dev 和 Canary。
- macOS：`~/Library/Application Support` 下的 Google Chrome。
- Linux：`~/.config/google-chrome/DevToolsActivePort`。

## 资源生命周期

- **共享连接：** `browserPromise` 保证并发首次调用复用同一次连接或启动过程。
- **Owner 隔离：** 后端把每个 owner 对象映射到一个待完成或已就绪的 `McpContext`。
- **Workspace root：** owner 带有 `session.header.cwd` 时，该目录通过文件 URL 作为根 `workspace` 暴露给上下文。
- **初始页面：** 每个新 owner 上下文打开名为 `browser-use-<owner-id>` 的页面。
- **Release：** `release(owner)` 删除 owner 项并销毁其上下文，不关闭其他 owner。
- **重新配置：** 替换设置提供函数，销毁全部 owner 上下文，清除连接 promise，并调用上游 `closeBrowser()`。
- **关闭：** 标记后端已销毁并执行同样的完整 reset；重复 close 无害。

Owner 上下文创建失败时，其缓存 promise 会被移除，后续工具调用可以重试。

## 工具目录与执行

构造函数通过 `createTools()` 获取上游工具列表，只保留 `shouldRegister` 为 true 的 handler，并把每个已注册 Zod 输入 schema 转换为 JSON Schema。目录在后端实例生命周期内保持稳定，由 Domain 读取一次。

执行时，每个 owner、每个工具复用一个 `ToolHandler`。上游结果的 `content` 数组与可选 `structuredContent` 会原样返回到共享契约边界。上游 `isError` 结果会转换为 rejected `Error`，优先使用其中的文本内容。

重要上游选项会关闭使用统计与实验分类，禁止无限制路径，隔离页面处理，并在暴露网络数据前脱敏请求头。

## Schema 转换

[`src/json-schema.ts`](src/json-schema.ts) 支持 `chrome-devtools-mcp` 当前使用的 Zod 形状：字符串、数字、布尔、字面量、枚举、数组、optional/default/effect 包装、联合、record 与 object。未知形状退化为 `{}`，object schema 允许额外字段。

## 失败与恢复

- **后端已销毁：** 后续执行拒绝；应重新激活后端插件，而不是复用已关闭实例。
- **未知工具名：** 在创建 owner 上下文之前拒绝；Domain 应只发布 `tools()` 返回的名称。
- **连接或启动失败：** 共享浏览器 promise 在 rejection 后清空，后续调用会重新执行发现或启动。
- **工具失败：** 上游 `isError` 内容转换为标准 rejected 工具调用。
- **发现候选无效：** 忽略该候选并继续检查下一个。

## 实现地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 后端注册、浏览器所有权、owner 上下文、工具目录与执行 |
| [`src/discovery.ts`](src/discovery.ts) | 配置地址校验、活动端口发现和本地端口扫描 |
| [`src/json-schema.ts`](src/json-schema.ts) | 面向上游工具输入的最小 Zod 到 JSON Schema 投影 |
| [`src/config.ts`](src/config.ts) | 后端插件配置 schema |
| [`src/chrome-types.d.ts`](src/chrome-types.d.ts) | 固定版本上游内部模块的本地声明 |
| [`tests/discovery.spec.ts`](tests/discovery.spec.ts) | 配置地址与本地端口发现行为 |
| [`tests/json-schema.spec.ts`](tests/json-schema.spec.ts) | 真实上游 Chrome 工具 schema 的投影 |

## 模型体验

本后端提供由 Domain 暴露给模型的工具名、描述、schema 和结果，自身不注入提示词。上游 MCP 上下文配置会脱敏网络请求头，并禁止无限制文件系统路径。

## 已知限制

- 实现导入 `chrome-devtools-mcp` 的内部 `build/src` 模块，并固定在版本 `1.8.0`；上游内部变化可能造成破坏。
- 地址发现只覆盖 Google Chrome 路径，不覆盖 Chromium、Edge 或任意自定义 profile。
- 上游浏览器 helper 是进程全局单例；重新配置或关闭会对该共享 helper 调用 `closeBrowser()`。
- 所有 owner 共用一个浏览器连接和一个后端 mutex，因此部分操作可能串行化。
- Schema 转换有意只支持部分 Zod 节点；不支持的节点会退化为无约束 schema。
- 测试使用 mock 和 schema 投影，不启动 Chrome，也不验证真实 DevTools 会话。

## 相关文档

- [包组地图](../README.zh.md)
- [Hub 参考](../browser-use/README.zh.md)
- [Domain 参考](../browser-use-domain/README.zh.md)
- [仓库指南](../../../README.zh.md)
