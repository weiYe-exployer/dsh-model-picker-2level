# 安全策略

## 支持的版本

| 版本 | 支持 |
|---|---|
| 0.1.x | ✅ |

## 报告漏洞

请**不要**通过公开 issue 报告安全问题。请使用 GitHub 的
[私密漏洞报告](https://docs.github.com/zh/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability) 功能。

报告中请包含：

- 受影响的版本
- 复现步骤或 PoC
- 影响评估（例如：是否能读取到 API Key、是否能越权调用工具）

我们会在 72 小时内确认收到，并在修复后公开致谢（如你同意）。

## 本插件的安全边界

- 插件**不读取、不存储、不传输**任何 API Key。模型凭证由 Harness 的 credentials 服务管理，插件只通过宿主的 `modelDirectories` 服务间接使用模型目录与选择能力。
- 插件不发起任何网络请求。
- 插件不写会话日志，不新增会话事件类型。
- 插件 UI 只渲染在当前 Harness Web 页面内，不创建 iframe、不操作 `document.body`。
