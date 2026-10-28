# 架构与兼容边界

## 插件形态

- index.js 是 Host 入口，导出空 apply；用户功能位于 client.js。
- client.js 是直接交付的运行文件，通过 window.__ModuleLoader__.load 注册，不需要构建。
- cordis.patch.yml 作为 bundle 配置层插入插件；package.json 声明 dsh.bundle 和 Web 客户端入口。
- React / ReactDOM 由宿主模块表提供，不作为运行时 npm 依赖打包。

## 模型目录与选择

组件通过 modelDirectories.directoryFor(sessionId) 获取目录 store、load 与 select，使用 useSyncExternalStore 订阅。目录和会话实际选择均由宿主投影提供；插件不 fold 会话事件，不维护第二份权威会话状态。

模型与强度的变更统一调用 directory.select。它会改变宿主会话选择，因此“只读目录”不等于“插件没有写回”。供应商凭证配置由宿主管理，本插件不读取凭证服务。

内部浏览的供应商与当前使用的供应商分别保存。会话 id 作为内部组件 key，确保会话切换重新绑定目录并清理订阅；同步 ref 互斥提交，菜单轮次与卸载标记隔离异步完成回调。

强度偏好 Map 以供应商 + 模型为键，属于进程内共享偏好，不是会话实际值的替代来源。只有成功提交或宿主实际值回灌时更新；重启后不持久化。

## Slot 与 UI

插件注册 conversation.input.model 单例 Slot，保留内置模型插件启用，以继续使用其目录服务和 /model 命令。当前选择器依赖经验证的注册顺序胜出行为，宿主升级需复测。

胜出的注册同时声明 conversation.input.model.label 子 Slot，保留第三方集成的声明契约。Slot 诊断里的 occupants 不单独作为实际渲染者证据，应结合真实界面验证。

菜单通过 ReactDOM.createPortal 挂到宿主 document.body；组件内注入带 dmp- 前缀的主题样式，并监听外部点击、resize 和滚动。固定定位跟随触发按钮，卸载 / 关闭时清理订阅和事件。

## 国际化

client.js 内的 zh / en 字典由 ctx.locale.register 注册，用于界面文案；locale/zh.json 与 locale/en.json 提供插件元数据。新增 UI 文案要同步两种内联字典。

## 兼容声明

本次已确认的运行时为 DSH 0.2.1-rc.3；engines.dsh 暂采用精确版本，避免对尚未验证的宿主版本作兼容承诺。Windows 桌面验收不等于 Linux / macOS 宿主已实测。核心 API、注入能力、Slot 胜出顺序和主题令牌均应在宿主升级时复验。

长期决策见 [ADR](decisions.md)，操作与键位见 [用户指南](usage.md)。
