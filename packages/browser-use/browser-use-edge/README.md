---
description: "已禁用的 browser-use-edge 占位后端状态与维护者参考。"
kind: "package-reference"
---

# browser-use-edge

[English](README.md) | 中文

## 概述

`browser-use-edge` 为未来 Microsoft Edge 实现预留独立 package 与后端身份。它目前会注册后端 `edge` 和生命周期服务 `browserUse.backend.edge`，但只暴露空工具目录，不分配浏览器资源，忽略设置，并拒绝直接执行。内置 `dsh-browser-use` bundle 保持该包禁用。

本包不能被视为可工作的 Edge 集成。

## 当前行为

| 契约成员 | 当前实现 |
|---|---|
| `browserType` | `edge` |
| `tools()` | 返回空数组 |
| `execute()` | 以占位错误拒绝 |
| `release()` | 空操作 |
| `reconfigure()` | 已 resolve 的空操作 |
| `close()` | 已 resolve 的空操作 |
| 注册表身份 | `edge` |
| 生命周期服务 | `browserUse.backend.edge` |

如果手动启用本后端并让 `browser-use-domain` 选择它，Domain 可以激活，但由于目录为空，不会注册任何浏览器工具。

## Bundle 状态

根 patch 声明了本包，但禁用其行：

```yaml
- id: browser-use-edge
  name: browser-use-edge
  disabled: true
```

在它真正拥有 Edge 连接、工具目录、owner 上下文和清理行为之前，用户组合也应保持禁用。

## 预期实现边界

未来实现应保持在现有后端契约内：

1. 构建稳定且兼容 Edge 的工具目录。
2. 连接或启动 Edge，不把浏览器 IO 放进 Hub 或 Domain。
3. 按不透明 owner 对象隔离运行时状态。
4. 通过 `release(owner)` 释放单个 owner 的状态。
5. 通过 `reconfigure(settings)` 应用 Domain 设置。
6. 插件销毁时先注销，再关闭全部资源。

如果 Edge 需要当前 Chrome 形状 `BrowserUseSettings` 无法表达的设置，应显式演进共享 Hub 契约与 Domain 设置 schema，而不是增加隐藏的后端私有行为。

## 实现地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 占位后端类、Hub 注册和生命周期服务发布 |

## 模型体验

内置 bundle 中本包禁用，因此没有模型体验。即使手动启用并选中，空目录也会使 Domain 不注册工具，并且不会注入任何提示词文本。

## 已知限制

- 不会启动或连接 Edge 进程。
- 没有任何浏览器工具。
- 直接执行始终拒绝。
- 设置与 owner 生命周期调用都是空操作。
- 当前没有本包专属测试。

## 相关文档

- [包组地图](../README.zh.md)
- [Hub 后端契约](../browser-use/README.zh.md)
- [Domain 参考](../browser-use-domain/README.zh.md)
- [可工作的 Chrome 后端](../browser-use-chrome/README.zh.md)
- [仓库指南](../../../README.zh.md)
