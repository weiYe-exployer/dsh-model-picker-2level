> 历史归档：保留早期设计与试验背景，部分内容已被后续版本取代。当前操作以 [用户指南](../usage.md)、[测试说明](../testing.md) 和 [架构说明](../architecture.md) 为准。

# M1 Spike 验证方案

> 目的：在写正式代码前，用最小代价证实 A 方案的三个技术未知项。
> 预计耗时：30 分钟。产出：一份结论 + 是否继续 A 的决策。
> 前置：[插件设计方案](design.md) 已评审通过。

---

## 0. 为什么必须先做这个

A 方案的整个可行性依赖一个未实测的机制：**两个插件注册同一个单例 Slot 时，谁成为 `entriesOfSlot()[0]`**。

已核实的宿主代码（`dsh-client-ui-renderer/lib/client.js`）：

```js
if (spec.kind === "single") {
  const entry = host.entriesOfSlot(slotKey)[0];   // 只取第 0 个
  if (!entry) return deadCell() / fallback;
  return guarded(entry, ...);
}
```

已核实的注释：*"Shadowing winners per cell for a key: the first live (non-abdicated) entry of each cell **in priority order** — what outlets render"*。

**未知**：priority 相同（内置是 0，插件默认也是 0）时，"in priority order" 如何排列——按注册先后？按 id？还是未定义？

**且**：内置插件的注册参数里没有可用的 priority 提升入口（`Slots.listSubTree` 显示 `priority: 0`，注册 API 未暴露该参数）。

如果结论是"内置赢且无法抢占"，A 方案不成立，必须改 B。**所以这一步不能跳过，也不能靠猜。**

---

## 1. 验证项与判定标准

| # | 待验证 | 判定标准 | 若为否 |
|---|---|---|---|
| V1 | 我们的注册能否显示在 `conversation.input.model` | 界面上出现诊断按钮而非内置模型按钮 | → V3 |
| V2 | `modelDirectories` 服务能否跨插件访问 | 插件内 `ctx.get('modelDirectories')` 拿到对象且 `directoryFor()` 可用 | → 检查 slot `inject` 通道是否可替代 |
| V3 | 是否存在可用的 priority 提升手段 | 见 §3 的三种尝试，任一成功即算通过 | → 改走 B 方案 |
| V4 | 我们成为 winner 后，内置的 `label` 子 Slot 是否需重复声明 | 诊断组件内 `renderSlot('conversation.input.model.label')` 是否报错 | → 在插件内补声明 |

---

## 2. Spike 产物（最小包，只用于验证，验证完删除）

```
spike/
├─ package.json         # dsh.bundle.patch + dsh.client（inject 内置插件）
├─ cordis.patch.yml     # insert 一行
├─ index.js             # Host 半：export function apply() {}
├─ client.js            # 诊断组件：一个醒目按钮 + 读服务结果打印到控制台
├─ locale/zh.json       # meta.title/description
└─ icon.svg             # 必需（否则安装检查不过）
```

### 2.1 client.js 的关键内容（伪代码）

```js
window.__ModuleLoader__.load({
  id: '@local/dsh-model-picker-spike',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    function Probe(props) {
      const models = props.ctx?.get?.('modelDirectories');
      React.useEffect(() => {
        console.log('[spike] modelDirectories =', models);
        console.log('[spike] props keys =', Object.keys(props));
        try {
          const dir = models?.directoryFor?.(props.sessionId);
          console.log('[spike] directoryFor ok =', !!dir, dir && Object.keys(dir));
        } catch (e) { console.log('[spike] directoryFor failed:', e.message); }
      }, [models]);
      return h('button', {
        style: { background: '#ff4d6d', color: '#fff', borderRadius: 6, padding: '2px 10px', fontSize: 12 },
      }, 'SPIKE');
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('conversation.input.model', () => ctx.slots.register({
          name: 'conversation.input.model',
          locale: 'spike',
          inject: (sessionId) => ({ sessionId, ctx }),
        }, Probe));
      },
    };
  },
});
```

### 2.2 安装与观察

1. `plugin_manager install_bundle` → 记录 `application` 与 `warnings`
2. `cordis_inspect_query` `Slots.listSubTree(root: "conversation.input.model")` → **看 occupants 数组顺序**
   - 若 occupants 里我们的条目排第 0 → 我们赢 → V1 通过
   - 若排第 1 且 `active: true` 的是内置 → 内置赢 → 进 V3
3. 连上页面看实际渲染：红色 `SPIKE` 按钮是否出现在模型按钮位置
4. 浏览器控制台看 `[spike]` 日志 → 判断 V2/V4

---

## 3. 若内置赢（V3）的三种尝试

按代价从低到高，逐个试，任一成功即停：

| 尝试 | 做法 | 成功判定 |
|---|---|---|
| **T1 未文档化的注册参数** | 在 `slots.register({...})` 里试 `priority: 1` / `shadow: true` / `force: true`，看是否被接受且生效（观察 occupants 顺序） | occupants 里我们排第 0 |
| **T2 让内置条目放弃** | 是否可通过 patch 覆盖内置行的 config 传入某个开关（需先查该包 Config Schema 有无 UI 相关项） | 内置 entry 变非 live / abdicate |
| **T3 改注册时机** | 调整 `dsh.client.inject` 顺序或去掉它，让我们的模块先于内置激活 | occupants 里我们排第 0 |

> 注意：**不要**为了抢占而故意让内置组件崩溃（`reportEntryError(abdicate: true)` 会让它让位）。这是脆弱且有副作用的做法，会让内置的其它职责一起失效，也违反"用最弱机制"的原则。

### 若三种都失败

结论：**A 不可行**，改走 B 方案（`conversation.input.left` 新增按钮）。B 的代码与 A 共用 90%，只需改：
- 注册的 Slot 名
- 触发按钮的样式（从"替换模型按钮"变成"新增小按钮"）

---

## 4. 验证记录表（执行时填写）

| 项 | 期望 | 实测 | 结论 |
|---|---|---|---|
| 安装 `application` | `applied` | | |
| occupants 顺序 | 我们第 0 | | |
| 红色 SPIKE 按钮可见 | 是 | | |
| `modelDirectories` 可访问 | 是 | | |
| `directoryFor()` 可用 | 是 | | |
| `renderSlot('...label')` 正常 | 是/需声明 | | |
| `/model` 命令仍在 | 是（内置未禁用） | | |
| 卸载后恢复内置 | 是 | | |

---

## 5. 退出条件

- **A 可行** → 删除 spike 包，进入 M2（按设计方案第 4~8 章写正式插件）
- **A 不可行** → 删除 spike 包，更新设计文档第 3 章，按 B 方案进入 M2
- 两种情况都必须：卸载 spike 插件，确认界面回到内置状态（验证可撤销性）
