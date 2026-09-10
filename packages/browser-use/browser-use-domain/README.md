---
description: "browser-use Domain 参考，涵盖后端选择、DSH 工具发布、设置和 Agent 生命周期管理。"
kind: "package-reference"
---

# browser-use-domain

[English](README.en.md) | 中文

## 概述

`browser-use-domain` 是 browser-use 家族面向 DSH 的语义层。它选择一个已注册后端，等待该后端的生命周期服务，把后端稳定目录转换为 `ctx.tools` 注册，要求每次执行都来自 Agent，转发浏览器设置，并在 Agent 销毁时释放 owner 级资源。其客户端模块会在 DSH 设置中增加“浏览器自动化”区域。

Domain 拥有工具名、工具超时、设置和 Agent 生命周期。它不连接浏览器，也不导入任何具体后端。

## 使用本包

把它与 Hub 以及至少一个可工作的后端一起挂载：

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

`backend` 字段是注册表身份。Domain 推导 `browserUse.backend.<backend>`，等待该服务后，再通过 `ctx.browserUse.backend.get(backend)` 解析实现。

## 配置

| 字段 | 默认值 | 含义 |
|---|---|---|
| `backend` | `chrome` | 所有浏览器工具使用的已注册后端 |
| `headless` | `false` | 仅在后端自行启动浏览器时隐藏窗口 |
| `browserType` | `chrome` / `edge` | 须与 Domain backend 一致；切换后端需重启 |
| `browserPath` | 空 | 浏览器可执行文件绝对路径；为空时启动阶段自动检索 |
| `toolCallTimeoutMs` | `120000` | 应用于本 Domain 发布的每个 DSH 工具定义的超时 |

`backend` 与 `toolCallTimeoutMs` 属于组合配置。暴露给 DSH GUI 的设置命名空间包含 `headless`、`browserType` 和 `browserPath`。

## 工具发布

对于 `backend.tools()` 返回的每一项，Domain 注册一个 DSH 工具：

```text
mcp__<backend.browserType>__<backend-tool-name>
```

使用 Chrome 后端时，示例包括 `mcp__chrome__click` 和 `mcp__chrome__take_snapshot`。

每个定义保留后端描述和 JSON Schema，应用 `toolCallTimeoutMs`，并把对象输入转发给 `backend.execute()`。发起调用的 `Agent` 对象成为不透明 owner。没有 Agent 的调用会以 `browser-use tools require an initiating DSH session` 失败。

后端输出保留 MCP 风格的 `content` 数组和可选 `structuredContent`。DSH renderer 从 `content` 中提取文本块；没有文本块时显示 `(no textual output)`，同时仍把结构化结果保留为工具值。

## 设置行为

当 `ctx.settings` 可用时，Host 注册设置命名空间 `browser-use`。未配置浏览器位置时，它会检索所选浏览器的可执行文件，把结果作为解析后的 base，并写入用户设置层。变更由 watcher 转发到 `backend.reconfigure(next)`。初始配置或后续重新配置失败只记录 warning，不会移除已经注册的工具目录。

客户端模块注册的设置区域包含：

- Edge 已通过 Playwright MCP 实现。启用对应插件，并将 Domain 的 `backend` 和 `browserType` 同时设为 `edge` 后重启。
- 无头模式开关。
- 可编辑的浏览器可执行文件位置与本机文件选择器。
- 通过 DSH settings remote API 完成的 revision 感知替换。

文件选择器优先从当前填写的路径打开；路径为空时使用自动检索结果。Windows 使用启用视觉样式的现代系统文件对话框，支持每显示器 DPI 和前台激活，默认显示所有文件。取消选择保留原值，选中后点击“保存”应用设置。

## 生命周期

1. 插件注入 `browserUse` 与 `tools`。
2. 它动态注入所选后端的生命周期服务。
3. 服务可用后，解析后端并发送初始设置快照。
4. 在本次激活中注册一次后端工具目录。
5. 全局 `agent/disposed` 监听器调用 `backend.release(agent)`。
6. 后端包销毁时仍负责注销并关闭完整后端。

## 失败与恢复

- **未知后端：** 生命周期服务缺失时 Domain 会保持等待；确认对应后端包已挂载并发布相同身份。
- **注册表不一致：** 生命周期服务存在但注册项缺失时，Hub 查找抛出代码为 `backend-not-found` 的 `BrowserUseError`；修复提供方生命周期模式。
- **没有发起 Agent：** 工具执行拒绝；浏览器工具面向 DSH Agent 调用，而非无 owner 的直接执行。
- **后端重新配置错误：** Domain 记录 warning；检查所选后端的连接设置与日志。
- **工具执行错误：** 后端 rejection 通过标准 DSH 工具失败路径返回。

## 实现地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 后端激活、工具定义、输出渲染、设置转发和 Agent 销毁处理 |
| [`src/config.ts`](src/config.ts) | 组合 schema、默认值和 `browser-use` 设置命名空间 |
| [`src/browser-picker.ts`](src/browser-picker.ts) | 同源保护的本机浏览器文件选择端点 |
| [`src/client/index.tsx`](src/client/index.tsx) | DSH 设置 UI 与远程设置写入 |

## 模型体验

这是本家族唯一直接改变模型能力的包。它为后端目录中的每一项注册工具定义，因此工具名、描述和输入 schema 会进入面向模型的工具列表。它不注入系统提示词，也不自行追加会话事件。

## 已知限制

- 后端选择属于组合期配置，不作为实时 GUI 设置暴露。
- Edge 已通过 Playwright MCP 实现。启用对应插件，并将 Domain 的 `backend` 和 `browserType` 同时设为 `edge` 后重启。
- 后端工具目录在每次激活时只读取一次；设置变更不会增加或删除工具。
- 重新配置失败只是 warning，而不是插件不健康状态，因此后端无法连接时工具仍可能保持注册。
- 文本 renderer 忽略非文本内容块；调用方仍会收到原始结构化工具值。
- 设置客户端当前只包含中文界面文案。

## 相关文档

- [包组地图](../README.md)
- [Hub 参考](../browser-use/README.md)
- [Chrome 后端参考](../browser-use-chrome/README.md)
- [仓库指南](../../../README.md)
