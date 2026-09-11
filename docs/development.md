# 开发指南

中文 | [English](development.en.md)

本仓库遵循 [DeepSeek Harness Development guide](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/development.md) 的 TypeScript 工程布局及源码、产物分离规则。Harness 专用的 Typert 生成、网站构建、翻译合并驱动和 vendor hooks 不适用于这个独立插件 bundle。

## 环境准备

使用 engines 范围内的 Node.js，通过 Corepack 使用固定的 pnpm 11.7.0。工具链、依赖和 checkout 应位于同一操作系统环境；Windows 与 WSL 分别安装依赖。

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm typecheck
```

## TypeScript 工程

| 配置 | 职责 |
|---|---|
| 根 tsconfig.json | 仅引用 Host 和 Client 的 solution 入口，不形成编译程序。 |
| tsconfig.base.json | 严格编译选项和 workspace 源码别名，不设置 files 或 include。 |
| tsconfig.base.client.json | React JSX、DOM 库，不自动引入 Node 全局类型。 |
| tsconfig.host.json | Host 测试及 Vitest 配置，引用四个 Host package 工程。 |
| tsconfig.client.json | Client 测试，引用 Domain 的 Client 工程。 |
| package 的 tsconfig.json | Host 编译配置；Domain 则仅作为 solution。 |
| Domain 的 tsconfig.host.json / tsconfig.client.json | 分别编译 Host 与 Client，维护独立增量记录。 |

Host 和 Client 独立编译，避免 Cordis Context 声明合并互相影响。聚合工程直接引用对应的 Domain leaf。Host 测试排除 tests/client，客户端测试放在该目录。

跨 package 使用包名，本地相对导入使用 .ts 扩展名。Vitest 从 tsconfig.base.json 读取 workspace 别名，测试无需 bundle 即可执行源码；静态检查不得把 workspace 导入指向 lib 产物。

Typecheck 遍历工程引用图，在各 package 的 lib/types 下生成 JavaScript、声明及 source map；聚合测试工程使用 noEmit。Build 先清理运行时产物，再编译两个端，将生成的 JavaScript 打包为 lib/index.js 和 Domain 的 loader 模块 lib/client.js。Package exports 的 types 条件指向声明，default 指向运行时 bundle。Clean 删除各 package 的 lib 和聚合工程的 .cache/typecheck 增量记录。

## 自动构建与热加载

在插件仓库运行 `pnpm dev`（等价于 `pnpm build:watch` 或 `pnpm build --watch`），在另一个终端的 deepseek-harness 仓库运行 `pnpm dsh web`。应先等插件完成初次构建，再启动 DSH。

watch 启动时执行一次完整清理和 TypeScript 编译，然后持续运行 `tsc -b --watch` 与五个 esbuild watcher。修改源码会更新 `lib/types`，再生成四个 Host 的 `lib/index.js` 和 Domain 的 `lib/client.js` loader 模块。监听阶段不会删除 lib；最终文件只在内容变化时通过临时文件原子替换，临时文件放在 `.cache/build`，不进入 HMR 目录。Ctrl+C 会关闭编译器和打包 watcher。

DSH 用户 patch 中启用 `hmr`，将四个 package 的 lib 目录加入 `config.root`，并启用 Web 的 `client-hmr`。例如 Windows checkout：

```yaml
- id: hmr
  disabled: false
  config:
    root:
      - 'C:/Users/xu_wa/xyd-workspace/dsh-browser-use/packages/browser-use/browser-use/lib'
      - 'C:/Users/xu_wa/xyd-workspace/dsh-browser-use/packages/browser-use/browser-use-chrome/lib'
      - 'C:/Users/xu_wa/xyd-workspace/dsh-browser-use/packages/browser-use/browser-use-domain/lib'
      - 'C:/Users/xu_wa/xyd-workspace/dsh-browser-use/packages/browser-use/browser-use-edge/lib'
    ignored:
      - '**/node_modules/**'
      - '**/.git/**'
      - '**/.cache/**'
    debounce: 200
```

按实际 checkout 调整路径。`pnpm build` 仍是一次性构建；watch 运行期间不要同时执行 clean 或 build。watch 中的编译错误会显示在终端，修复后自动继续；初次 TypeScript 编译失败则退出，需要修复后重新启动。

## 验证

根据变更范围运行检查。源码检查无需先构建：

```sh
corepack pnpm clean
corepack pnpm test
corepack pnpm typecheck
```

修改 exports、声明生成或打包流程后，还需运行：

```sh
corepack pnpm build
node --test scripts/tests/build-watch.mjs
corepack pnpm pack --dry-run
corepack pnpm pack:bundle
corepack pnpm verify:bundle
```

默认测试包含真实 MCP 工具目录发现，不启动浏览器。浏览器交互测试通过 EDGE_SMOKE=1、CHROME_SMOKE=1 和 BROWSER_SWITCH_SMOKE=1 显式启用，要求安装对应浏览器。报告实际验证平台和跳过的检查。

修改 Windows 路径选择器后，在交互桌面运行 `node --test scripts/tests/windows-picker-smoke.mjs`。此检查会真实打开文件和文件夹对话框，验证可见性、前台激活、选择及取消，并自动关闭测试弹窗。

Bundle 打包使用唯一的系统临时目录，避免 pnpm 从 checkout 的父级 node_modules 收集依赖。归档包含四个 workspace package 及其声明，还有中英文开发指南。外部运行依赖和宿主 peer 依赖同时声明在 bundle 根 manifest 中，因为安装器不会遍历内嵌包的 manifest；版本范围冲突会阻止打包。无论打包成功还是失败都会删除暂存目录，归档写入 .artifacts/pack。

verify:bundle 在全新临时目录中安装该归档，使用 web profile 的 hoisted 布局并关闭自动 peer 安装，显式提供声明的宿主 peer 依赖，导入全部四个插件并检查两个 MCP 后端依赖，不启动浏览器。此检查需要访问 registry 或已有完整的 pnpm 缓存。

## 代码约定

保持严格检查开启，包括索引访问、精确可选属性、未使用声明和显式 override。编辑器使用 Remote JSON 前须校验数据；同进程的类型化调用保持静态类型，避免引入 any。Cordis 注册通过 effect 返回 disposer，浏览器资源由 provider 管理。

公开行为同步更新所属 README 和导出 API 的 JSDoc。FIXME 标记阻止发布的问题，TODO 标记近期工作，XXX 标记延期考虑项。文本文件以一个换行结束，交付前运行 git diff --check。
