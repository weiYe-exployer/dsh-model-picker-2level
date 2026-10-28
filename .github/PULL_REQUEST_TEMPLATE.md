## 这个 PR 做了什么

<!-- 一句话说明意图 -->

## 为什么

<!-- 关联 issue：Closes #12 -->

## 改动类型

- [ ] 新功能（feat）
- [ ] 缺陷修复（fix）
- [ ] 文档（docs）
- [ ] 重构（refactor）
- [ ] 测试（test）
- [ ] 构建/CI（chore）

## 如何验证

<!-- 步骤、截图、控制台输出 -->

```bash
npm run validate
npm test
npm run check:package
```

## 检查清单

- [ ] `npm run validate` 通过
- [ ] `npm test` 通过
- [ ] `npm run check:package` 通过
- [ ] 在真实 Harness 里安装并手动验证过（说明验证了哪些操作）
- [ ] 未引入 `@deepseek-ai/dsh-client-*` 的 require
- [ ] 样式只使用 `--dsw-alias-*` 令牌
- [ ] UI 文案同步 `client.js` 的 `zh` / `en` 字典；插件元数据变更同步 `locale/zh.json` 与 `locale/en.json`
- [ ] 更新了 `CHANGELOG.md`（如适用）
