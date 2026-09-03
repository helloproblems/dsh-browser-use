# browser-use

DSH 浏览器自动化插件，按 `deepseek-harness` 的 storage 架构拆分为 Hub、Domain 和可替换 Backend。

> 项目及包名按当前约定使用 `browser` / `dege` 拼写。

## 包结构

所有运行时包统一位于 `packages/browser-use/`，仓库根目录只保留 workspace、构建脚本和 DSH bundle，不再承载 `src`。

| 目录 | 包 | 职责 |
| --- | --- | --- |
| `packages/browser-use/browser-use` | `browser-use` | Hub 服务 `ctx.browserUse`、命名 backend registry、共享契约和 lifecycle service key。自身不操作浏览器。 |
| `packages/browser-use/browser-use-domain` | `browser-use-domain` | 选择 backend，注册 DSH 工具，管理 settings、session 释放和“浏览器自动化”设置页。 |
| `packages/browser-use/browser-use-chrome` | `browser-use-chrome` | Chrome backend；托管 `chrome-devtools-mcp`、全局浏览器单例、地址发现和 per-session page context。 |
| `packages/browser-use/browser-use-dege` | `browser-use-dege` | 未来 Edge backend 的独立包边界；bundle 中默认禁用。 |

组合顺序与 storage 相同：Hub 先提供 registry，backend 注册并发布 lifecycle service，Domain 等待指定 backend 激活后再注册工具。

Hub 包内部也遵循 storage hub 的边界：`backend.ts` 定义纯契约，`error.ts` 定义稳定错误码，`registry.ts` 管理命名 backend，`index.ts` 仅负责 Cordis Service 装配和公共导出。

## Chrome 行为

- 一个 Host 进程共享一个 Chrome/Puppeteer 连接。
- 每个 DSH session 创建独立 `McpContext` 和隔离页面。
- session 销毁时释放对应 context。
- 设置变化时 Domain 通知 backend 重建浏览器连接。
- 地址发现顺序：配置地址、`DevToolsActivePort`、本机 `9222-9229`，最后自动启动 Chrome。

## 开发

```powershell
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm pack --dry-run
```

## 安装

```powershell
pnpm dsh plugin --profile web remove dsh-chrome-devtools
pnpm dsh plugin --profile web add C:\Users\ZK-xuyandong\xyd-workspace\dsh-browser-use
```

根包 `dsh-browser-use` 是 bundle 装配包；它的 `cordis.patch.yml` 会挂载 Hub、Chrome backend 和 Domain。`browser-use-dege` 已声明但默认禁用。
