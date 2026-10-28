# Changelog

本项目的所有重要变更都记录在此文件。

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

暂无。

## [0.1.6] - 2026-10-28

首次 npm 公开发行，正式包名为 @codewei823/dsh-model-picker-2level；运行功能沿用 v0.1.5 基线。

### Changed

- 为公开仓库整理 README、用户指南、测试、架构与路线图；历史材料归档并移除当前文件中的本机路径及无关 profile 调整记录。
- 修正 EditorConfig、安全边界、版本获取方法和 UI 国际化贡献约定。
- 核实 DSH 运行时 0.2.1-rc.3 并添加精确 engines.dsh 声明；补齐正式包名、公开仓库元数据与 public 发布配置；插件市场上架单独跟进。
- 扩充 Windows / Ubuntu CI，增加相对文档链接和真实安装包检查；当前文档随包交付，历史归档不进入安装包。

## [0.1.5] - 2026-10-27

基本功能定稿：完成第一轮审视与修复，用户确认核心功能、常见失败恢复及简化键盘操作验收通过。自动化 59 项在 Node 20 / 22 / 24 下通过。

### Fixed

- 键盘操作收敛为 ↑↓ 移动、Enter 打开或确认、Esc 先清搜索再返回；删除 Tab 返回与 ↓ 打开，阻止空格激活按钮，保留搜索框空格输入和 Tab / Shift+Tab 原生行为。
- 搜索输入框方向键因事件冒泡被执行两次，按钮 Enter 被菜单截获。
- 目录不可用时保留紧凑触发按钮，将诊断移入弹层；手动重试重新启动解析，并清理退避定时器。
- 思考强度只在写回成功后记忆，不再记住被宿主拒绝的选择；失去推理能力的模型不携带过期强度。
- 会话切换时重新绑定目录，隔离旧订阅与异步请求；旧请求完成不再关闭新打开的菜单。
- 连续点击提交互斥；子代理会话恢复禁用按钮。
- 搜索框鼠标定位和诊断文本选择不再被全局 mousedown.preventDefault 阻止。
- npm 测试入口改用跨平台默认发现，修正 .npmrc 的 INI 格式。

### Added

- 真实 React + jsdom 交互回归测试、开发依赖锁文件，以及 Node 24 CI；校验脚本实际解析客户端 JS 语法。
- 用户操作与验收手册、代码审视报告、v0.1.5 定稿存档。

## [0.1.4] - 2026-10-27

### Fixed

- **第三方供应商的思考强度被重置为「供应商默认」**：会话只记住「当前在用模型」的
  `reasoningEffort`，切换走再切回时旧代码回落到模型默认值。现在新增按
  `provider/model` 记忆的表 `effortMemory`：
  - 显式选择强度时记录；
  - 选择模型时把实际提交的强度一并记录；
  - 会话实际生效的强度会同步回记忆（跨会话也能恢复）。
  `resolveEffort()` 的优先级改为：当前模型在用强度 → 记忆值 → 模型默认值。
  记忆值 `undefined` 表示用户显式选了「供应商默认」，此时载荷**省略**该字段。
- **点击弹层外部不关闭**：新增文档级 `pointerdown`（capture）监听，
  命中 `menuRef`（弹层在 body portal 中）或 `rootRef`（按钮自身）时忽略，
  其余位置调用 `closeMenu()`；卸载时移除监听。

### Added

- 4 项回归测试：强度记忆跨切换恢复、显式默认值语义、记忆按 provider 隔离、
  外部点击关闭的三处包含性判断。

## [0.1.3] - 2026-10-27

### Fixed

- **二级列表总是显示「当前使用的供应商」**：`browsingGroup` 原先从 `currentGroup`
  （会话正在使用的供应商）推导，导致点击任何供应商第二级都只显示在用的那一家。
  现在引入独立的 `browsingGroupId` 状态，浏览目标与使用状态彻底解耦；
  返回一级、关闭菜单、重新打开时清空该状态。逻辑抽为纯函数
  `resolveBrowsingGroup()` 以便单测（3 项回归测试）。
- **窗口最大化后菜单错位漂移**：`measure()` 只在打开时计算一次坐标。现在菜单
  打开期间监听 `window resize`、`scroll`（capture 捕获祖先滚动）与
  `visualViewport resize`，并用 `requestAnimationFrame` 合并到每帧最多一次重算，
  组件卸载时移除监听并取消待执行的帧。

## [0.1.2] - 2026-10-27

### Fixed

- **`cannot get property "remote" without inject`**：这是「模型目录不可用」的真正根因。
  内置 `ModelDirectoryResolver.directoryFor()` 在构造目录时会读
  `this.ctx.remote.session`；Cordis 服务面在调用方上下文中被重新绑定，因此调用方
  必须**同样注入 `remote` / `remote.session`**。本插件的 `ctx.inject` 依赖集已从
  `['slots','modelDirectories','sessions']` 扩展为
  `['slots','modelDirectories','sessions','remote','remote.session']`。
- 所有能力探测（`sessions.subagentAddress`、`models.directoryFor`、`directory.store`）
  各自独立 try/catch：Cordis 服务面是 Proxy，连 `typeof face.method` 都会抛错，
  不能让单个不可读能力拖垮整个座位。
- `inject` 同时接受 `sessionId` 字符串与 `{ sessionId | id }` 对象载体。
- 不可用时按钮不再 `disabled`，点击可展开诊断面板显示完整错误文本与重试按钮。

## [0.1.1] - 2026-10-27

### Fixed

- **模型按钮显示「选择模型」且无法点击**：根因是从不在挂载时预热模型目录，
  `store` 快照始终为空，`current` 为 `null`，按钮落到空态文案。
  现在目录解析成功即调用 `load()` 预热，并把「无快照」正确归为加载态。
- **`directoryFor()` 过早调用导致永久禁用**：该调用可能在会话 binding 尚未
  建立时抛错，旧实现静默降级为 `available: false`，按钮变成死按钮。
  现在改为**延迟解析 + 最多 8 次退避重试**（300ms 起，逐次加长）。
- 失败原因可见：不可用时按钮文案与 `title` 显示真实原因，不再只是
  「模型目录不可用」这一句；连续 8 次失败会打一条 `console.warn`。
- 副作用依赖修正：重试 effect 的依赖从整个 `props` 收敛为 `props.resolve`，
  避免每次渲染重置重试计数。

### Added

- 中文「加载模型…」/ 英文「Loading models…」短文案（加载中显示，避免误认为空态）。

## [0.1.0] - 2026-10-27

### Added

- 两级模型选择器：一级供应商、二级模型
- 保留跨供应商搜索（一级）+ 本家搜索（二级）
- 打开时自动聚焦当前使用项；列表保持配置顺序
- 生效范围：`conversation.input.model` 座位，复用内置 `modelDirectories` 服务
- 21 项纯函数单测（`test/pure.test.mjs`）
