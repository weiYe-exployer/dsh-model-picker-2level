# 公开仓库与分发准备

当前是公开准备阶段，已确认采用 GitHub 开源与 npm 发布，源码已上传 GitHub，npm v0.1.6 发布流程已准备；最终发布状态以 npm registry 为准，市场提交另行跟进。v0.1.5 标签保留已验收的功能内容；维护者已授权将已有两次提交和两个标签中的邮箱替换为 GitHub 隐私邮箱，代码树保持一致。公开准备产生的后续内容修改须用新提交及新版本记录，不覆盖基线内容。

## 已整理

- 用户指南、测试范围、架构、贡献约定和路线图分开维护；开发试验归档，不进入安装包。
- 安装示例使用仓库相对路径，可替换 profile，不依赖开发者的机器路径。
- 核实 DSH 运行时 0.2.1-rc.3，包暂时精确声明此版本；桌面外壳版本不作为兼容范围依据。
- 安全说明反映实际 body portal、宿主写回和间接网络行为，不承诺固定漏洞响应时限。
- 实际打包并隔离安装检查，验证安装包内文档目标完整。
- 已确认 GitHub 账号 weiYe-exployer、npm 账号 codewei823；正式包名为 @codewei823/dsh-model-picker-2level，公开仓库 weiYe-exployer/dsh-model-picker-2level 已创建，源码已上传；按维护者发布指令移除 private 并保留 public 发布配置。

## 发布前必须完成

| 项目 | 当前状态与动作 |
|---|---|
| GitHub owner / repository | weiYe-exployer/dsh-model-picker-2level；源码已上传 main，元数据已填写，CI 状态以仓库为准 |
| 公开作者身份 | 已按维护者授权使用 GitHub ID 格式的 noreply 邮箱，已有提交和标签邮箱已处理；作者名称保留 codeWei，原历史备份保留在公开仓库外 |
| 正式包名与分发渠道 | GitHub + npm；npm 用户 codewei823，本机 npm whoami 已验证；清单、模块 id、patch、锁文件和当前安装说明已统一到 @codewei823/dsh-model-picker-2level；旧安装迁移待完成 |
| 当前真实截图 | 已在维护者确认后截取 Harness 供应商页和模型页，裁剪为只含选择器的区域；已加入中英文 README，并通过安装包链接检查 |
| 目标市场 | 等确认具体索引或社区；不把 GitHub 公开等同于自动上架 |
| GitHub 维护设置 | 建仓后开启 Issues 与私密漏洞报告，检查 bug / enhancement 标签和通知渠道 |
| 最终来源安装 | 用隔离 profile 从最终 Git / tgz / npm 来源回装、重启与卸载，确认相同功能 |
| 远端 CI | 推送后检查 Windows / Ubuntu 的 Node 20 / 22 / 24 结果 |

## 旧本地包迁移

旧包名为 @local/dsh-model-picker-2level，新包名为 @codewei823/dsh-model-picker-2level，两者使用相同的 Slot 和 patch 行 id，不应同时保留。后续在实际使用的 profile 中先移除旧包，再安装新包，随后重启整个 Harness：

```sh
dsh plugin --profile desktop remove @local/dsh-model-picker-2level
dsh plugin --profile desktop add .
```

以上操作会修改该 profile，因此本次元数据准备没有自动修改日常使用环境。使用其他 profile 时替换 desktop；发布前需要独立验证迁移。

## 发布检查

```sh
npm ci
npm run validate
npm test
npm run check:package
```

当前检查不替代任意格式的凭证审计。公开前检查所有待推送文件、图片、Git 提交作者和历史中的个人路径 / 凭证。本次工作树清理不会删除 v0.1.5 或更早提交中的内容。需要去除历史私人信息时，应先由维护者确认公开历史策略，再做备份与处理。

## GitHub、npm 与市场

GitHub 用于源码和协作，Release 可提供 tgz 下载。当前 JavaScript 已是运行产物，不需要新增 prepare 构建脚本。Git 来源和 tgz 安装流程参阅 [DSH 官方安装文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md)。

若选择 npm：先确认包名权限，统一更名 package.json、client 模块 id、patch、锁文件、测试和安装 / 卸载文档，验证旧安装迁移；实际准备发布时才关闭 private，并配置正确的访问级别与发布身份。不要把 token 写入仓库。

DSH 当前主线索引接受 npm 来源或固定 Git commit 来源，需要有效 engines.dsh 且与包清单一致。目标索引可能有另外的提交与审核流程，按其维护者规则准备资料。[官方索引格式](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/implemented/feature/2026-10-02-plugin-market-index-format.md)

对外发布需要单独执行，不由 validate、check:package 或 CI 自动触发。
