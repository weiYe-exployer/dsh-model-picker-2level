# 两级模型选择器 插件设计方案

> 状态：设计稿（待评审）
> 目标环境：DeepSeek Harness 44.7.0 · profile `desktop` · Web GUI
> 相关产物：[效果图](model-picker-2level.png)
> 数据基线：4 家供应商 / 33 个模型（`zai-coding-cn` 4、`qiniu` 6、`lyrouter` 21、`kimi-api` 2）

---

## 1. 背景与目标

### 1.1 问题

当前模型的供应商与模型在同一个下拉里平铺展开，共 33 条。日常切换需要滚动逐条扫描，越往后加的供应商越难找。

### 1.2 目标

| # | 目标 | 验收标准 |
|---|---|---|
| G1 | 浏览分级 | 一级只列供应商（带模型数、当前所属高亮），二级只列该供应商的模型 |
| G2 | 保留原搜索 | 一级可跨供应商搜索；二级可本家搜索；输入即回到扁平结果，清空恢复两级 |
| G3 | 切换生效 | 选中后经由内置同一服务写回会话，模型真正切换（不写二次状态） |
| G4 | 交互一致 | 键位、选中态、加载/错误态与宿主 UI 一致；支持键盘全流程操作 |
| G5 | 可撤销 | 卸载插件后界面与行为完全回到内置版本 |

### 1.3 非目标

- 不新增 LLM 供应商接入方式（不改 `llm-pi-ai` 配置语义）
- 不改动会话投影、投影缓存、或向会话日志写入新事件类型
- 不改 `/model` 命令面板（保持内置行为）
- 不做"模型价格/余额"等附加信息（可作为后续迭代）

---

## 2. 现状分析（已核实的实现事实）

内置实现：`@deepseek-ai/dsh-client-ui-model-selection@0.2.1-rc.3`（纯 UI 插件，Host 侧 `apply()` 为空）。

| 事实 | 依据 |
|---|---|
| 座位 | 注册到单例 Slot `conversation.input.model`（`replaceRisk: shadows-shipped-ui`），并声明子 Slot `conversation.input.model.label` |
| 数据服务 | 插件内部注册 Client 服务 `modelDirectories`（`ModelDirectoryResolver`），核心方法 `directoryFor(sessionId)` → `{ store, load(), select(selection) }` |
| 目录结构 | `catalog.value.groups: [{ id, name, models: [{ id, name, reasoning }] }]` + `failures: [{ id, name, message }]` |
| 已有分组 | 面板内部已用 `MenuGroup label={group.provider.name}` 按供应商分组渲染（一屏内分组，不是两级） |
| 已有搜索 | `showSearch` + `query` 过滤 `filteredGroups`（跨群组），配套 `searchRef` 聚焦与清除按钮 |
| 选择写回 | `directory.select(selection)` → `session.selectModel`；失败码如 `session/writer-held` 需提示 |
| reasoningEffort | 选中同一模型时保留当前 effort，否则用 `model.reasoning.defaultEffort` |
| 不可用场景 | 子代理会话（`sessions.subagentAddress() !== undefined`）禁用选择 |
| `/model` 命令 | 独立的 `commandUi.register({ name: 'model', ui: { kind: 'popupSelect', searchMode: 'fuzzy-label' … } })` |

插件包形态（来自官方模板与技能文档）：

- `package.json` 增加 `dsh.bundle.patch` 与 `dsh.client`（`platform: 'web'`、`inject` 仅用于激活顺序）
- `cordis.patch.yml` 用 `insert:` 增加一行
- `index.js` 导出 `apply()`（Host 侧，本插件为空实现）
- `client.js` 以 `window.__ModuleLoader__.load({ id: '<包名>', factory })` 注册浏览器半，返回 `{ inject, apply }`

---

## 3. 入口策略（这一节回答"入口放在哪、原按钮怎么办"）

### 3.1 先看宿主怎么决定"这个位置显示谁"

模型按钮所在的位置是单例 Slot `conversation.input.model`。宿主渲染单例 Slot 的代码（已从 `dsh-client-ui-renderer` 提取核实）是：

```js
if (spec.kind === "single") {
  const entry = host.entriesOfSlot(slotKey)[0];   // 只取第 0 个
  if (!entry) return deadCell() / fallback;
  return guarded(entry, ...);
}
```

`entriesOfSlot` 的官方注释：**"Shadowing winners per cell for a key: the first live (non-abdicated) entry of each cell in priority order"**。

三条硬结论：

1. **单例位置只显示一个注册者** —— 取排序后的第一个，其余注册者被"遮蔽"（不渲染、不报错）。
2. **崩溃会让位** —— 组件渲染崩溃时 `reportEntryError(..., { abdicate: true })`，该条目退出，由下一个接替（所以插件写坏不会白屏，只会回落到内置）。
3. **谁排第一由 priority 决定，内置那个是 `priority: 0`**（`Slots.listSubTree` 实测：`occupants: [{ registrant: "Gb", priority: 0, active: true }]`），且注册 API 没有暴露"提高 priority"的参数。

**这意味着：不能简单地"再注册一个就顶掉内置"。** 同为 priority 0 时按注册顺序，内置先注册 → 内置赢 → 我们的组件根本不会显示。这是必须做取舍的地方，也是"入口策略"要决策的原因。

### 3.2 A 方案的关键约束（已核实，修正了原设想）

最初设想"把内置 `ui-model-selection` 行 `disabled: true` 关掉，我们再注册同一 Slot"。**核查后这条做法有致命问题**：

内置包 `@deepseek-ai/dsh-client-ui-model-selection` 是一个**不可分割的整体**，它在同一个 `apply()` 里同时做三件事：

| 职责 | 代码位置（已读源码确认） |
|---|---|
| 注册 Client 服务 `modelDirectories` | `ctx.plugin(ModelDirectoryResolver)` |
| 注册 `/model` 命令 | `commandUi.register({ name: 'model', ... })` |
| 注册 `conversation.input.model` 座位 | `ctx.slots.register({ name: 'conversation.input.model' }, ModelSelect)` |

bundle 里它只有**一行**（`dsh-web-app/cordis.patch.yml` L412）：

```yaml
- id: ui-model-selection
  name: '@deepseek-ai/dsh-client-ui-model-selection'
```

所以 `disabled: true` 会**同时干掉三样东西**。而我们的插件恰恰依赖 `modelDirectories`（模型目录、`select()` 写回全靠它）——把自己依赖的服务关掉，插件没法工作。

**修正后的 A 方案 = 保留该行（服务与命令都在），只接管渲染。** 也就是：

1. 内置行保持启用 → `modelDirectories`、`/model`、`label` 子 Slot 全部照旧
2. 我们的插件也注册 `conversation.input.model`
3. 靠**注册顺序**让我们的条目排在前面成为 winner（`entriesOfSlot()[0]`）

### 3.3 技术风险 —— 已由 M1 实测消除 ✅

**结论（2026-10-27 实测）：注册顺序可以抢占，A 方案成立。**

M1 探针（`@local/dsh-model-picker-spike`）注册同一 Slot 并渲染红色 `SPIKE` 按钮，重启应用后按钮出现，证明我们的注册成为 winner。详细记录见：
[m1-spike-result.md](m1-spike-result.md)、[decisions.md ADR-0004](decisions.md)

由此确定两条必须遵守的实践规则：

**规则 1：判断 winner 只能用实际渲染结果**

实测中 `Slots.listSubTree` 的 `occupants` 始终只显示内置一条，**尽管界面渲染的是我们的组件**。

> ⚠️ `occupants` 数组不能用来判断谁赢了，也不能用来断言"某注册不存在"。唯一可靠依据是界面实际渲染了谁的组件。

**规则 2：子 Slot 声明必须由 winner 重复根出**

单例 Slot 的 children 声明来自 winner 的注册参数。我们赢下座位但未声明 `children` 后，内置的 `conversation.input.model.label` 子 Slot 声明**随之消失**（实测确认）。

**规则 3：桌面端无热更新**

改 `client.js` 后必须**重启整个应用**才能看到效果。纯函数应抽出来做单测（见 ADR-0005），减少重启次数。

### 3.4 三种可选做法

| 方案 | 具体做法 | 界面上是什么样 | 代价 |
|---|---|---|---|
| **A（已选定，已验证可行）** | 保留内置行（服务/命令存活），我们注册同一 Slot 成为 winner | 模型按钮原位，点开是两级 | 已验证；需遵守规则 1/2 |
| B. 并存新增入口 | 内置完全不动，我们在 `conversation.input.left` 加按钮 | 老按钮旁多个新按钮 | 入口冗余，零风险（不再需要） |
| C. 上游改进 | 提 issue/PR 让内置原生支持两级 | 最干净 | 不可控 |

### 3.5 A 方案下需要处理的细节

| 项 | 说明 |
|---|---|
| `conversation.input.model.label` 子 Slot | **必做**。内置声明了它；成为 winner 后必须重复声明，否则第三方往这里注册会失效——**且属静默回归，界面看不出异常**。实测见 ADR-0004 规则 2 |
| `/model` 命令 | **无需补**——内置行未禁用，命令仍在。**这是 A 修正后的一大收益** |
| 思考强度入口 | 内置根面板有；我们的两级版需保留等价入口 |
| 子代理会话禁用 | 沿用 `sessions.subagentAddress()` 判断 |
| 内置组件是否仍在后台 | 是（entry 存在但被遮蔽，不渲染）。无副作用，仅占用一个注册位 |

---

## 4. 插件结构

```
dsh-model-picker-2level/            # 包目录（workspace 内，用 plugin_manager install_bundle 安装）
├─ package.json                     # dsh.bundle.patch + dsh.client
├─ cordis.patch.yml                 # insert 一行，把插件挂进 profile
├─ index.js                         # Host 半：export function apply() {}
├─ client.js                        # 浏览器半：__ModuleLoader__.load(...)
├─ locale/
│  ├─ zh.json                       # 中文文案（meta.title/description 必填）
│  └─ en.json
├─ icon.svg                         # 插件列表图标（原创，纯几何）
└─ src/                             # 若拆多文件则在构建期打包成单个 client.js
   ├─ picker.jsx                    # 两级容器与状态机
   ├─ level1.jsx                    # 供应商列表
   ├─ level2.jsx                    # 模型列表
   ├─ search.js                     # 匹配打分（复用内置 fuzzy-label 语义）
   └─ styles.css                    # 仅用 --dsw-alias-* token
```

> 约束：**不得** `require('@deepseek-ai/dsh-client-ui-primitives')`；菜单、输入框、滚动容器全部自绘，样式参照宿主同位置控件（模型下拉），类名统一加 `dmp-` 前缀。

### 4.1 package.json 关键字段

```json
{
  "name": "@local/dsh-model-picker-2level",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./index.js", "./client": "./client.js", "./locale/*.json": "./locale/*.json", "./icon": "./icon.svg" },
  "files": ["index.js", "client.js", "cordis.patch.yml", "locale/*.json", "icon.svg"],
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": { "platform": "web", "immediately": true,
                "inject": ["@deepseek-ai/dsh-client-ui-model-selection"] }
  }
}
```

`inject` 只声明激活顺序（确保 `modelDirectories` 已存在），不 import 其模块。

### 4.2 cordis.patch.yml

```yaml
- insert:
    - id: model-picker-2level
      name: '@local/dsh-model-picker-2level'
```

---

## 5. 交互规格

### 5.1 状态机

```
                 ┌──────────────┐
  click trigger  │   closed     │
 ───────────────►│              │
                 └──────┬───────┘
                        │ open
                        ▼
              ┌──────────────────┐   点供应商   ┌──────────────────┐
              │ L1 供应商列表     │────────────►│ L2 该家模型列表   │
              │ (搜索=全量)       │◄────────────│ (搜索=本家)       │
              └────────┬─────────┘   ‹返回/Esc  └────────┬─────────┘
                       │ 输入关键字                      │ 选中模型
                       ▼                                ▼
              ┌──────────────────┐                ┌──────────┐
              │ S 搜索扁平结果    │                │ closed   │
              │ (跨供应商)        │                │ + 切换   │
              └──────────────────┘                └──────────┘
                清空输入 → 回上一级
```

**初始焦点（按需求确认）**：打开后不等用户操作，直接**聚焦到「当前使用」那一行**——即当前模型所属供应商（L1）或当前模型（L2）。键盘用户打开即可用 ↑↓ 直接移动，或直接输入关键字搜索。

- `L1` 行内容：**供应商 id + 中文别名 + 模型数**，当前所属行额外显示「当前使用」标记并高亮
- `L1` 排序：**保持 `llm-pi-ai` 配置顺序**（不按字母、不按数量重排），当前使用项只做强调，不置顶
- `L2` 行内容：模型 id（等宽字体），当前模型打勾 + 品牌色高亮
- `L2` 排序：**保持配置顺序**，当前模型只强调、不置顶
- `L2` 初始滚动位置：**自动滚动到当前模型可见处**（不改变它在列表中的顺序）
- 由 `L2` 选中后：调用 `select()`，成功即关闭；失败（如 `session/writer-held`）保持打开并就地显示错误条 + 重试

### 5.2 键位

| 位置 | 按键 | 行为 |
|---|---|---|
| 触发按钮 | `Enter` / `Space` / `↓` | 打开 L1 |
| L1 | `↑` `↓` | 移动高亮 |
| L1 | `Enter` | 进入 L2 |
| L1 | `Esc` | 关闭并回焦触发按钮 |
| L1 | 任意字符 | 聚焦搜索框并作为首字符 |
| L2 | `↑` `↓` | 移动高亮 |
| L2 | `Enter` / `Tab` | 选中并关闭 |
| L2 | `Esc` / `Shift+Tab` | 返回 L1 |
| 搜索态 | `↑` `↓` | 在扁平结果间移动 |
| 搜索态 | `Enter` | 选中高亮项 |
| 搜索态 | `Esc` | 清空输入回上一级 |

无障碍：`role="menu"` / `menuitemradio`、`aria-checked`、`aria-activedescendant`，与内置保持一致。

### 5.3 搜索规则（保留原功能）

- **L1 搜索**：范围 = **全部供应商的全部模型（跨全部，已确认）**，返回扁平结果，每行带供应商标签；等价于现在的行为
- **L2 搜索**：范围 = 当前供应商的模型（本家），减少噪声
- **匹配**：标签模糊匹配（同内置 `fuzzy-label`：子串命中优先，其次按字符顺序散布命中），大小写不敏感
- **空态**：`无匹配模型`；有失败组时在该区域内提示加载失败原因（不阻塞其他组）
- 搜索不清空两级位置：清空输入后回到进入搜索前的层级
- 搜索态下「当前使用」项若有命中，同样打标但不强制置顶（与列表规则一致）

### 5.4 降级路径

| 情况 | 表现 |
|---|---|
| 目录仍在加载 | 显示骨架行 + `aria-busy`，不阻塞打开 |
| 某供应商加载失败 | 一级显示该行带错误角标，不可进入；底部错误条可点重试 |
| 供应商组为空 | 一级该行置灰显示「0 个模型」 |
| 子代理会话 | 座位整体禁用（沿用内置 `available=false` 语义） |
| `modelDirectories` 服务缺失 | 插件 `inject` 未满足 → 不激活，界面保持内置实现 |

---

## 6. 数据流与 API

```
组件 props (slot inject)
  ├─ directory: store            # 目录快照 store（groups / current / status / failures）
  ├─ load(): void                # 打开时触发加载
  └─ select(selection): Promise  # 写回会话

selection = { provider, model, reasoningEffort? }
  reasoningEffort 规则：同 provider+model 时沿用当前 effort；否则 model.reasoning.defaultEffort
```

实现要点：

1. **只读订阅**：组件通过 `directory.store` 取快照（`useSyncExternalStore` 风格），不自己轮询、不 fold 会话事件
2. **不做二次状态**：当前选中项永远来自 `current`，组件内部只保存 UI 态（pane、query、highlightedIndex、scrollTop）
3. **切换结果**：`select()` 返回 `{ ok }` 或 `{ ok: false, error }`；错误就地展示，不做全局 toast
4. **供应商名映射**：`deepseek-account` 显示为本地化的「DeepSeek 账号」，与内置一致
5. **供应商排序**：沿用内置 `orderModelProviders()` 的顺序（不要自己按字母排）

---

## 7. UI 规格

| 元素 | 规格 |
|---|---|
| 触发按钮 | 沿用内置外观与尺寸（图标 + `供应商 / 模型` 文本 + 可选 effort 标签 + chevron）；展开态 chevron 旋转 |
| 弹层 | `MenuSurface` 等价自绘：圆角 10px、`--dsw-alias-bg-overlay` 背景、`--dsw-alias-border-l1` 描边、阴影与内置一致；宽度 ≥ 320px，超出视口时上下翻转 |
| L1 行高 | 56–62px（两行：供应商 id + 中文别名，右侧模型数 + chevron） |
| L2 行高 | 32px（单行等宽模型 id，右侧勾选） |
| 分组标题 | 11px、`--dsw-alias-label-secondary`、全大写间距 0.02em |
| 高亮 | `--dsw-alias-brand-primary` 文字 + 8% 品牌色底 |
| 当前项 | 品牌色勾 + 品牌色文字；一级对应行加浅品牌底 |
| 搜索框 | 34px 高，圆角 9px，左侧放大镜，有值时右侧清除按钮 |
| 滚动 | 弹层内独立滚动，最大高度 `min(70vh, 460px)`；`overscroll-behavior: contain` |
| 动画 | 打开 120ms 淡入 + 4px 上移；层级切换 90ms 横移（可用 `prefers-reduced-motion` 关闭） |
| 颜色 | 仅使用 `--dsw-alias-*` token；字色 `label-primary/secondary` |

> 效果图见 [model-picker-2level.png](model-picker-2level.png)。

---

## 8. 插件 Config（可在 cordis.patch.yml 调整）

```ts
interface Config {
  /** 一级搜索范围：all=跨全部（默认，已确认） | current=仅当前供应商 */
  searchScope?: 'all' | 'current'      // 默认 'all'
  /** 一级是否显示每家模型数量（已确认要显示） */
  showModelCount?: boolean             // 默认 true
  /** 打开时把「当前使用」项滚动到可见位置并聚焦（已确认要） */
  focusCurrentOnOpen?: boolean         // 默认 true
  /** 二级列表是否显示「返回」按钮（false 时只能 Esc） */
  showBackButton?: boolean             // 默认 true
  /** 一级列表「当前使用」标记的样式：badge=文字徽标 | dot=圆点 | bold=仅加粗 */
  currentMarker?: 'badge' | 'dot' | 'bold'  // 默认 'badge'
}
```

全部带默认值，缺省即开箱可用；用户层可在 `cordis.patch.yml` 覆盖，升级不丢。

> 已确认不做的项：一级不显示「最近使用」区块、显示「今日已用 token」等附加信息；列表顺序不做重排（保持配置顺序）。

---

## 9. 兼容与稳定性

| 风险 | 缓解 |
|---|---|
| 单例 Slot 覆盖语义未定 | M1 spike 实测；不可行则切方案 B（`conversation.input.left`） |
| 宿主升级导致 `modelDirectories` 变形 | 通过 slot `inject` 拿到的接口使用；对 `groups/failures` 做字段存在性检查，缺字段时降级为内置实现并记录一次警告 |
| 宿主改模型座位结构 | 座位名变更会让 `ctx.slots.inject` 自然失效（插件不激活），界面回落到内置 |
| 与其它插件争用同一座位 | 冲突时以方案 B 并存，避免互相覆盖 |
| 语言包缺键 | `locale` 服务回退；所有可见文案走 `ctx.locale.bind(ns)` |
| 样式串味 | 类名 `dmp-` 前缀；只在弹层根节点内选择器作用域；不用全局选择器 |

**卸载保证**：所有注册都在 `apply(ctx)` 内用 `ctx.effect` / `ctx.slots.inject` 的返回值托管；卸载后座位回到内置组件，无残留 DOM/监听器。

---

## 10. 验证计划

| 阶段 | 检查项 | 方法 |
|---|---|---|
| 静态 | JS 语法、manifest 字段、patch 格式 | `node --check`、`JSON.parse`、`dsh --dump-config` 无警告 |
| 安装 | 是否真正挂载 | `plugin_manager.install_bundle` 返回 `application: applied`；`cordis_inspect_query` 确认行存在 |
| 座位 | 我们的组件是否成为活动 occupant | `Slots.listSubTree(root: conversation.input.model)` 查看 occupants |
| 功能 | L1→L2→选中→模型真切换 | 逐项操作；用会话模型变更标记确认切换生效 |
| 搜索 | 跨供应商命中、本家命中、清空恢复 | 输入 `glm`（预期跨 3 家 8 条）、`kimi`、清空 |
| 键位 | 上表全部按键 | 逐项键盘走查 |
| 降级 | 断网/伪造失败组 | 临时移除某供应商 key，确认失败行与重试 |
| 回归 | 卸载后是否恢复 | 卸载插件，确认内置选择器正常、`/model` 命令不受影响 |

---

## 11. 里程碑

| 里程碑 | 内容 | 产出 | 前置 |
|---|---|---|---|
| **M0 文档** | 本设计文档定稿（含 M1 验证方案） | 评审通过 | — |
| **M1 spike**（~30min） | ①注册诊断组件到 `conversation.input.model`，实测谁是 winner ②确认 `modelDirectories` 在插件内可访问 ③若内置赢，尝试未文档化的 priority 手段 | 结论：A 可行 / 走 B | M0 通过 |
| **M2 MVP**（~2.5h） | 两级导航 + 搜索（L1 跨全部 / L2 本家）+ 当前使用标记与自动聚焦 + 选中写回 + 基础样式 | 可日常使用的版本，装进 profile | M1 确认走 A |
| **M3 打磨**（~1h） | 键位全覆盖、加载/错误态、动画、locale 中英文、Config 项 | 交付版 | M2 |
| **M4 可选** | 模型能力角标（视觉/推理档位）等附加信息 | 迭代 | M3 |

---

## 12. 已确认的决策

| # | 问题 | 决定 |
|---|---|---|
| 1 | 入口策略 | **走 A 方案**：保留内置行（服务/命令存活），我们注册同一 Slot 争取成为 winner；详见第 3 章 |
| 2 | 一级信息密度 | 显示「供应商 id + 中文别名 + 模型数 + **当前使用** 标记」；**打开时自动聚焦到当前使用项** |
| 3 | 二级排序 | **保持配置顺序**，只强调当前使用项（不置顶） |
| 4 | 一级搜索范围 | **跨全部**（等价现状） |
| 5 | `/model` 命令 | **无需处理** —— A 修正后内置行不禁用，命令天然保留 |
| 6 | 开发前置 | **先完成本文档评审，再进入实际开发**（M0 → M1） |

### 待 M1 验证的技术未知

1. **注册顺序胜负**：priority 相同（0）时谁排第一。若内置赢，A 需要额外的抢占手段或退 B。
2. `modelDirectories` 从第三方插件能否直接 `ctx.get('modelDirectories')`（它是内置插件注册的 Client 服务，跨插件消费应可行，但需实测）。
3. 我们成为 winner 后，内置声明的 `conversation.input.model.label` 子 Slot 是否仍被我们正确接管。

---

## 附：与内置实现的差异清单

| 项 | 内置 | 本插件 |
|---|---|---|
| 模型列表组织 | 单一滚动列表内分组 | 两级分面导航 |
| 一级行信息 | —（无一级） | 供应商 id + 别名 + 模型数 + 当前使用标记 |
| 打开时焦点 | 无（需手动移动） | 自动聚焦当前使用项 |
| 排序 | 配置顺序 | 配置顺序（一致，不重排） |
| 搜索范围 | 全局（跨群组） | L1 全局（一致）、L2 本家（更精准） |
| 根面板 | 「模型」/「思考强度」两个入口 | L1 直接是供应商列表；思考强度入口保留 |
| 选择写回 | `directory.select()` | 同一个 `directory.select()`（不变） |
| `/model` 命令 | `popupSelect` 扁平选项 | 见第 12 章 A1/A2/A3 决策 |
