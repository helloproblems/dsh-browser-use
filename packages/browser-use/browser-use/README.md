---
description: "面向组合方与后端实现者的 browser-use Hub 参考，涵盖 ctx.browserUse 与具名后端注册表。"
kind: "package-reference"
---

# browser-use

[English](README.en.md) | 中文

## 概述

`browser-use` 是浏览器自动化 Hub。它挂载 `ctx.browserUse`，定义面向后端的 TypeScript 契约，维护具名后端注册表，推导仅用于生命周期同步的 Cordis 服务键，并暴露稳定的 Hub 错误码。它不拥有浏览器进程、页面、模型工具、设置文档或 Agent 状态；这些职责分别属于具体后端与 Domain 层。

## 使用本包

在任何 browser-use 后端或 Domain 包之前挂载 Hub：

```yaml
- name: browser-use
- name: browser-use-chrome
- name: browser-use-domain
  config:
    backend: chrome
```

单独挂载 Hub 不会产生模型可见行为。后端负责注册实现，Domain 再把该实现的工具目录转换为 DSH 工具。

## 公共 API

| 导出 | 用途 |
|---|---|
| `BrowserUse` | 挂载为 `ctx.browserUse` 的 Cordis `Service` |
| `BackendRegistry` | 可变的名称到 `BrowserUseBackend` 注册表 |
| `BrowserUseBackendRegistry` | `BackendRegistry` 的弃用兼容别名 |
| `BrowserUseBackend` | 后端生命周期与执行契约 |
| `BrowserUseSettings` | Domain 转发给后端的设置快照 |
| `BrowserUseTool` | 后端本地工具元数据和 JSON Schema |
| `BrowserUseResult` | JSON 安全的 MCP 风格工具结果 |
| `BrowserUseError` | 带稳定 `code` 判别字段的 Hub 错误 |
| `browserUseBackendServiceKey(name)` | 返回用于激活同步的 `browserUse.backend.<name>` |

### 注册表行为

```ts
const unregister = ctx.browserUse.backend.register('custom', backend)
const selected = ctx.browserUse.backend.get('custom')
const names = ctx.browserUse.backend.names()
unregister()
```

`register()` 返回只移除本次注册的 disposer。它有意不关闭后端；关闭责任属于提供方插件，后者应先注销，再调用 `backend.close()`。旧 disposer 不会误删后来复用同一名称的新注册。

### 稳定 Hub 错误

| 代码 | 含义 | 恢复方式 |
|---|---|---|
| `duplicate-backend` | 该名称已经注册 | 修正组合，确保一个名称只有一个提供方 |
| `backend-not-found` | 请求的名称没有对应后端 | 挂载提供方，并在解析前注入其生命周期服务 |

消费方可以根据 `BrowserUseError.code` 分支处理。错误消息只是诊断文本，不是稳定的解析接口。

## 后端契约

后端实现必须提供：

- 稳定的 `browserType` 命名空间，用于生成公开工具名。
- 由 `tools()` 返回的稳定工具目录；Domain 在激活时读取一次。
- `execute(owner, toolName, args)`，返回可无损 JSON 序列化的结果。
- 幂等的 `release(owner)`，只移除该 owner 的状态。
- `reconfigure(settings)`，应用最新设置快照，并可按需重建共享资源。
- 幂等异步 `close()`，在所有后端资源释放后 resolve。

`owner` 对象是不透明身份。后端可以用对象身份作为键，但不应序列化或保留无关的 Agent 内部数据。

### 提供方模式

```ts
export const inject = ['browserUse']

export function apply(ctx: Context): void {
  const backend = createBackend()
  ctx.effect(() => {
    const unregister = ctx.browserUse.backend.register('custom', backend)
    return async () => {
      unregister()
      await backend.close()
    }
  })
  ctx.provide(browserUseBackendServiceKey('custom'), backend)
}
```

生命周期服务让 Domain 能等待注册完成，但该服务值不是业务 API；运行时查找仍通过 Hub 注册表完成。

## 实现地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | `BrowserUse` 服务、公共导出和生命周期键推导 |
| [`src/backend.ts`](src/backend.ts) | 后端、设置、工具与结果的规范性契约 |
| [`src/registry.ts`](src/registry.ts) | `BackendRegistry` 与旧 disposer 防护 |
| [`src/error.ts`](src/error.ts) | `BrowserUseError` 和稳定 Hub 错误码 |
| [`tests/registry.spec.ts`](tests/registry.spec.ts) | 注册表、错误、兼容别名与 Cordis 挂载测试 |

## 模型体验

Hub 不注册工具，也不注入提示词，因此不会直接增加任何请求 token。只有 `browser-use-domain` 注册后端工具目录后，模型才会看到浏览器能力。

## 已知限制

- Hub 会检查重复和缺失注册，但不校验后端名称，也不比较注册名称与 `backend.browserType`。
- 一个 Domain 激活周期内默认工具目录稳定；不支持动态修改目录。
- `BrowserUseSettings` 已接受 Chrome 与 Edge 标识，但在可工作的 Edge 后端提供前，内置设置页仍禁用 Edge。
- 注销永远不会自动关闭后端。提供方插件必须实现上面的生命周期模式。

## 相关文档

- [包组地图](../README.md)
- [Domain 参考](../browser-use-domain/README.md)
- [Chrome 后端参考](../browser-use-chrome/README.md)
- [仓库指南](../../../README.md)
