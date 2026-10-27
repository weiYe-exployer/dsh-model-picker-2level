# 开发任务清单（TASKS）

> **这份文档的目的**：让任何一个 AI 或开发者，只读项目空间里的内容就能接手并完成整个项目。
> 每条任务都写明了**做什么、在哪做、怎么算做完、依赖谁**。
>
> 项目路径：`D:\vibe_coding\dsh-plugin-develop`
> 建立日期：2026-10-27
> 当前阶段：**v0.1.4 已存档，核心功能实测通过**；剩余为打磨项（T-41~T-45、T-55）

---

## 0. 接手前必读（新 AI 从这里开始）

按顺序读完这四份，再动手：

| 顺序 | 文件 | 读它是为了知道 |
|---|---|---|
| 1 | [README.md](../README.md) | 项目是什么、结构、如何校验 |
| 2 | [releases/v0.1.4.md](releases/v0.1.4.md) | **当前存档**：架构事实、代码地图、验证方法、已知限制、踩坑 |
| 3 | [m2-implementation.md](m2-implementation.md) | M2 实现记录与 0.1.1~0.1.4 修复记录 |
| 4 | [design.md](design.md) | 完整设计方案：座位机制、数据流、交互、UI、Config、风险 |
| 5 | [decisions.md](decisions.md) | 关键决策及其理由（**不要推翻，除非有新证据**） |

然后确认环境：

```powershell
# 宿主版本（设计基于此版本，其它版本需重新核对 API）
Get-Content "D:\apps\DeepSeek Harness\version"          # 期望 44.7.0

# 项目自检（必须双绿）
cd D:\vibe_coding\dsh-plugin-develop
node scripts/validate.mjs                                # 期望 ok
node test/pure.test.mjs                                  # 期望 29 pass / 0 fail
node test/package.test.mjs                               # 期望 8 pass / 0 fail
```

> **环境注意**：本机 `npm test` 可能因沙箱禁止派生子进程而报 `spawn EPERM`。
> 此时改用 `node test/package.test.mjs` 直接执行，效果等价。CI 环境无此问题。

### 现状快照（2026-10-27）

- 宿主：DeepSeek Harness **44.7.0**，profile `desktop`
- 用户真实配置：**4 家供应商**
  - `zai-coding-cn`：**未显式列出模型**，由 DSH 内置定义提供 4 个（`glm-5.3` / `glm-5.3-flash` / `glm-5.3-highspeed` / `glm-4.6v`）
  - `qiniu`：6 个显式模型
  - `lyrouter`：21 个显式模型
  - `kimi-api`：2 个显式模型
  - 即：**配置里 29 个 + 内置补充 4 个 = 界面实际约 33 个模型**
- 项目状态：**v0.1.4 功能可用**，两级选择、搜索、思考强度记忆、外部关闭、窗口跟随均已实测通过
- 已初始化 git 仓库并打 tag `v0.1.4`
- 存档文档：[releases/v0.1.4.md](releases/v0.1.4.md)

> ⚠️ 核对数据时注意区分「配置里的显式模型」与「界面实际可选模型」：像 `zai-coding-cn` 这类走内置目录的供应商，模型不在 `cordis.patch.yml` 里，但会出现在界面上。验证数量时以运行时 `groups` 为准，不要只数配置文件。

### 铁律（违反会返工）

1. **不 require 任何 `@deepseek-ai/dsh-client-*` 包** —— 宿主升级会炸。需要激活顺序时只用 `package.json` 的 `dsh.client.inject`（只排序，不 import）
2. **不写死颜色** —— 只用 `--dsw-alias-*` 主题令牌
3. **不自建模型状态** —— 全部走内置 `modelDirectories` 服务，选中项永远读 `directory.current`
4. **不动工作区外的文件** —— 除 `D:\vibe_coding\dsh-plugin-develop` 和安装插件本身
5. **不改用户 profile 的既有配置** —— 安装插件用 `plugin_manager` / `dsh plugin add`，不要手写 `cordis.patch.yml`

---

## 1. 阶段总览与依赖图

```
阶段 A 已完成 ─► 阶段 B 验证 ─► 阶段 C 实现 ─► 阶段 D 打磨 ─► 阶段 E 发布
  T-00..T-13      T-20..T-23      T-30..T-38      T-40..T-46      T-50..T-56
                                    ▲   │
                                    └───┴─ A 不可行则切 T-24（B 方案）
```

**关键路径**：`T-20 → T-21 → T-22 → T-30 → T-31 → T-32 → T-40`

| 阶段 | 任务区间 | 目标 | 出口标准 |
|---|---|---|---|
| A. 项目初始化 | T-00 ~ T-13 | 骨架、文档、CI、校验 | `validate` 与 `test` 双绿 |
| B. 技术验证 | T-20 ~ T-24 | 证明 A 方案可行 | spike 结论明确（A 可行 / 转 B） |
| C. 核心实现 | T-30 ~ T-38 | 两级选择器可用 | 能在真实界面切换模型 |
| D. 打磨 | T-40 ~ T-46 | 体验与健壮性 | 键位、错误态、i18n、无障碍全通过 |
| E. 发布 | T-50 ~ T-56 | 可分发 | 有 tag、有 CHANGELOG、可安装说明 |

---

## 2. 阶段 A：项目初始化（✅ 全部完成）

> 这些任务已完成，列出来是为了让接手者知道**已有资产**，不必重做。

### T-00 ✅ 建立项目骨架

- **产物**：`package.json`、`cordis.patch.yml`、`index.js`、`client.js`、`icon.svg`、`locale/`
- **验收**：`node scripts/validate.mjs` 通过
- **依赖**：无

### T-01 ✅ 编写设计方案

- **产物**：[docs/design.md](design.md)（12 章）
- **内容**：座位机制实测结论、A/B 方案对比、交互规格、数据流、UI 规格、Config、风险、验证计划
- **依赖**：无

### T-02 ✅ 编写 M1 验证方案

- **产物**：[docs/m1-spike-plan.md](m1-spike-plan.md)
- **内容**：4 个验证项（V1~V4）、判定标准、若失败的三条退路、记录表
- **依赖**：T-01

### T-03 ✅ 记录架构决策

- **产物**：[docs/decisions.md](decisions.md)（ADR-0001/0002/0003）
- **依赖**：T-01

### T-04 ✅ 生成效果图

- **产物**：`docs/assets/model-picker-2level.png`（A 方案）、`docs/assets/model-picker-plan-b.png`（B 方案）
- **依赖**：T-01

### T-05 ✅ 编写校验脚本

- **产物**：`scripts/validate.mjs`
- **检查项**：manifest 字段、promised files、client 注册形式与 id 一致、patch 形状、locale 必填键、icon 是 SVG、未 require 宿主包
- **依赖**：T-00

### T-06 ✅ 编写结构测试

- **产物**：`test/package.test.mjs`（8 项）
- **依赖**：T-00

### T-07 ✅ 配置 CI

- **产物**：`.github/workflows/ci.yml`（Node 20/22 矩阵）
- **依赖**：T-05、T-06

### T-08 ✅ 编写贡献指南

- **产物**：`CONTRIBUTING.md`（开发环境、校验、代码约定、提交规范）
- **依赖**：T-01

### T-09 ✅ 编写安全策略

- **产物**：`SECURITY.md`（含插件安全边界声明）
- **依赖**：无

### T-10 ✅ 编写 CHANGELOG

- **产物**：`CHANGELOG.md`（Keep a Changelog 格式，含 `[Unreleased]`）
- **依赖**：无

### T-11 ✅ 添加 LICENSE（MIT）

- **产物**：`LICENSE`
- **依赖**：无

### T-12 ✅ 添加 .gitignore / .editorconfig / .npmrc / .nvmrc

- **依赖**：无

### T-13 ✅ 编写 issue / PR 模板

- **产物**：`.github/ISSUE_TEMPLATE/{bug_report,feature_request,config}.yml`、`.github/PULL_REQUEST_TEMPLATE.md`
- **依赖**：无

---

## 3. 阶段 B：技术验证（✅ 已完成，结论：A 方案可行）

> 本阶段目的：证明 A 方案技术上成立。**2026-10-27 实测通过。**

### T-20 ✅ 执行 M1 Spike

- **结果**：**通过。重启应用后红色 `SPIKE` 按钮出现，我们的注册成为 winner**
- **实测记录**：[m1-spike-result.md](m1-spike-result.md)
- **依赖**：T-00~T-13

### T-21 ✅ 判定：注册顺序能否抢占

- **结果**：**能。**后激活的插件注册排在前面，成为 `entriesOfSlot()[0]`
- **产出**：[decisions.md ADR-0004](decisions.md)、[ADR-0005](decisions.md)
- **依赖**：T-20

### T-22 ✅ 跳过（无需抢占手段）

V1 直接通过，**不需要**尝试 priority 参数、Config 开关或调整激活顺序。

### T-23 ✅ 卸载 spike 并确认可撤销

- **做什么**：移除探针插件 → 重启应用 → 确认界面回到内置选择器
- **验收**：模型按钮恢复内置行为；`/model` 命令仍在
- **依赖**：T-20（已完成）
- **注意**：验证"插件可撤销"这一质量属性，**不可跳过**

### T-24 ✅ 不需要（A 成立，不切 B）

---

## 3.1 ⚠️ M1 实测得出的三条强制规则

以下规则由 T-20 实测得出，**后续所有任务必须遵守**（详见 [decisions.md ADR-0004](decisions.md)）：

| # | 规则 | 原因 | 违背后果 |
|---|---|---|---|
| **R1** | **判断 winner 只能用实际渲染结果**，不能看 `Slots.listSubTree` 的 `occupants` | 实测中 `occupants` 始终只显示内置一条（`registrant: "Gb", priority: 0`），**尽管界面渲染的是我们的组件** | 会误判"注册失败"，浪费大量排查时间 |
| **R2** | **子 Slot 必须由 winner 重复声明**：`children: { 'conversation.input.model.label': { kind: 'single', scope: 'session', inline: true } }` | 单例 Slot 的 children 来自 winner 的注册参数；不声明则内置的 `label` 声明消失（实测确认） | **静默回归**：界面看不出异常，但第三方插件注册失效且难排查 |
| **R3** | **改 `client.js` 后必须重启整个应用**才能验证 | 桌面端无热更新，`dsh.client` 模块只在页面 boot 时加载 | 改了代码看不到效果，误以为代码没生效 |

> R3 的推论：核心纯函数应抽到独立模块做单测（见 [ADR-0005](decisions.md)），避免每次都靠重启验证。

### T-24 ✅ 不需要（A 方案成立，不切 B）

原计划：若 A 不可行则改注册 `conversation.input.left`、按钮从"替换"改为"新增"。实测已确认 A 可行，此任务作废，保留条目仅为记录决策路径。

---

## 4. 阶段 C：核心实现（✅ 已完成并实测通过）

> **2026-10-27 完成**：T-30 ~ T-38 一次性实现，`client.js` 从占位组件升级为完整两级选择器（862 行）。
> 纯函数抽到 `__pure` 面供 node 单测（ADR-0005），`test/pure.test.mjs` 21 项全绿。
> ⏳ **待用户重启应用后做真机验证**（规则 R3：桌面端无热更新）。

### T-30 ✅ 读取并封装目录数据

- **做什么**：从 `modelDirectories` 服务取 `groups` / `current` / `failures` / `status`，封装成组件可用的形态
- **关键 API**（已核实，见 design.md §6）：
  ```js
  const models = ctx.get('modelDirectories')          // 或经 slot inject 传入
  const dir = models.directoryFor(sessionId)
  dir.store        // 快照 store，订阅用
  dir.load()       // 打开时触发加载
  dir.select({ provider, model, reasoningEffort? })   // 写回，返回 { ok } | { ok:false, error }
  ```
- **数据形状**：
  ```
  groups: [{ id, name, models: [{ id, name, reasoning? }] }]
  failures: [{ id, name, message }]
  current: { provider, model, reasoningEffort? } | null
  ```
- **务必**：
  - 用 `useSyncExternalStore` 订阅 `dir.store`
  - **不要** fold 会话事件、不要轮询
  - 供应商排序用内置的 `orderModelProviders` 语义（`deepseek-account` 第一、`deepseek-official` 第二，其余保持原序）
  - `deepseek-account` 显示名走 locale（「DeepSeek 账号」）
- **验收**：控制台能打印出 4 家供应商与各家的模型数（`zai-coding-cn` 的模型由内置补充，配置里看不到但运行时会有）
- **依赖**：T-21（或 T-24）
- **预计**：30 分钟

### T-31 ✅ 实现触发按钮

- **做什么**：模型按钮本体（图标 + `供应商 / 模型` 文本 + 可选 effort 标签 + chevron）
- **规格**：见 design.md §7 —— 高度 28px、字体 13px、圆角、hover 底色、展开态 chevron 旋转 180°
- **关键**：`--dsh-composer-model-text-display` / `--dsh-composer-model-icon-display` 两个 CSS 变量必须尊重（宿主在空间不足时会设置它们来控制紧凑显示）
- **验收**：与内置按钮视觉一致（截图对比）
- **依赖**：T-30
- **预计**：30 分钟

### T-32 ✅ 实现一级：供应商列表

- **做什么**：弹层第一级
- **规格**（design.md §5.1 / §7）：
  - 每行：供应商 id + 中文别名 + `N 个模型` + 右侧 chevron
  - 当前所属行：浅品牌底 + 「当前使用」标记 + **打开时自动聚焦并滚动到可见**
  - 排序：**严格按配置顺序**，当前项只强调不置顶
  - 行高 56~62px
- **验收**：点按钮 → 看到 4 行供应商，当前行高亮且有「当前使用」标
- **依赖**：T-31
- **预计**：45 分钟

### T-33 ✅ 实现二级：模型列表

- **做什么**：点供应商进入的第二级
- **规格**：
  - 顶部「‹ 返回 + 供应商名 + N 个模型」
  - 每行：模型 id（**等宽字体**）+ 右侧勾选
  - 当前模型：品牌色 + 勾 + **自动滚动到可见**
  - 排序：配置顺序，不置顶
  - 行高 32px
- **验收**：点 lyrouter → 看到它的 21 个模型，当前项打勾并已滚动到可视区
- **依赖**：T-32
- **预计**：40 分钟

### T-34 ✅ 实现选择写回

- **做什么**：点模型 → 调 `dir.select()` → 成功关闭 / 失败就地提示
- **关键**：
  - `reasoningEffort`：**同 provider+model 时沿用当前 effort**，否则用 `model.reasoning.defaultEffort`
  - 错误码 `session/writer-held` → 提示「该会话正在写入，请稍后」
  - 失败**不要**关面板，就地显示错误条 + 重试按钮
- **验收**：
  - 选一个模型 → 界面立即显示新模型 → 发一条消息确认真的用上了新模型（看会话模型变更标记）
  - 切换后重新打开，当前项是刚选的
- **依赖**：T-33
- **预计**：30 分钟

### T-35 ✅ 实现一级搜索（跨全部）

- **做什么**：一级搜索框，**范围是全部供应商的全部模型**（这是用户明确要求的，等价现状）
- **规格**：
  - 输入即出扁平结果，每行带供应商标签
  - 匹配：模糊匹配（子串优先，其次字符顺序散布命中），大小写不敏感
  - 有清除按钮；清空后**回到两级浏览**（不是关闭）
  - 结果里当前模型打标但**不置顶**
  - 空态：「无匹配模型」
- **验收**：输入 `glm` → 跨供应商命中多条（当前配置下：zai 4 条 + qiniu 2 条 + lyrouter 2 条 = 8 条）
- **依赖**：T-32
- **预计**：40 分钟

### T-36 ✅ 实现二级搜索（本家）

- **做什么**：二级搜索框，范围限定当前供应商
- **验收**：进入 lyrouter 后输入 `glm` → 只命中 `z-ai/glm-5.3`、`z-ai/glm-5.3-flash` 两条
- **依赖**：T-33、T-35
- **预计**：20 分钟

### T-37 ✅ 实现加载态与失败态

- **做什么**：
  - `status === 'loading'` → 骨架行 + `aria-busy`
  - `failures[]` 非空 → 对应供应商行带错误角标、不可进入；底部错误条可点重试
  - 供应商组为空 → 该行置灰显示「0 个模型」
- **验收**：临时删掉某家供应商的 key 或断网，能看到失败提示且其他供应商仍可用
- **依赖**：T-32
- **预计**：30 分钟

### T-38 ✅ 声明 label 子 Slot（已完成）

- **做什么**：内置声明了 `conversation.input.model.label`（非交互标签子 Slot）。成为 winner 后**必须**重复声明，否则该子 Slot 声明消失
- **实测依据**：M1 已确认——探针赢下座位但未声明 children 后，`Slots.listSubTree` 的 children 从 `[conversation.input.model.label]` 变为 `[]`
- **做法**：
  ```js
  ctx.slots.register({
    name: 'conversation.input.model',
    children: {
      'conversation.input.model.label': { kind: 'single', scope: 'session', inline: true },
    },
    // ...
  }, Component);
  ```
- **验收**：`Slots.listSubTree(root: "conversation.input.model")` 的 `trees[0].children` 里能看到 `conversation.input.model.label`
- **风险说明**：这是**静默回归**——界面看不出任何异常，但任何往该子 Slot 注册的第三方插件都会失效，且极难排查。当前无插件使用该子 Slot，所以**不能靠肉眼验证**
- **依赖**：T-31
- **预计**：15 分钟

**阶段 C 出口检查**：

```powershell
node scripts/validate.mjs && node test/package.test.mjs
# 手动：安装插件 → 打开会话 → 点模型按钮 → 一级选 lyrouter → 二级选 deepseek-v4.1-flash → 发消息确认生效
```

---

## 5. 阶段 D：打磨

### T-40 ✅ 补齐键位与焦点管理

- **做什么**：按 design.md §5.2 的表格逐项实现
- **清单**：
  - 触发按钮：`Enter`/`Space`/`↓` 打开
  - L1：`↑↓` 移动、`Enter` 进入、`Esc` 关闭、任意字符聚焦搜索
  - L2：`↑↓` 移动、`Enter`/`Tab` 选中、`Esc`/`Shift+Tab` 返回
  - 搜索态：`↑↓` 移动、`Enter` 选中、`Esc` 清空回上一级
  - 中文输入法：`isComposing` 为真时不响应 Enter
- **验收**：全程不碰鼠标能完成一次模型切换
- **依赖**：T-38
- **预计**：60 分钟

### T-41 🟡 无障碍属性（role/aria-checked/aria-busy/aria-label 已做，缺 aria-activedescendant）

- **做什么**：`role="menu"` / `menuitemradio`、`aria-checked`、`aria-activedescendant`、`aria-busy`、`aria-label`
- **验收**：浏览器 Accessibility 面板检查无严重问题；键盘焦点可见
- **依赖**：T-40
- **预计**：30 分钟

### T-42 🟡 样式对齐宿主（令牌与尺寸已按规格，未做像素级并排对比）

- **做什么**：对照内置模型下拉逐项校准
- **规格**：design.md §7 的表格（弹层圆角 10px、阴影、border-l1、最大高度 `min(70vh, 460px)`、`overscroll-behavior: contain`、类名 `dmp-` 前缀）
- **验收**：截图与内置下拉并排对比，间距/字号/颜色无明显差异；亮色与暗色主题都检查
- **依赖**：T-32
- **预计**：45 分钟

### T-43 ⬜ 动画与降级

- **做什么**：打开 120ms 淡入 + 4px 上移；层级切换 90ms 横移；`prefers-reduced-motion` 时关闭动画
- **依赖**：T-42
- **预计**：20 分钟

### T-44 ✅ 国际化

- **做什么**：所有可见文案进 `locale/zh.json` + `locale/en.json`，组件里不写死中英文
- **验收**：切到英文界面，无中文残留、无 key 泄漏（显示成 `modelPicker.xxx` 这类）
- **依赖**：T-32
- **预计**：30 分钟

### T-45 ⬜ 实现插件 Config

- **做什么**：按 design.md §8 暴露可配置项
  ```
  searchScope: 'all' | 'current'     默认 'all'
  showModelCount: boolean            默认 true
  focusCurrentOnOpen: boolean        默认 true
  showBackButton: boolean            默认 true
  currentMarker: 'badge'|'dot'|'bold' 默认 'badge'
  ```
- **验收**：在 `cordis.patch.yml` 里改 `searchScope: 'current'`，重启后一级搜索只搜本家
- **依赖**：T-35
- **预计**：30 分钟

### T-46 ✅ 子代理会话禁用

- **做什么**：`sessions.subagentAddress(sessionId) !== undefined` 时禁用选择（沿用内置语义）
- **验收**：在子代理会话里模型按钮不可点
- **依赖**：T-31
- **预计**：15 分钟

**阶段 D 出口检查**：

```powershell
node scripts/validate.mjs && node test/package.test.mjs
# 手动走查：design.md §10 的验证表格逐行打勾
```

---

## 6. 阶段 E：发布

### T-50 ✅ 补充测试

- **做什么**：给纯函数（模糊匹配、供应商排序、effort 继承规则）加单元测试
- **做法**：把纯函数抽到 `src/` 或直接在 `client.js` 里 export 供测试 import（注意：`client.js` 有 `window.__ModuleLoader__` 副作用，需拆出无副作用模块）
- **验收**：`node test/*.test.mjs` 全绿，覆盖匹配/排序/effort 三个函数
- **依赖**：T-36、T-34
- **预计**：60 分钟

### T-51 ✅ 初始化 git 仓库

- **做什么**：`git init`、首次提交、建立 `main` 分支
- **注意**：`.gitignore` 已就位；**不要**提交 `spike/`、`node_modules/`
- **依赖**：阶段 C 完成
- **预计**：10 分钟

### T-52 ✅ 更新 README

- **做什么**：状态从「设计阶段」改为「可用」；补安装命令、截图、已知限制
- **依赖**：T-42
- **预计**：20 分钟

### T-53 ✅ 更新 CHANGELOG

- **做什么**：把 `[Unreleased]` 的 `Added` 挪到 `[0.1.0] - YYYY-MM-DD`
- **依赖**：T-52
- **预计**：10 分钟

### T-54 ✅ 打版本与 tag

- **做什么**：`package.json` 版本 0.1.0；`git tag v0.1.0`
- **依赖**：T-51、T-53
- **预计**：10 分钟

### T-55 ⬜ 发布到 npm（可选）

- **做什么**：若希望别人用 `dsh plugin add @xxx/dsh-model-picker-2level` 安装
- **前置**：包名从 `@local/` 改为真实 scope；`private` 改 `false`；补 `repository` 字段
- **依赖**：T-54
- **预计**：30 分钟

### T-56 ✅ 编写迁移/卸载说明

- **做什么**：怎么卸载、卸载后如何确认恢复内置、如何回滚到上一版本
- **依赖**：T-52

---

## 7. 可直接复制的命令清单

```powershell
# 项目目录
cd D:\vibe_coding\dsh-plugin-develop

# 自检（每次改完都跑）
node scripts/validate.mjs
node test/package.test.mjs

# 安装插件到当前 profile（重启 Harness 生效）
dsh plugin --profile desktop add "D:\vibe_coding\dsh-plugin-develop"

# 卸载
dsh plugin --profile desktop remove @local/dsh-model-picker-2level

# 查看组合后的配置（排查插件是否挂上）
dsh --profile desktop --dump-config

# 宿主版本
Get-Content "D:\apps\DeepSeek Harness\version"

# 用户当前配置（供应商/模型清单，用于核对效果）
Get-Content "$env:USERPROFILE\.dsh\profiles\desktop\cordis.patch.yml"
```

**检查 Slot 占用情况**（用 Harness 内置的只读检查能力，不要猜）：

```
cordis_inspect_query
  platform: client
  provider: Slots
  method:   listSubTree
  input:    { "root": "conversation.input.model" }
```

返回里的 `trees` 反映 Slot 声明结构；但 ⚠️ **`occupants` 数组不能用来判断谁赢了**（实测反例见 R1）。

---

## 8. 常见坑（踩过或已知）

| 现象 | 原因 | 解决 |
|---|---|---|
| **装了插件但界面没变** | **客户端模块只在页面 boot 时加载，桌面端无刷新** | **必须重启整个应用**（M1 实测：这是最常见的误解） |
| **`occupants` 里看不到我们的注册，但界面显示的是我们的组件** | `occupants` 不反映被遮蔽条目 | 遵守 R1：**以实际渲染为准**，不要据此判断注册失败 |
| **第三方插件往 `conversation.input.model.label` 注册失效** | 我们赢下座位但没声明 children | 遵守 R2：注册时带上 `children` 声明 |
| 改了 `client.js` 看不到效果 | 桌面端无热更新 | 遵守 R3：重启应用 |
| `npm test` 报 `spawn EPERM` | 沙箱禁止测试 runner 派生子进程 | 改用 `node test/package.test.mjs` |
| PowerShell 校验 JSON 报"未终止的字符串" | 本机 `pwsh` 实为 PS 5.1，按 GBK 读无 BOM 的 UTF-8 | 用 `node -e "JSON.parse(...)"` 校验，别用 PowerShell |
| 组件抛错导致整个 Slot 空白 | 未捕获渲染错误 | 加错误边界；看 Console 的 `slot entry crashed in '...'` |
| 样式串味影响别处 | 选择器没用前缀/没限定根节点 | 类名加 `dmp-`，选择器包在组件根节点内 |
| 插件装上但服务取不到 | `modelDirectories` 是内置插件注册的 Client 服务 | 通过 slot `inject` 或 `ctx.get` 拿；内置行**不能**禁用 |
| 切换模型没反应 | 直接改本地 state 没调 `dir.select()` | 必须走 `directory.select()` |
| 中文输入法回车误触发 | 未判 `isComposing` | 键盘处理里先判 `event.nativeEvent.isComposing` |
| 改完 `cordis.patch.yml` 没生效 | 该文件是用户层，被 bundle 层覆盖 | 用 `plugin_manager` 或 `dsh plugin add`，不要手改 |

---

## 9. 交付物清单（完成时应具备）

- [ ] `client.js` 实现完整两级逻辑（无占位代码残留）
- [ ] `docs/design.md` 与实际实现一致（有偏差则更新）
- [ ] `docs/decisions.md` 含 ADR-0004（M1 实测结论）
- [ ] `docs/m1-spike-plan.md` 的记录表已填写
- [ ] `npm run validate` + `npm test` 全绿
- [ ] 真实界面手动验证通过（design.md §10 表格）
- [ ] README 更新为可用状态，含安装说明
- [ ] CHANGELOG 有 `0.1.0` 条目
- [ ] git 仓库已初始化，有 `v0.1.0` tag
- [ ] 卸载后可完整恢复内置选择器

---

## 10. 任务依赖速查表

| 任务 | 前置任务 | 阻塞谁 |
|---|---|---|
| T-20 | T-00~T-13 | T-21 |
| T-21 | T-20 | T-22 / T-30 |
| T-22 | T-21 | T-24 |
| T-23 | T-20 | — |
| T-24 | T-22 全失败 | T-30 |
| T-30 | T-21 或 T-24 | T-31 |
| T-31 | T-30 | T-32, T-38, T-46 |
| T-32 | T-31 | T-33, T-35, T-37, T-42, T-44 |
| T-33 | T-32 | T-34, T-36 |
| T-34 | T-33 | T-50 |
| T-35 | T-32 | T-36, T-45 |
| T-36 | T-33, T-35 | T-50 |
| T-37 | T-32 | — |
| T-38 | T-31 | T-40 |
| T-40 | T-38 | T-41 |
| T-41 | T-40 | — |
| T-42 | T-32 | T-43, T-52 |
| T-43 | T-42 | — |
| T-44 | T-32 | — |
| T-45 | T-35 | — |
| T-46 | T-31 | — |
| T-50 | T-34, T-36 | — |
| T-51 | 阶段 C 完成 | T-54 |
| T-52 | T-42 | T-53 |
| T-53 | T-52 | T-54 |
| T-54 | T-51, T-53 | T-55 |
| T-55 | T-54 | — |
| T-56 | T-52 | — |
