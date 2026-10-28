# 架构决策（ADR）

以下为当前采纳的决定。历史试验归档不作为当前键位或安装规范。

## ADR-0001：接管现有模型入口

保留宿主内置模型插件启用，复用其目录服务与 /model 命令，仅注册同一 conversation.input.model 单例 Slot 接管界面。依赖经实测的注册顺序胜出行为，宿主升级需复测。

## ADR-0002：直接交付 JavaScript

client.js 与 index.js 为交付产物，不引入构建流程或运行时依赖；React 由宿主提供。当前体量适合此形态，未来拆分需同时保证发布入口可以直接加载。

## ADR-0003：保持宿主投影为唯一实际状态来源

目录与当前会话选择来自 modelDirectories，修改统一走 directory.select。浏览状态独立于当前选择，强度 Map 只是进程内偏好，不替代会话实际值。

## ADR-0004：保留子 Slot 契约并隔离 UI

胜出的模型入口重新声明 conversation.input.model.label。菜单在 body portal 内显示，使用 dmp- 类名前缀及宿主主题令牌。直接运行文件不 require 宿主内部 UI 包，激活顺序通过 dsh.client.inject 声明。

## ADR-0005：用导出面和真实 DOM 测试交互

纯函数在 client.js 内保留，通过 __pure 导出供 node:vm 测试，不创建尚未交付的 lib/ 模块。React + jsdom 验证真实事件冒泡、effect 和异步生命周期；宿主与布局行为单独人工验收。

## ADR-0006：键盘操作保持简单

只定义 ↑↓ 移动、Enter 打开或确认、Esc 先清搜索再返回。去掉 Tab 返回、↓ 打开和按钮空格激活，不新增 Tab 焦点导航机制。

详见 [架构](architecture.md)、[用户操作](usage.md) 与 [测试范围](testing.md)。
