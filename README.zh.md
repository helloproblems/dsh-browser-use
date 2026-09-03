---
description: "dsh-browser-use bundle 及其分层浏览器自动化包的仓库指南。"
kind: "repository"
---

# dsh-browser-use

[English](README.md) | 中文

## 概述

`dsh-browser-use` 通过参考 DeepSeek Harness storage 子系统的 Hub、Domain、Backend 分层，为 DSH 提供浏览器自动化能力。Hub 定义契约与具名后端注册表，后端包拥有浏览器资源，Domain 选择一个后端并把其工具发布给 DSH。仓库根目录只负责 workspace 与 bundle 装配；所有运行时源码都位于 `packages/browser-use/`。

## 包结构

| 目录 | 包 | 职责 |
|---|---|---|
| [`packages/browser-use/browser-use`](packages/browser-use/browser-use/README.zh.md) | `browser-use` | `ctx.browserUse` Hub、后端契约、注册表、生命周期服务键和稳定 Hub 错误 |
| [`packages/browser-use/browser-use-domain`](packages/browser-use/browser-use-domain/README.zh.md) | `browser-use-domain` | 选择后端、注册 DSH 工具、释放 Agent 资源并管理浏览器设置 |
| [`packages/browser-use/browser-use-chrome`](packages/browser-use/browser-use-chrome/README.zh.md) | `browser-use-chrome` | 基于 `chrome-devtools-mcp` 的 Chrome 后端，包括地址发现与 Agent 隔离上下文 |
| [`packages/browser-use/browser-use-dege`](packages/browser-use/browser-use-dege/README.zh.md) | `browser-use-dege` | 面向未来 Edge 后端的禁用占位包；当前不是可工作的浏览器实现 |

依赖方向与各层所有权见 [browser-use 包组地图](packages/browser-use/README.zh.md)。

## 架构

本家族把组合、语义和资源所有权分开：

1. `browser-use` 挂载 `ctx.browserUse`，并提供名称到后端的注册表；它不执行浏览器 IO。
2. 后端插件注入 Hub，注册实现，并发布仅用于生命周期同步的 Cordis 服务 `browserUse.backend.<name>`。
3. `browser-use-domain` 等待配置指定的生命周期服务，通过注册表解析后端，再把稳定工具目录注册到 `ctx.tools`。
4. 工具执行时把发起调用的 Agent 对象作为不透明 owner 传给后端，从而在共享浏览器连接上隔离各 owner 的上下文。
5. 设置变更转发给后端；Agent 销毁只释放该 Agent 的资源，插件销毁则关闭整个后端。

激活由 Cordis 服务可用性驱动。YAML 行顺序只服务于阅读，不承担同步语义。

## Bundle

根包名为 `dsh-browser-use`。其 [`cordis.patch.yml`](cordis.patch.yml) 默认挂载 Hub、Chrome 后端和 Domain，并保持未来的 Dege 后端禁用。

| 行 | 默认状态 | 主要配置 |
|---|---|---|
| `browser-use` | 启用 | 无 |
| `browser-use-chrome` | 启用 | `toolCallTimeoutMs: 120000` |
| `browser-use-domain` | 启用 | 后端 `chrome`、显示 Chrome、自动发现、120 秒工具超时 |
| `browser-use-dege` | 禁用 | 仅占位 |

实际 DSH 工具超时由 Domain 配置拥有。浏览器连接设置同样由 Domain 管理，并转发给选中的后端。

## 环境要求

- Node.js `^22.19.0` 或 `>=24.0.0`
- pnpm `11.7.0`
- 兼容的 DeepSeek Harness 安装
- Google Chrome，或可访问的 Chrome 远程调试地址

## 开发

所有命令都在仓库根目录执行：

```powershell
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm pack --dry-run
pnpm pack:bundle
```

workspace 模式为 `packages/*/*`。测试跟随所属 package 存放，`scripts/build.mjs` 会生成四个 Host bundle 和 Domain 客户端模块。`pnpm pack --dry-run` 只预览普通 package 内容，不会生成文件。

## 安装到 DSH

本仓库不提供 `dsh` 可执行文件。插件管理要求 `PATH` 中存在 pnpm，并且已经安装 DSH CLI，或者准备好一个可从源码运行的 `deepseek-harness` checkout。

### 通过源码目录安装

先构建本仓库，再使用已安装的 CLI 添加仓库根目录：

```powershell
pnpm build
dsh plugin --profile web add .
```

如果从源码运行 DSH，请先在 `deepseek-harness` checkout 中执行 `pnpm install` 和 `pnpm run build`，然后调用其根目录的 `dsh` script，并把本仓库作为绝对 `file:` spec 传入：

```powershell
cd C:\path\to\deepseek-harness
pnpm dsh plugin --profile web add file:C:/path/to/dsh-browser-use
```

### 通过打包产物安装

在本仓库中创建可供本地单文件安装的 tarball：

```powershell
pnpm install
pnpm pack:bundle
```

该命令会构建 workspace，把四个运行时包作为 bundled dependencies 放入根包，并生成：

```text
.artifacts/pack/dsh-browser-use-0.3.0.tgz
```

使用已安装的 CLI 添加该 tarball：

```powershell
dsh plugin --profile web add file:C:/path/to/dsh-browser-use/.artifacts/pack/dsh-browser-use-0.3.0.tgz
```

也可以使用 `deepseek-harness` 源码 checkout 中的 CLI：

```powershell
pnpm --dir C:\path\to\deepseek-harness dsh plugin --profile web add file:C:/path/to/dsh-browser-use/.artifacts/pack/dsh-browser-use-0.3.0.tgz
```

本地尚未发布的安装应使用 `pnpm pack:bundle`。普通 `pnpm pack` 会把 `workspace:^` 依赖改写为 registry 版本范围，因此只有配置的 registry 中已经存在匹配版本的 `browser-use`、`browser-use-domain`、`browser-use-chrome` 和 `browser-use-dege` 时，普通根包 tarball 才能安装。

`pnpm dsh` 只在 `deepseek-harness` 源码根目录生效，因为该 package 定义了对应 script；它不能在本插件仓库中运行。添加、移除或更新 bundle 后，需要重启正在运行的 `web` profile。

## 已知限制

- Chrome 是当前唯一可工作的后端。`browser-use-dege` 只注册空占位实现，并默认禁用。
- 共享设置契约目前把 `browserType` 固定为 `chrome`。
- Chrome 实现依赖 `chrome-devtools-mcp@1.8.0` 的内部模块；升级该依赖时必须重新验证兼容性。
- 浏览器状态只存在于当前进程，Host 重启后不会恢复。
- 当前测试覆盖 Hub 注册表、Chrome 地址发现和 schema 转换，但 CI 不会启动真实浏览器。

## 许可证

[MIT](LICENSE)
