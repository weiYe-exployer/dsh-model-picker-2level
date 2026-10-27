# 贡献指南

## 开发环境

- Node.js ≥ 20（`node --version` 确认）
- DeepSeek Harness ≥ 0.2.1-rc.3（作为宿主验证插件行为）

本项目**没有构建步骤**：`client.js` 就是交付产物，直接以 `window.__ModuleLoader__.load(...)` 的形式提交。修改后无需编译。

## 本地校验

提交前必须通过：

```bash
npm ci            # 安装测试依赖；插件运行时仍由宿主提供 React
npm run validate   # 清单、patch、locale、图标、禁用依赖检查
npm test           # 纯函数、结构契约和 React DOM 交互测试
```

## 在宿主里试插件

```bash
# 安装到当前 profile（重启 Harness 生效）
dsh plugin --profile desktop add "<本仓库绝对路径>"

# 移除
dsh plugin --profile desktop remove @local/dsh-model-picker-2level
```

安装后打开 Web GUI，模型按钮应变为两级选择器。

## 代码约定

- **不使用构建工具**，不引入运行时依赖；`require('react')` 由宿主的模块表提供
- **不 require 任何 `@deepseek-ai/dsh-client-*` 包**（会在宿主升级时炸）；需要激活顺序时用 `package.json` 的 `dsh.client.inject`
- **样式只用 `--dsw-alias-*` 主题令牌**，不写死颜色；类名统一加 `dmp-` 前缀，选择器限制在组件根节点内
- **数据只读**：模型目录与当前选择全部来自 Host 投影，插件不 fold 会话事件、不自建第二份状态
- 所有面向用户的文案走 locale 资源，不在组件里写死中英文

## 提交信息

采用 [Conventional Commits](https://www.conventionalcommits.org/)：

```
feat: 两级导航
fix: 修正搜索清空后未回到上一级
docs: 补充 M1 验证记录
test: 增加 patch 格式断言
```

## 分支与 PR

1. 从 `main` 切出 `feat/xxx` 或 `fix/xxx`
2. 确保 `npm run validate && npm test` 通过
3. PR 描述里写明：改了什么、为什么、如何验证（附截图或日志）
4. 关联 issue（如有）：`Closes #12`

## 报告问题

用 [issue 模板](.github/ISSUE_TEMPLATE/bug_report.yml)，请附上：Harness 版本、插件版本、复现步骤、控制台报错。
