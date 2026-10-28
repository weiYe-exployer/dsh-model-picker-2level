> 历史归档：保留早期设计与试验背景，部分内容已被后续版本取代。当前操作以 [用户指南](../usage.md)、[测试说明](../testing.md) 和 [架构说明](../architecture.md) 为准。

# 阶段 C 实现记录（M2 MVP）

> 日期：2026-10-27
> 状态：代码完成、单元测试通过、已安装到 profile；**待重启应用做真机验证**
> 相关：[TASKS.md](TASKS.md) T-30~T-38、[design.md](design.md)、[decisions.md](../decisions.md)

---

## 1. 交付内容

| 文件 | 行数 | 内容 |
|---|---|---|
| `client.js` | 862 | 完整两级选择器（组件 + 纯函数 + 样式 + i18n） |
| `test/pure.test.mjs` | 219 | 21 项纯函数单测 |
| `test/package.test.mjs` | — | 8 项结构测试（原有） |

自检结果：

```
validate        ok（0 problem）
package.test    8 / 8 pass
pure.test       21 / 21 pass
```

---

## 2. 实现要点

### 2.1 数据来源（遵守"不自建状态"铁律）

```js
ctx.inject(['slots', 'modelDirectories', 'sessions'], (scope) => {
  scope.slots.register({
    name: 'conversation.input.model',
    inject: (sessionId) => {
      const directory = scope.modelDirectories.directoryFor(sessionId);
      return {
        store: directory.store,     // 订阅快照
        load: () => directory.load(),                    // 打开时加载
        select: (sel) => directory.select(sel),          // 写回
      };
    },
  }, ModelPicker);
});
```

组件用 `useSyncExternalStore` 订阅 `directory.store`，**当前选中项永远读 `state.current`**，不保存第二份状态。

### 2.2 子代理会话禁用

```js
const isSubagent = sessions.subagentAddress(sessionId) !== undefined;
if (isSubagent) return { available: false, locked: false };
```

触发按钮随之 `disabled`。

### 2.3 ⚠️ 规则 R2 已落实

```js
children: {
  'conversation.input.model.label': { kind: 'single', scope: 'session', inline: true },
}
```

并有专门测试守护（`test/pure.test.mjs` 里 `plugin re-declares the model seat child slot`）。

### 2.4 两级导航

| 层级 | 内容 | 排序 | 焦点 |
|---|---|---|---|
| 一级 | 供应商 id + 中文别名 + 「N 个模型」+ 「当前使用」徽标 | **配置顺序**（account/official 优先，其余保持原序） | 打开即落在当前供应商行 |
| 二级 | 模型 id（等宽字体）+ 当前项打勾 | **配置顺序** | 落在当前模型并 `scrollIntoView` |

### 2.5 搜索（保留原功能）

| 位置 | 范围 | 结果形态 |
|---|---|---|
| 一级 | **全部供应商的全部模型**（等价现状） | 扁平列表，每行带供应商名 |
| 二级 | **仅当前供应商** | 扁平列表，无供应商副标题 |

- 匹配语义：连续子串命中最优（score 0），散序命中次之（1000 + 首个命中位置），与内置 `rankByName` 风格一致
- 清空输入 → 回到两级浏览（不关闭）
- Esc → 先清空搜索 → 再逐级返回 → 最后关闭

### 2.6 选择写回

```js
selectionFor(current, group, model)
// → { provider, model, reasoningEffort? }
```

`reasoningEffort` 规则（有单测覆盖）：
- 重选当前模型 → 沿用当前 effort
- 选别的模型 → 用该模型的 `reasoning.defaultEffort`

失败处理：
- `session/writer-held` → 「该会话正在写入，请稍后重试」
- 其他错误 → 就地显示错误条 + 重试按钮，**不关闭面板**

### 2.7 样式

全部使用 `--dsw-alias-*` 令牌，类名 `dmp-` 前缀，选择器限定在组件内。有测试守护：

```js
test('plugin only uses theme tokens for colours')  // 正则扫描 CSS，禁止 #hex / rgba()
```

---

## 3. 纯函数清单（`__pure` 面）

| 函数 | 作用 | 测试数 |
|---|---|---|
| `subsequenceScore` | 模糊匹配打分 | 4 |
| `rankModels` | 过滤 + 排序一个供应商的模型 | 4 |
| `orderProviders` | 供应商排序（account/official 优先） | 2 |
| `resolveEffort` | effort 继承规则 | 3 |
| `selectionFor` | 构造 selection payload | 2 |
| `providerLabel` | 供应商显示名 | 1 |
| `totalModels` | 模型总数 | 1 |
| `flatMatches` | 跨供应商扁平化 | 1 |
| 契约测试 | R2 子 Slot、无宿主依赖、无字面颜色 | 3 |

**为什么这么做**：桌面端无热更新（规则 R3），每次验证要重启应用。纯函数抽出后可在 node 里秒级验证。

---

## 4. 待验证项（重启后）

| # | 检查 | 预期 |
|---|---|---|
| V1 | 模型按钮外观 | 与内置一致（图标 + `供应商 / 模型` + effort + chevron） |
| V2 | 打开后焦点 | 落在当前供应商行（provider-c） |
| V3 | 一级列表 | 4 家供应商，provider-c 行有「当前使用」徽标 |
| V4 | 点 provider-c | 进入二级，21 个模型，当前项打勾且已滚动到可见 |
| V5 | 搜索 `glm`（一级） | 跨供应商命中 8 条，带供应商名 |
| V6 | 进入 provider-c 后搜索 `glm` | 只命中 `z-ai/glm-5.3`、`z-ai/glm-5.3-flash` |
| V7 | 清空搜索 | 回到两级浏览 |
| V8 | 选中一个模型 | 面板关闭，按钮显示新模型，**发消息确认真生效** |
| V9 | 键位 | ↑↓ / Enter / Esc / Tab 全流程可用 |
| V10 | `/model` 命令 | 仍可用（内置行未禁用） |
| V11 | `label` 子 Slot | `Slots.listSubTree` 能看到 |

---

## 5. 已知限制

1. **菜单定位**：打开时按 `getBoundingClientRect()` 计算位置，窗口 resize / 滚动时不会跟随重算。正常使用（点击后立即选）无影响；若滚动到底部再打开可能偏移。
2. **无动画**：design.md §7 里的淡入/横移动画尚未实现（属 M3 T-43）。
3. **Config 项未接**：design.md §8 的 `searchScope` / `showModelCount` 等尚未读取插件 Config（属 M3 T-45），当前为硬编码默认行为。
4. **无障碍**：`role` / `aria-*` 已加，但未做完整的键盘焦点陷阱与屏幕阅读器验证（属 M3 T-41）。

---

## 6. 回滚

```powershell
dsh plugin --profile desktop remove @local/dsh-model-picker-2level
```

移除后重启应用，界面恢复内置选择器。

## 9. M2 修复记录（0.1.1 → 0.1.3）

| 版本 | 现象 | 根因 | 修复 |
|---|---|---|---|
| 0.1.1 | 按钮显示「选择模型」、点不开 | 从不在挂载时预热目录 → 快照为空 | 解析成功即 `load()`；无快照视为加载态 |
| 0.1.1 | `directoryFor()` 抛错后按钮永久禁用 | 一次性 try/catch 静默降级 | 延迟解析 + 8 次退避重试 |
| 0.1.2 | 「模型目录不可用：cannot get property "remote" without inject」 | `ModelDirectoryResolver.directoryFor()` 内部读 `this.ctx.remote.session`，Cordis 把服务面重绑到**调用方**上下文；本插件未注入 `remote` | `ctx.inject` 依赖扩展为 `['slots','modelDirectories','sessions','remote','remote.session']` |
| 0.1.2 | 错误文本不可见 | 按钮宽度截断 | 不可用时按钮可点，展开诊断面板显示全文 + 重试 |
| 0.1.3 | 二级列表恒为「当前使用的供应商」 | `browsingGroup` 由 `currentGroup` 推导 | 新增独立 `browsingGroupId`；抽纯函数 `resolveBrowsingGroup()` |
| 0.1.3 | 窗口最大化后菜单漂移 | 坐标只在打开时算一次 | 监听 `resize`/`scroll`(capture)/`visualViewport`，rAF 合并 |

### 关键教训（补充 §8 陷阱表）

- **Cordis 服务面是 Proxy，连 `typeof face.method` 都会抛**
  `cannot get property "x" without inject`。能力探测必须逐个 try/catch。
- **跨插件调用内置服务时，要声明该服务内部会访问的依赖**。
  只注入 `modelDirectories` 不够，还要注入它实现里用到的 `remote` / `remote.session`。
- **UI 状态不要从「当前生效值」推导**。浏览目标与选中状态必须是两个独立状态。
- **浮层定位必须跟随容器变化**，只在 open 时测量一定会漂移。

## 10. M2 修复记录（0.1.4）

| 现象 | 根因 | 修复 |
|---|---|---|
| 第三方供应商模型的思考强度总是「供应商默认」，切走再切回被重置 | 只有「当前在用模型」的 `reasoningEffort` 被会话记住；`resolveEffort()` 对其他模型直接回落 `model.reasoning.defaultEffort` | 新增 `effortMemory: Map<provider/model, effort>`：显式选强度时记录、选模型时记录实际提交值、会话生效值回灌记忆。优先级：在用强度 → 记忆 → 模型默认 |
| 点击弹层外部不关闭 | 只有 `onBlur` 处理，点击非焦点元素不触发 | 文档级 `pointerdown`(capture) 监听；命中 `menuRef`（body portal）或 `rootRef` 时忽略，其余 `closeMenu()` |

### 关键教训（补充 §8 陷阱表）

- **弹层在 portal 里，包含性判断要针对 portal 节点**，不能用触发按钮的子树替代。
- **React effect 的依赖数组在渲染期求值**：把 `useEffect(..., [closeMenu])` 放在
  `const closeMenu` 声明之前会直接抛 TDZ `Cannot access before initialization`。
- **`undefined` 在「记住的选择」里是有效值**，必须用 `Map.has()` 区分
  「记住的是默认值」与「从未记住」。
