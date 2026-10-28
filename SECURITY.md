# 安全策略

## 支持范围

当前维护功能基线为 v0.1.5。请先在当前维护版本复现；宿主兼容范围以 package.json 的 engines.dsh 和测试说明为准。

## 报告漏洞

公开仓库启用 GitHub Private vulnerability reporting 后，请使用仓库 Security 页的私密报告入口。启用方式见 [GitHub 官方说明](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/configure-for-a-repository)。仓库尚未建立或私密入口不可用时，请勿把密钥、私密日志或可利用的漏洞细节提交到公开 Issue；可以先请求维护者提供私密联系渠道。

报告请包含受影响插件及 DSH 版本、最小复现、影响和经过脱敏的证据。不要提交真实凭证。维护者会尽力及时处理，当前不承诺固定响应时限。

## 安全边界

- 插件代码不读取、存储或直接传输供应商 API Key，不访问宿主凭证服务。
- 插件没有直接使用 fetch / XMLHttpRequest 发起网络请求；目录加载和选择通过宿主服务完成，宿主可能按自身实现访问网络、保存会话选择或记录日志。
- 选择通过 directory.select 写回宿主会话；插件不自行写会话日志或新增事件类型。
- 菜单通过 ReactDOM.createPortal 挂载到当前宿主页面的 document.body，不创建 iframe；样式注入页面 head。
- 诊断中可能包含宿主错误文本和路径，公开日志或截图前需要脱敏。
- 插件不是沙箱隔离的权限边界。安装时应核实来源、版本及宿主的权限与兼容提示。

## 仓库维护设置

公开前需要由仓库管理员实际启用私密漏洞报告，并确认维护者能接收通知。写入本文件不会自动开启 GitHub 设置。
