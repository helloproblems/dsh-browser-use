---
description: "Chrome 后端参考，涵盖可执行文件发现、浏览器所有权、Agent 隔离上下文与 chrome-devtools-mcp 工具执行。"
kind: "package-reference"
---

# browser-use-chrome

[English](README.en.md) | 中文

## 概述

`browser-use-chrome` 是 browser-use 家族当前可工作的后端。它注册后端 `chrome`，发布生命周期服务 `browserUse.backend.chrome`，从 `chrome-devtools-mcp@1.8.0` 构建工具目录，并通过一个进程共享浏览器和每个不透明 owner 一个 `McpContext` 来执行工具。它会启动配置的浏览器可执行文件；未提供路径时，则由 Puppeteer 解析系统 Chrome 稳定版。

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
    browserPath: ''
    toolCallTimeoutMs: 120000
```

`browserPath` 为空时，Domain 会检索所选浏览器的可执行文件并持久化到 DSH 设置。仍未找到可执行文件时，后端会请求 `chrome-devtools-mcp` 解析并启动 Chrome 稳定版。

## 配置所有权

浏览器连接字段由 `browser-use-domain` 定义，再通过 `BrowserUseSettings` 转发：

| Domain 字段 | 在本后端中的作用 |
|---|---|
| `headless` | 传给浏览器启动操作 |
| `browserPath` | 非空时作为 Puppeteer 的 `executablePath` |
| `browserType` | `chrome` / `edge` | 保存后动态切换后端 |

后端包 schema 也接受默认值为 `120000` 的 `toolCallTimeoutMs`。该字段目前为组合兼容性保留，但 `ChromeBrowserUseBackend` 不读取它；真正生效的工具超时是 `browser-use-domain.config.toolCallTimeoutMs`。

## 浏览器选择

打开共享浏览器时，后端遵循以下规则：

| 设置 | 行为 |
|---|---|
| `browserPath` 非空 | 直接启动该可执行文件 |
| `browserPath` 为空 | 启动 Puppeteer 解析到的 Chrome 稳定版 |

### 发现顺序

`discoverBrowserExecutable()` 按顺序检查平台安装候选，并返回第一个可执行路径：

1. Windows 用户目录与 Program Files 中的 Chrome/Edge 路径。
2. macOS 系统与用户级应用程序包。
3. Linux 标准二进制目录，再检查 `PATH` 中的目录。

Domain 会在注册设置命名空间前执行发现；用户设置层尚未保存路径时，会把发现结果持久化。

## 资源生命周期

- **共享浏览器：** `browserPromise` 保证并发首次调用复用同一次启动过程。
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
- **启动失败：** 共享浏览器 promise 在 rejection 后清空，后续调用会重新启动。
- **工具失败：** 上游 `isError` 内容转换为标准 rejected 工具调用。
- **未找到可执行文件：** 发现会继续检查剩余平台候选；最终为空时回退到 Puppeteer 的稳定版通道。

## 实现地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 后端注册、浏览器所有权、owner 上下文、工具目录与执行 |
| [`src/discovery.ts`](src/discovery.ts) | 共享浏览器可执行文件发现的重新导出 |
| [`src/json-schema.ts`](src/json-schema.ts) | 面向上游工具输入的最小 Zod 到 JSON Schema 投影 |
| [`src/config.ts`](src/config.ts) | 后端插件配置 schema |
| [`src/chrome-types.d.ts`](src/chrome-types.d.ts) | 固定版本上游内部模块的本地声明 |
| [`tests/discovery.spec.ts`](tests/discovery.spec.ts) | Chrome/Edge 可执行文件候选与回退行为 |
| [`tests/json-schema.spec.ts`](tests/json-schema.spec.ts) | 真实上游 Chrome 工具 schema 的投影 |

## 模型体验

本后端提供由 Domain 暴露给模型的工具名、描述、schema 和结果，自身不注入提示词。上游 MCP 上下文配置会脱敏网络请求头，并禁止无限制文件系统路径。

## 已知限制

- 实现导入 `chrome-devtools-mcp` 的内部 `build/src` 模块，并固定在版本 `1.8.0`；上游内部变化可能造成破坏。
- Edge 使用 Playwright MCP；启用两个后端插件后，可通过设置页热切换浏览器。
- 上游浏览器 helper 是进程全局单例；重新配置或关闭会对该共享 helper 调用 `closeBrowser()`。
- 所有 owner 共用一个浏览器连接和一个后端 mutex，因此部分操作可能串行化。
- Schema 转换有意只支持部分 Zod 节点；不支持的节点会退化为无约束 schema。
- 测试使用 mock 和 schema 投影，不启动浏览器，也不验证真实 DevTools 会话。

## 相关文档

- [包组地图](../README.md)
- [Hub 参考](../browser-use/README.md)
- [Domain 参考](../browser-use-domain/README.md)
- [仓库指南](../../../README.md)
