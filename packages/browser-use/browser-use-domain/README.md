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
    userDataDir: ''
    sessionIsolation: false
    toolCallTimeoutMs: 120000
```

`backend` 指定初始浏览器类型对应的注册表身份。Domain 分别监听配置后端、Chrome 和 Edge 的生命周期服务，设置变更后选择对应实现。

## 配置

| 字段 | 默认值 | 含义 |
|---|---|---|
| `backend` | `chrome` | 初始浏览器类型对应的已注册后端 |
| `headless` | `false` | 仅在后端自行启动浏览器时隐藏窗口 |
| `browserType` | `chrome` / `edge` | 保存后动态切换后端 |
| `browserPath` | 空 | 浏览器可执行文件绝对路径；为空时启动阶段自动检索 |
| `userDataDir` | 空 | 浏览器用户数据目录绝对路径；为空时使用临时隔离模式，填写后保留登录状态等数据 |
| `sessionIsolation` | `false` | 数据隔离级别：`false` 为工作区，`true` 为会话 |
| `toolCallTimeoutMs` | `120000` | 应用于本 Domain 发布的每个 DSH 工具定义的超时 |

`backend` 与 `toolCallTimeoutMs` 属于组合配置。暴露给 DSH GUI 的设置命名空间包含 `headless`、`browserType`、`browserPath`、`userDataDir` 和 `sessionIsolation`。

修改用户数据目录或数据隔离级别会释放旧会话，下次调用时使用新配置；已有数据不会被删除。工作目录取自工具执行上下文的 `agent.session.header.cwd`，缺失时回退到 `process.cwd()`。路径规范化后计算 SHA-256，Windows 下忽略路径大小写。

开启 `sessionIsolation` 后，目录为 `<userDataDir>/workdirs/<工作目录哈希>/sessions/<chrome|edge>/<会话标识哈希>`。不同工作目录、会话和浏览器不共享数据，同一工作目录中的同一会话恢复后复用目录。没有会话 ID 的调用按 owner 对象分配随机标识，仅在进程内保持稳定。不会将原目录的登录数据复制到隔离目录。

选择“工作区”时使用 `<userDataDir>/workdirs/<工作目录哈希>/<chrome|edge>`，仍保持工作目录和浏览器隔离；同一目录同时只能供一个浏览器会话使用。目录留空时，无论隔离级别均继续按 Agent 使用临时隔离会话。DSH GUI 的“数据隔离级别”提供“工作区 / 会话”选项，兼容已有的 `sessionIsolation` 布尔配置。

## 工具发布

对于 `backend.tools()` 返回的每一项，Domain 注册一个 DSH 工具：

```text
mcp__<backend.browserType>__<backend-tool-name>
```

使用 Chrome 后端时，示例包括 `mcp__chrome__click` 和 `mcp__chrome__take_snapshot`。

每个定义保留后端描述和 JSON Schema，应用 `toolCallTimeoutMs`，并把对象输入转发给 `backend.execute()`。发起调用的 `Agent` 对象成为不透明 owner。没有 Agent 的调用会以 `browser-use tools require an initiating DSH session` 失败。

后端输出保留 MCP 风格的 `content` 数组和可选 `structuredContent`。DSH renderer 从 `content` 中提取文本块；没有文本块时显示 `(no textual output)`，同时仍把结构化结果保留为工具值。

## 设置行为

当 `ctx.settings` 可用时，Host 注册设置命名空间 `browser-use`。路径为空时自动发现所选浏览器，保留用户设置中的空值表示自动模式。类型变化会切换工具目录；同类型设置变化转发到当前后端。设置监听串行执行，失败记录 warning。

客户端模块注册的设置区域包含：

- Edge 使用 Playwright MCP；启用两个后端插件后，可通过设置页热切换浏览器。
- 无头模式开关。
- 可编辑的浏览器可执行文件位置与“选择”按钮，通过 DSH 选择安装目录后自动定位可执行文件。
- 浏览器用户数据目录与“选择”按钮，选择 DSH 所在电脑上的目录；取消保留原值，保存后应用。
- “数据隔离级别”下拉选项：工作区 / 会话，默认工作区。
- 通过 DSH settings remote API 完成的 revision 感知替换。

两个“选择”按钮均优先使用 `ctx.directoryPicker`。浏览器位置选择安装目录后，Windows 查找对应的 `chrome.exe` / `msedge.exe`（也支持安装目录下的 `Application` 子目录），macOS 支持应用包及其所在目录，Linux 查找对应的浏览器程序。找不到所选类型时保留原值并提示重新选择，也可手动填写完整文件路径。取消选择保留原值，选中后点击“保存”应用设置。

两个选择入口共用路径控件、请求生命周期及 `ctx.directoryPicker` 的 native 能力，与 DSH“添加工作区”使用同一个服务，原生名称与本机一致；服务报错不会改用另一个弹窗。仅在旧版宿主未提供该服务时使用插件的备用文件或目录选择器。

备用选择器读取客户端 `ctx.locale.getLocale().active`，缺失时使用 Windows 用户的显示语言；可用语言资源由 Windows 决定。Windows 备用实现使用独立 STA 线程中的 `IFileOpenDialog`，避免 PowerShell 主线程覆盖语言。等待期间原选择按钮变为“取消选择”，不新增提示行或改变按钮宽度；两分钟未完成会结束等待并恢复控件，离开设置页也会中止请求。浏览器文件单独验证可执行路径，用户数据目录单独验证文件夹。

## 生命周期

1. 插件注入 `browserUse` 与 `tools`。
2. 它分别监听配置后端、Chrome 与 Edge 的生命周期服务。
3. 服务可用后，解析后端并发送初始设置快照。
4. 设置切换后端时，注册新目录、注销旧目录并释放旧会话。
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
- Edge 使用 Playwright MCP；启用两个后端插件后，可通过设置页热切换浏览器。
- 后端工具目录在每次激活时只读取一次；设置变更不会增加或删除工具。
- 重新配置失败只是 warning，而不是插件不健康状态，因此后端无法连接时工具仍可能保持注册。
- 文本 renderer 忽略非文本内容块；调用方仍会收到原始结构化工具值。
- 设置客户端当前只包含中文界面文案。

## 相关文档

- [包组地图](../README.md)
- [Hub 参考](../browser-use/README.md)
- [Chrome 后端参考](../browser-use-chrome/README.md)
- [仓库指南](../../../README.md)

## 后端热切换

Chrome 与 Edge 插件同时挂载，浏览器类型设置决定活动工具目录。切换会等待已有调用完成、注销旧工具并释放旧 Agent 会话；旧工具引用会明确报错。目标后端不可用或配置失败时保留原工具目录并记录错误；目标插件挂载后自动重试。设置异步生效，保存成功不代表浏览器已启动，下一次工具调用才启动浏览器。`backend` 配置保留为初始浏览器类型的别名，其他类型按名称解析。

设置 `BROWSER_SWITCH_SMOKE=1` 可运行本机浏览器测试：同一进程依次在 Edge、Chrome、Edge 中执行导航。
