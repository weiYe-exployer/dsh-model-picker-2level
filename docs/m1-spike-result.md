# M1 Spike 执行记录

> 执行日期：2026-10-27
> 状态：**已完成，结论 A 方案可行**
> 相关：[m1-spike-plan.md](m1-spike-plan.md)、[TASKS.md](TASKS.md) T-20~T-23

---

## 1. 探针包信息

| 项 | 值 |
|---|---|
| 路径 | `D:\vibe_coding\dsh-plugin-develop\spike\` |
| 包名 | `@local/dsh-model-picker-spike` |
| 版本 | 0.0.1 |
| 安装方式 | `plugin_manager install_bundle`（目录目标） |
| 客户端声明 | `dsh.client.platform: web`，`immediately: true`，`inject: [@deepseek-ai/dsh-client-ui-model-selection]` |

## 2. 安装结果

```
application: applied
changed: true
enabled: true
warnings: []
packageResult.exitCode: 0
```

profile 侧核实：

- `package.json` 依赖：`@local/dsh-model-picker-spike: link:D:/vibe_coding/dsh-plugin-develop/spike`
- `node_modules/@local/dsh-model-picker-spike` → Junction 指向源码目录 ✓
- `plugin_manager list_plugins`：`entryId: include:model-picker-spike`，`enabled: true`，`fiberPhase: active` ✓

> 安装日志里 `cpu-features` 原生模块编译失败（`Unable to detect compiler type`）是 pnpm 装依赖时的既有噪声，本插件零依赖，与结果无关。

---

## 3. 关键发现一：安装后必须重启应用

安装成功后立即查询 Slot，`occupants` 里只有内置条目，界面上也没有探针按钮。

**原因**：`dsh.client` 声明的浏览器模块只在**页面 boot 时**由 `clientModules` 服务扫描注入 boot 图。桌面端没有 F5，所以：

- 安装插件 → Host 侧立即 active
- 但浏览器端模块**未加载** → `ctx.slots.register()` 从未执行
- 结果：Slot 里没有我们的注册，界面无变化

**用户重启应用后，红色 SPIKE 按钮出现。**

### 排除项（都不是原因）

| 检查 | 结果 |
|---|---|
| 包是否装进 profile | ✓ Junction 正确 |
| profile `package.json` 依赖 | ✓ `link:` 正确 |
| Host 侧是否激活 | ✓ `fiberPhase: active` |
| `dsh.client` 声明 | ✓ platform/immediately/inject 全对 |
| `exports["./client"]` | ✓ `./client.js` |
| `client.js` 是否可读 | ✓ 3721 字节 |
| JS 语法 / JSON 有效性 | ✓ `node --check` 与 `JSON.parse` 均通过 |

> ⚠️ **PowerShell 陷阱**：本机 `pwsh` 实为 Windows PowerShell 5.1，读无 BOM 的 UTF-8 JSON 会按 GBK 解码导致误报"未终止的字符串"。校验 JSON 请用 `node`，不要用 PowerShell。

---

## 4. 关键发现二：V1 通过 —— 注册顺序可以抢占

重启后界面出现红色 `SPIKE` 按钮，证明**我们的注册成为单例 Slot 的 winner**，成功接管了模型按钮的位置。

| 结论 | 说明 |
|---|---|
| ✅ **注册顺序可以抢占** | 后激活的插件注册排在前面，成为 `entriesOfSlot()[0]` |
| ✅ **无需 priority 参数** | 不需要任何未文档化的 priority 提升手段 |
| ✅ **无需禁用内置行** | 内置插件保持启用，`modelDirectories` 服务与 `/model` 命令全部存活 |
| ✅ **A 方案成立** | 按原设计实现两级选择器即可 |

### 重要反直觉现象

重启后 `occupants` 仍然只显示一条：

```json
"occupants": [{ "registrant": "Gb", "priority": 0, "active": true }]
```

**尽管界面渲染的确实是我们的组件。**

**实践结论（务必写进后续文档）**：

> `Slots.listSubTree` 返回的 `occupants` 数组**不能**用来判断"谁赢了"，也**不能**用来断言"某个注册不存在"。
> 判断 winner 的唯一可靠方式是**实际渲染结果**（界面上看到的是谁的组件）。

---

## 5. 关键发现三：必须重复声明 `label` 子 Slot

对比重启前后 `Slots.listSubTree` 的 `trees` 部分：

| 时点 | `conversation.input.model` 的 children |
|---|---|
| 重启前（内置为 winner） | `[{ "name": "conversation.input.model.label", ... }]` |
| 重启后（我们为 winner） | `[]` ← **子 Slot 声明消失了** |

**原因**：单例 Slot 的子 Slot 声明来自 **winner 的注册参数**。我们赢下座位但注册时未声明 `children`，内置的 `label` 子 Slot 声明随之消失。

**M2 实现必须带**：

```js
ctx.slots.register({
  name: 'conversation.input.model',
  children: {
    'conversation.input.model.label': { kind: 'single', scope: 'session', inline: true },
  },
  ...
}, Component);
```

**风险性质**：静默回归。当前无第三方插件使用该子 Slot，界面看不出异常；但一旦有插件使用就会失效，且很难排查。

---

## 6. 验证项汇总

| 项 | 状态 | 结论 |
|---|---|---|
| **V1** 注册能否显示在座位上 | ✅ 通过 | 能，且能抢占内置成为 winner |
| **V2** `modelDirectories` 跨插件可访问 | ⏳ 待确认 | 探针已在 `useEffect` 打印，需控制台日志 |
| **V3** 有无 priority 提升手段 | ✅ 不需要 | V1 已通过，无需抢占手段 |
| **V4** `label` 子 Slot 是否需重复声明 | ✅ 需要 | 见第 5 节 |

### V2 的验证方式（可选）

打开开发者工具（桌面端 `Ctrl+Shift+I`）→ Console，查看 `[spike]` 日志：

```
[spike] modelDirectories = FOUND
[spike] directoryFor -> OK
[spike] groups = zai-coding-cn(4) qiniu(6) lyrouter(21) kimi-api(2)
```

若为 `MISSING`，M2 需要走 slot `inject` 通道拿目录（内置插件即如此）。
**不确认也能开工**：M2 第一次调用 `directoryFor()` 时立即会暴露问题。

---

## 7. 对开发的影响

### 7.1 开发工作流（重要）

```
改 client.js → 重启应用 → 验证
```

**没有热更新**。每次改代码都必须重启整个桌面应用才能看到效果。这会影响开发节奏：

- 尽量一次改多行再重启
- 关键逻辑先在自己脑子里/用 node 单测验证，减少重启次数
- 纯函数（匹配、排序、effort 继承）应抽出来做单测，不依赖宿主

### 7.2 设计文档需更新的点

| 位置 | 更新内容 |
|---|---|
| design.md §3.3 | 删除"注册顺序胜负未知"的风险描述，改为"已实测：可抢占" |
| design.md §3.5 | `label` 子 Slot 从"需处理"升级为"必须声明，否则静默回归" |
| design.md §9 | 补充"判断 winner 只能用渲染结果，不能用 occupants" |
| TASKS.md T-38 | 从"声明 label 子 Slot"改为**必做项**，并标注静默回归风险 |
| TASKS.md §8 | 补充"改代码必须重启应用"这条坑 |

---

## 8. 回滚方式（T-23）

```powershell
dsh plugin --profile desktop remove @local/dsh-model-picker-spike
```

或使用 `plugin_manager` 的 remove 动作。卸载后重启应用，模型按钮应恢复内置选择器。
