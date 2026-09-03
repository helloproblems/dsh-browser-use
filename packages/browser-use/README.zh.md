---
description: "browser-use Hub、Domain 与可替换浏览器后端的包组地图。"
kind: "package-group"
---

# packages/browser-use

[English](README.md) | 中文

## 概述

browser-use 包组为 DSH 组合提供模型可调用的浏览器自动化能力，同时避免把工具注册绑定到某一个浏览器实现。Hub 拥有共享契约与注册，Domain 拥有面向 DSH 的语义和设置，各后端拥有浏览器连接与 owner 隔离上下文。当 Agent 需要检查或操作浏览器时挂载本组；不需要浏览器工具的组合可以省略整个组。

## 包

| 包 | 分层 | 运行时贡献 |
|---|---|---|
| [`browser-use`](browser-use/README.zh.md) | Hub | 提供 `ctx.browserUse`、后端契约和具名注册表 |
| [`browser-use-domain`](browser-use-domain/README.zh.md) | Domain | 发布 `mcp__<browser>__*` 工具和“浏览器自动化”设置区 |
| [`browser-use-chrome`](browser-use-chrome/README.zh.md) | Backend | 注册后端 `chrome` 和生命周期服务 `browserUse.backend.chrome` |
| [`browser-use-dege`](browser-use-dege/README.zh.md) | Backend 占位 | 注册后端 `dege`；在内置 bundle 中禁用且不暴露工具 |

## 依赖方向

```text
browser-use-chrome ─┐
browser-use-dege   ─┼─ 注册实现 ─> browser-use Hub
browser-use-domain ─┘  解析所选后端 ─> DSH 工具/设置
```

三个叶子包都依赖 Hub 契约。后端不依赖 Domain，Domain 也不导入具体后端。这样既能替换浏览器资源实现，又能保持唯一的 DSH 工具语义层。

## 分层所有权

- **Hub 拥有契约与身份。** 它定义 `BrowserUseBackend`、后端注册表、Hub 错误码和生命周期服务键推导；不执行浏览器 IO，也不注册模型工具。
- **Domain 拥有产品语义。** 它选择配置指定的后端，把后端目录转换为 DSH 工具定义，要求调用来自 Agent，管理工具超时，并转发浏览器设置。
- **Backend 拥有资源。** 它启动或连接浏览器、创建 owner 级运行时状态、执行工具，并在 release、重新配置或 close 时释放资源。
- **Bundle 拥有组合。** 仓库根 patch 决定启用哪些 Hub、Domain 和后端包，并提供初始配置。

## 激活流程

1. Hub 挂载 `ctx.browserUse`。
2. 已启用后端注入 Hub，以自身身份注册，并提供 `browserUse.backend.<name>`。
3. Domain 根据 `backend` 字段推导该生命周期键，并通过 `ctx.inject` 等待它。
4. 激活后，Domain 再按同一名称解析后端并注册其工具目录。
5. `agent/disposed` 释放 owner 级后端状态；插件销毁时注销并关闭后端。

这种服务驱动的激活方式可以避免注册竞态，而不让 YAML 行顺序承担加载语义。

## 组合示例

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

## 文档地图

- [仓库指南](../../README.zh.md)：安装、workspace 命令和内置 bundle。
- [Hub 参考](browser-use/README.zh.md)：后端契约与注册表错误。
- [Domain 参考](browser-use-domain/README.zh.md)：工具命名、设置和生命周期行为。
- [Chrome 后端参考](browser-use-chrome/README.zh.md)：地址发现与浏览器资源所有权。
- [Dege 占位参考](browser-use-dege/README.zh.md)：其有意保持不可用的状态。

## 开发

从仓库根目录运行验证，以便一起检查路径别名、Host bundle 与 Domain 客户端模块：

```powershell
pnpm typecheck
pnpm test
pnpm build
```
