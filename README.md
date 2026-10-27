# dsh-model-picker-2level

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的两级模型选择器：先选供应商，再选该供应商下的模型。

![效果图](docs/assets/model-picker-2level.png)

> **当前版本 `0.1.5` —— 基本功能定稿，用户实测通过，59 项自动化测试通过。**
> 定稿范围与已知限制见 [docs/releases/v0.1.5.md](docs/releases/v0.1.5.md)。

## 为什么

配置了多家模型供应商之后，模型下拉会变成一个长长的平铺列表。以本项目开发时的真实配置为例：4 家供应商、约 33 个可选模型，找目标模型需要滚动逐条扫描。

本插件把选择拆成两级：

```
① 供应商   zai-coding-cn · qiniu · lyrouter · kimi-api
                ↓ 点选
② 模型     lyrouter 下的 21 个模型（只列本家）
```

## 特性

- **两级导航**：一级只列供应商（含别名、模型数、「当前使用」徽章），二级只列该家模型
- **浏览与使用解耦**：一级点哪家就浏览哪家，与当前在用的供应商无关
- **保留原搜索**：一级可跨全部供应商搜索；二级搜索只搜本家
- **思考强度可记忆**：按模型记住选择，切走再切回不会重置为「供应商默认」
- **当前项聚焦**：打开时自动高亮当前模型
- **配置顺序不变**：列表顺序严格跟随 `llm-pi-ai` 配置，只做强调不做重排
- **键盘可用**：↑↓ 移动、Enter 打开或确认、Esc 先清搜索再返回；无 Tab 返回或空格激活快捷键，输入法安全
- **点外部关闭**：弹层外任意位置按下即关闭
- **跟随窗口**：最大化/还原/滚动时弹层重新定位，不漂移
- **主题一致**：仅使用 `--dsw-alias-*` 主题令牌，跟随亮/暗色切换
- **失败可诊断**：目录不可用时按钮变红、可点开看完整错误并重试

## 状态

| 阶段 | 状态 |
|---|---|
| 设计方案 | ✅ → [docs/design.md](docs/design.md) |
| M1 Spike 验证 | ✅ → [docs/m1-spike-result.md](docs/m1-spike-result.md) |
| M2 MVP | ✅ 已实测通过 → [docs/m2-implementation.md](docs/m2-implementation.md) |
| M3 打磨 | 🟡 部分（键盘/无障碍/i18n 已做；动画、Config、像素级对齐待办） |
| 基本功能定稿 | ✅ v0.1.5 → [docs/releases/v0.1.5.md](docs/releases/v0.1.5.md) |

**接手开发请按此顺序读**：

1. 本文件（是什么、怎么跑）
2. [docs/releases/v0.1.5.md](docs/releases/v0.1.5.md) —— **当前定稿：功能范围、验收结果、已知限制**；架构细节另见历史 v0.1.4 存档
3. [docs/TASKS.md](docs/TASKS.md) —— 完整任务清单、依赖关系、验收标准
4. [docs/design.md](docs/design.md) + [docs/decisions.md](docs/decisions.md) —— 设计与决策依据（**不要轻易推翻**）

## 安装

本插件当前**未发布到 npm**，用本地目录安装：

```bash
# 本地目录安装（开发期）；装完必须重启桌面应用
dsh plugin --profile desktop add "D:/vibe_coding/dsh-plugin-develop"
```

也可在会话里用 `plugin_manager` 工具安装：`install_bundle target=D:\vibe_coding\dsh-plugin-develop`。

卸载：

```bash
dsh plugin --profile desktop remove @local/dsh-model-picker-2level
```

卸载与回滚的详细验证步骤见 [docs/releases/v0.1.4.md §6](docs/releases/v0.1.4.md)。

## 开发

用户功能、实际键位及人工验收步骤见 [用户说明与验收手册](docs/user-guide-and-acceptance.md)。

```bash
# 安装仅供测试使用的 React / ReactDOM / jsdom（宿主运行时不依赖这些安装）
npm ci

# 清单与入口校验
npm run validate

# 全部自动化测试：纯函数、包结构和真实 React DOM 交互
npm test
```

> 若 `npm test` 因沙箱禁止派生子进程报 `spawn EPERM`，直接 `node <file>` 执行即可，效果等价。

本项目**无构建步骤**：`client.js` 直接以 `window.__ModuleLoader__.load(...)` 形式交付，仓库内提交的就是运行产物。

> ⚠️ **改完 `client.js` 必须重启桌面应用**才能验证（客户端模块无热重载）。
> 纯函数通过 `__pure` + `node:vm` 单测；交互测试用真实 React 和 jsdom 验证事件冒泡、异步写回及会话切换。
> 当前审视与验证范围见 [docs/review-2026-10-27.md](docs/review-2026-10-27.md)。

## 项目结构

```
.
├─ .github/                     GitHub 模板与 CI
├─ docs/
│  ├─ releases/v0.1.5.md        ★ 当前定稿存档（接手先读这个）
│  ├─ TASKS.md                  ★ 开发任务清单
│  ├─ design.md                 设计方案
│  ├─ decisions.md              决策记录（ADR）
│  ├─ m1-spike-plan.md          M1 验证方案
│  ├─ m1-spike-result.md        M1 实测结论
│  ├─ m2-implementation.md      M2 实现记录 + 修复记录
│  └─ assets/                   效果图
├─ locale/                      Store 元数据（UI 字典内联在 client.js）
├─ scripts/validate.mjs         清单与入口校验
├─ test/                        Node 内置 test runner
├─ client.js                    浏览器半（纯函数 + 样式 + 组件 + 注册）
├─ cordis.patch.yml             Loader patch：把插件插进 profile
├─ icon.svg                     插件图标
├─ index.js                     Host 半（空实现）
└─ package.json                 含 dsh.bundle / dsh.client 声明
```

## 实现要点

| 关注点 | 做法 |
|---|---|
| 模型目录数据 | 复用内置 `modelDirectories` 服务，不自建状态 |
| 注入依赖 | `['slots','modelDirectories','sessions','remote','remote.session']`（**`remote` 不能少**） |
| 选择写回 | 复用 `directory.select()`，与 `/model` 走同一条路径 |
| 座位 | 注册到 `conversation.input.model`（单例 Slot），并重新声明 `.label` 子 Slot |
| 数据来源 | 全部来自 Host 投影，插件不 fold 会话事件 |
| 样式 | 只用 `--dsw-alias-*` 令牌，类名 `dmp-` 前缀 |

原理与踩坑细节见 [docs/design.md](docs/design.md) 第 6 章与
[docs/releases/v0.1.4.md](docs/releases/v0.1.4.md) 第 2 章。

## 已知限制

- 无打开/切层动画
- 插件 Config 未接线（搜索范围、计数显示等为硬编码默认值）
- `aria-activedescendant` 未实现
- 思考强度记忆仅在当前应用进程内有效
- 未发布 npm

## 贡献

见 [CONTRIBUTING.md](CONTRIBUTING.md)。提交前请确认校验与三套测试全绿。

## 许可证

[MIT](LICENSE)
