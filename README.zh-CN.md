# KeepFacts

[English](README.md) · [在线体验](https://masakinakao.github.io/keepfacts/?lang=zh) · [源码](https://github.com/MasakiNakao/keepfacts) · [隐私](SECURITY.md) · [反馈](https://github.com/MasakiNakao/keepfacts/issues)

[![在线体验](https://img.shields.io/badge/在线体验-打开-0f5d46)](https://masakinakao.github.io/keepfacts/)
[![CI](https://github.com/MasakiNakao/keepfacts/actions/workflows/ci.yml/badge.svg)](https://github.com/MasakiNakao/keepfacts/actions/workflows/ci.yml)
[![最新标签](https://img.shields.io/github/v/tag/MasakiNakao/keepfacts?sort=semver)](https://github.com/MasakiNakao/keepfacts/tags)
[![License](https://img.shields.io/github/license/MasakiNakao/keepfacts)](LICENSE)

**措辞可以改变，事实不该走样。**

[![KeepFacts v0.3.1：本地核对 AI 改写中的硬事实](public/keepfacts-share-v031.jpg)](https://masakinakao.github.io/keepfacts/?lang=zh)

KeepFacts 是一个小巧、隐私优先的 **AI 改写硬事实保留检查器**。把可信原文和 AI 改写、总结或翻译后的文本分别粘贴进去，它会对照日期、金额、百分比、数量、版本、链接和邮箱等可精确提取的事实项是否被保留、修改、遗漏或新增。

KeepFacts 不联网查证某项说法是否真实，也不判断事实真假；它只比较两版文本中能够识别的精确事实项。目前的识别规则主要针对常见中文和英文格式优化。

所有分析都在浏览器本地完成。KeepFacts 不会自动保存或上传文本，不需要账号，也不需要 AI API Key；但你主动导出的文件是未加密明文，详见[隐私与边界](#隐私与边界)。

## 30 秒体验

1. 打开[在线体验](https://masakinakao.github.io/keepfacts/?lang=zh)，先点击首要操作“30 秒看它抓出 3 处错误”。
2. 立即查看三个具体示例差异：发布日期改变、测试用户从 100 人变成 80 人、原文发布链接遗漏。
3. 点击“核对我的文本”，左侧粘贴可信原文，右侧粘贴 AI 改写、总结或翻译后的文本。
4. 如有需要，每行填写一个“必须保留”的名称、术语或关键短语，再点击“对照两版”；在统一审阅队列中逐项处理，可选填备注和期望修复，并复制仅含确认问题的修复清单或下载完整 Markdown 报告。
5. 修改文本后请重新核对。如需之后继续，可主动导出并重新导入本地 `.keepfacts.json` 会话文件。非敏感反馈可使用页面可见的“反馈漏检 / 误报”链接，切勿提交私人或机密原文。

## v0.3.1 首发范围与当前能力

v0.3.1 面向首次 X 发布优化现有体验：可直接运行的示例成为首要操作，并在首屏预告结果中的三处差异；专用 1200 × 630 社交卡、canonical URL、Open Graph、X/Twitter 卡片和 favicon 让分享链接易于识别；源码、隐私与反馈入口保持可见，移动端交互控件高度不小于 44 CSS 像素。

本次仍保留 v0.3.0 的人工审阅和交接流程：自动事实异常、必保项异常和改写新增事实进入同一个队列；每项可记录人工结论、可选备注和可选期望修复，只有“确认需处理”的项目会进入独立修复清单。重新核对时采用保守迁移：只有项目及证据仍可安全对应时才保留结论，不会把匹配不明确的旧记录悄悄接到新项目上。

你可以主动导出或导入本地 `.keepfacts.json` 会话，以转移当前草稿、上次核对输入和人工记录。该文件有严格版本与字段约束，但属于未加密明文，详见 [会话格式 v1](docs/session-format-v1.md)。

v0.3.1 没有扩张 v0.3.0 的事实识别引擎或公开评测语料，因此不表示识别范围或准确率已经提高。它适合检查 AI 转换前后已识别硬事实是否保真；即使“已提取事实保留率”为 100%，也不代表所有说法真实、所有事实都已识别或全文语义完全保留。

- 日期和时间
- 金额和百分比
- 数量与常用单位
- 版本号与数值范围
- URL 与邮箱
- 引语和独立数字
- 使用语境和一对一关联核对重复、重排的事实
- 精确处理带正负号的数字，并识别常见中英文及全角格式等价写法
- 用户自定义必须保留的名称、术语和关键短语，并与已提取事实保留率分开统计
- 在同一个队列中审阅自动异常、必保异常和改写新增事实，记录结论、可选备注、可选期望修复，并可跳到下一条待处理
- 单独复制只包含确认问题的 Markdown 修复清单，或下载包含双侧语境、人工记录、应用版本和构建提交的完整可追溯报告
- 重新核对时保守迁移人工记录：唯一对应且证据未变才保留结论；证据变化会回到待处理，匹配不明确或已消失的记录不会被静默改挂
- 主动导入或导出有版本约束的本地 `.keepfacts.json` 明文会话；不会自动持久化或上传
- 大型自动事实和必保结果集每页显示 50 项，避免一次渲染数百张结果卡
- 使用原生单选组记录结论、换页后管理焦点，并通过桌面端与 390 px
  移动端键盘和无障碍自动化检查

KeepFacts 只检查能够精确提取的硬事实，不查证事实真假，也不判断整段文字的语义是否正确。所有黄色项目都需要人工确认。“已提取事实保留率”的分母仅包含规则从原文中识别出的事实项，不表示事实抽取覆盖率或全文准确率。

核对时，KeepFacts 使用精确十进制字符串规范化金额、数量和百分比，避免浮点数舍入；重复或重排的数值则通过附近语境进行一对一关联。点击核对后，完整比较会在浏览器本地 Web Worker 中运行，避免大文本分析阻塞输入操作。人工结论属于独立审阅层，不会改写机器统计或已提取事实保留率。KeepFacts 不会把原文、新稿、语境或人工记录自动写入 Web Storage；页面打开期间的工作状态保留在内存中，而你主动导出的报告或会话文件可用明文包含文本、语境、结论、备注和期望修复。

## 本地运行

需要 Node.js 22.13 或更高版本。

```bash
npm ci
npm run dev
```

运行测试：

```bash
npm test
```

运行人工标注评测：

```bash
npm run eval
```

一次运行发布元数据、Node 测试、人工评测、类型检查与生产构建：

```bash
npm run check
```

安装 Playwright Chromium 浏览器后，重新生成仓库中的社交分享图，并运行浏览器与无障碍检查：

```bash
npx playwright install chromium
npm run render:share-card
npm run test:e2e
```

## 公开验证

仓库同时保留快速回归样本和一组现实化、人工标注的公开评测文本。评测会分别报告抽取、告警、新增事实、主体关联、结果类型和规范化指标，而不是只比较汇总数量。当前快照、复现步骤、匹配保证和已知限制见 [VALIDATION.md](VALIDATION.md) 与 [EVALUATION.md](EVALUATION.md)。

## 后续方向

- 提供独立核心包和 CLI
- 增加更多语言、币种和单位
- 浏览器扩展与编辑器集成
- 由贡献者添加新的识别规则

## 参与贡献

欢迎提交事实漏检、误报和界面问题。新增识别规则时，需要同时添加正确匹配与误报边界测试。具体参见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 隐私与边界

KeepFacts 使用浏览器本地的确定性规则，不包含追踪代码。它只对照两版文本中的受支持精确事实项，不会依据外部证据查证说法真假。它只能作为额外核对工具，不能代替法律、医疗、金融或其他高风险场景中的人工审查。

KeepFacts 不会自动保存或上传文本和人工记录。不过，主动导出的 Markdown 报告或 `.keepfacts.json` 会话是未加密明文：会话包含完整原文、新稿、必保内容和人工记录，报告包含核对项目及其显示语境。浏览器下载目录、云盘同步目录、备份软件或设备索引可能复制或同步这些文件；请据此存储、分享和删除。更多说明见 [SECURITY.md](SECURITY.md) 与 [会话格式](docs/session-format-v1.md)。

## 许可证

MIT
