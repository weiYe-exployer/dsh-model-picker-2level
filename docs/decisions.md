# 决策记录（ADR）

本文件记录影响架构、且事后改起来代价高的决定。格式参考
[Architecture Decision Records](https://adr.github.io/)。

---

## ADR-0001：入口策略选择 A（接管原模型座位）

**日期**：2026-10-27
**状态**：已接受（待 M1 实测确认技术可行性）
**相关**：[design.md §3](design.md)

### 背景

模型下拉位于单例 Slot `conversation.input.model`。宿主渲染逻辑（`dsh-client-ui-renderer`）：

```js
if (spec.kind === "single") {
  const entry = host.entriesOfSlot(slotKey)[0];   // 只取第 0 个
  ...
}
```

注释：*"the first live (non-abdicated) entry of each cell in priority order"*。
内置注册者 priority 为 0，注册 API 未暴露提升 priority 的参数。

### 考虑的选项

| 选项 | 说明 |
|---|---|
| A. 接管原座位 | 插件注册同一 Slot，争取成为 winner。按钮位置不变 |
| B. 并存新增入口 | 在 `conversation.input.left` 加一个新按钮，内置完全不动 |
| C. 上游改进 | 提 issue/PR 让内置原生支持两级 |

### 决定

**选 A。**

### 理由

- 用户要的是"切换模型更顺手"，A 保持交互位置不变，没有学习成本
- B 会同时存在两套选择界面，日常使用时需要记住用哪个
- C 不可控，不能作为交付路径

### 关键约束（排查中发现，修正了最初设想）

最初计划"把内置 `ui-model-selection` 行 `disabled: true` 关掉再自己注册"。核查后否决：

内置包在同一 `apply()` 里同时提供 **`modelDirectories` 服务 + `/model` 命令 + 座位 UI**，而 bundle 里它只有一行（`dsh-web-app/cordis.patch.yml` L412）。整行 disable 会同时干掉这三样，而本插件依赖 `modelDirectories`。

**因此 A 的准确定义是：保留内置行启用（服务与命令存活），只抢渲染。**

### 后果

- 正面：`/model` 命令天然保留，无需重写
- 正面：内置服务可复用，插件不自建状态
- 负面：依赖"注册顺序 / priority 相同如何排序"这一未文档化行为 → M1 必须实测
- 负面：需重复声明 `conversation.input.model.label` 子 Slot
- 风险：若实测内置赢且无法抢占，退回 B（代码复用约 90%）

---

## ADR-0002：不做构建，`client.js` 即交付产物

**日期**：2026-10-27
**状态**：已接受
**相关**：[design.md §4](design.md)

### 背景

Harness 的 Web 插件以 `window.__ModuleLoader__.load({ id, factory })` 形式注册，React 由宿主模块表提供。官方模板就是手写单文件。

### 决定

不引入构建工具（esbuild/rollup/vite），不引入运行时依赖。仓库内的 `client.js` 就是运行产物。

### 理由

- 插件体量小（预计 < 1000 行），构建收益不足以抵消工具链成本
- 宿主升级时无"源码与产物不一致"的排查负担
- 贡献门槛低：改完直接装回去看效果

### 后果

- 需自行保持代码可读性（无压缩、无 tree-shaking）
- 若未来体积显著增长或需要 JSX，可在保留"提交产物"的前提下引入构建，需新 ADR

---

## ADR-0003：样式只用主题令牌，不 require 宿主 UI 包

**日期**：2026-10-27
**状态**：已接受
**相关**：[design.md §9](design.md)

### 背景

宿主提供了 `@deepseek-ai/dsh-client-ui-primitives`（Menu、Input 等）。官方实践文档明确禁止插件 require 它。

### 决定

- **不 require** 任何 `@deepseek-ai/dsh-client-*` 包；需要激活顺序时只用 `package.json` 的 `dsh.client.inject`（仅排序，不 import）
- 菜单、输入框、滚动容器全部自绘
- 颜色只用 `--dsw-alias-*` 主题令牌；类名加 `dmp-` 前缀，选择器限制在组件根节点

### 理由

- 宿主 Client 包无类型保证，版本变化会导致插件直接崩溃（组件抛错会让整个 Slot 变空白）
- 令牌是最低风险的共享面：令牌改名只影响外观，不会破坏渲染

### 后果

- 需要手工复刻宿主的交互细节（焦点管理、Escape、`aria-checked` 等），见 design.md §5.2
- 视觉与宿主可能存在细微偏差，需对照截图校准

---

## ADR-0004：注册顺序可抢占单例 Slot（M1 实测结论）

**日期**：2026-10-27
**状态**：已接受（实测确认）
**相关**：[m1-spike-plan.md](m1-spike-plan.md)、[m1-spike-result.md](m1-spike-result.md)、ADR-0001

### 背景

ADR-0001 选定 A 方案（接管原模型座位），但留下一个技术未知：单例 Slot `conversation.input.model` 的 winner 由 `entriesOfSlot()[0]` 决定，而内置注册者是 priority 0、且注册 API 未暴露 priority 参数。**priority 相同时按什么排序，没有文档。**

### 实测方法

建最小探针插件 `@local/dsh-model-picker-spike` 注册同一 Slot，渲染醒目红色 `SPIKE` 按钮，安装后重启应用观察。

### 结果

**✅ 红色 SPIKE 按钮出现** —— 我们的注册成为 winner。

| 结论 | 说明 |
|---|---|
| 注册顺序可以抢占 | 后激活的插件注册排在前面 |
| 不需要 priority 参数 | 无需任何未文档化手段 |
| 不需要禁用内置行 | 内置保持启用，`modelDirectories` 与 `/model` 全部存活 |

### 随之确定的两条实践规则

**规则 1：判断 winner 只能用实际渲染结果**

实测中 `Slots.listSubTree` 的 `occupants` 始终只显示内置一条（`registrant: "Gb", priority: 0`），**尽管界面渲染的是我们的组件**。

> 因此 `occupants` 数组不能用来判断谁赢了，也不能用来断言"某注册不存在"。唯一可靠依据是界面实际渲染了谁的组件。

**规则 2：子 Slot 声明必须由 winner 重复根出**

单例 Slot 的 children 声明来自 winner 的注册参数。我们赢下座位但未声明 `children` 后：

| 时点 | children |
|---|---|
| 内置为 winner | `[conversation.input.model.label]` |
| 我们为 winner | `[]` ← 消失了 |

**必须**在注册时带上：

```js
children: {
  'conversation.input.model.label': { kind: 'single', scope: 'session', inline: true },
}
```

### 后果

- 正面：A 方案确认可行，无需妥协到 B
- 正面：`/model` 命令天然保留，不必重写
- **负面（开发节奏）**：桌面端无热更新，改 `client.js` 后必须**重启整个应用**才能看到效果 → 纯函数应抽出来做单测，减少重启次数
- 负面：需记住规则 1 与规则 2

---

## ADR-0005：核心纯函数抽到独立模块以便单测

**日期**：2026-10-27
**状态**：已接受（由 ADR-0004 的"必须重启"约束推导）
**相关**：ADR-0004、[TASKS.md](TASKS.md) T-50

### 背景

桌面端无法刷新，每次验证都要重启应用（约数十秒）。若所有逻辑都写在 `client.js` 里（该文件有 `window.__ModuleLoader__` 副作用，无法在 node 中 import），则任何逻辑都无法自动化测试。

### 决定

把与宿主无关的纯函数抽到独立 ES 模块（如 `lib/pure.js`）：

- 模糊匹配打分
- 供应商排序（`orderModelProviders` 语义）
- `reasoningEffort` 继承规则
- 两级状态机转移（pane / query / index 的计算）

`client.js` 只负责：组件渲染、slot 注册、调用宿主服务。

### 理由

- 纯函数可在 node 里直接单测，不需要重启应用
- `client.js` 保持"薄"，降低宿主升级时的迁移成本

### 后果

- 需要维护 `lib/` 目录与对应的测试文件
- 打包时（虽无构建步骤）`client.js` 需自行内联或由模块表支持——**若宿主模块表不支持相对路径 import，则改为在 `client.js` 内定义并同时导出供测试**，此细节在 M2 首次实现时确认

