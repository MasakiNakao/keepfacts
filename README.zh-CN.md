# KeepFacts

[English](README.md) · [在线体验](https://masakinakao.github.io/keepfacts/)

[![在线体验](https://img.shields.io/badge/在线体验-打开-0f5d46)](https://masakinakao.github.io/keepfacts/)
[![CI](https://github.com/MasakiNakao/keepfacts/actions/workflows/ci.yml/badge.svg)](https://github.com/MasakiNakao/keepfacts/actions/workflows/ci.yml)
[![最新标签](https://img.shields.io/github/v/tag/MasakiNakao/keepfacts?sort=semver)](https://github.com/MasakiNakao/keepfacts/tags)
[![License](https://img.shields.io/github/license/MasakiNakao/keepfacts)](LICENSE)

**措辞可以改变，事实不该走样。**

KeepFacts 是一个小巧、隐私优先的 **AI 改写硬事实保留检查器**。把可信原文和 AI 改写、总结或翻译后的文本分别粘贴进去，它会对照日期、金额、百分比、数量、版本、链接和邮箱等可精确提取的事实项是否被保留、修改、遗漏或新增。

KeepFacts 不联网查证某项说法是否真实，也不判断事实真假；它只比较两版文本中能够识别的精确事实项。目前的识别规则主要针对常见中文和英文格式优化。

所有分析都在浏览器本地完成，不上传文本，不需要账号，也不需要 AI API Key。

[![KeepFacts v0.2.1 原文与改写硬事实保留检查及人工审阅界面](docs/keepfacts-demo.jpg)](https://masakinakao.github.io/keepfacts/)

## 30 秒体验

1. 打开[在线体验](https://masakinakao.github.io/keepfacts/)。
2. 左侧粘贴原文，右侧粘贴 AI 改写、总结或翻译后的文本。
3. 如有需要，每行填写一个“必须保留”的名称、术语或关键短语。
4. 点击“对照两版”生成一份固定结果；把异常项标记为“确认需处理”“改写合理”或“已忽略”，再复制或下载 Markdown 报告。修改文本后请重新核对。

## 当前能力

v0.2.1 保留 v0.2 的完整工作流：必须保留术语、逐项人工结论、审阅进度、分页和 Markdown 报告导出，同时进一步明确产品边界。它适合检查 AI 转换前后已识别硬事实是否保真；即使“已提取事实保留率”为 100%，也不代表所有说法真实、所有事实都已识别或全文语义完全保留。

- 日期和时间
- 金额和百分比
- 数量与常用单位
- 版本号与数值范围
- URL 与邮箱
- 引语和独立数字
- 使用语境和一对一关联核对重复、重排的事实
- 精确处理带正负号的数字，并识别常见中英文及全角格式等价写法
- 用户自定义必须保留的名称、术语和关键短语，并与已提取事实保留率分开统计
- 对自动异常、必保异常和改写新增事实进行逐项人工审阅，并跟踪待处理进度
- 复制或下载包含双侧语境、应用版本和构建提交的可追溯 Markdown 报告
- 大型自动事实和必保结果集每页显示 50 项，避免一次渲染数百张结果卡
- 使用原生单选组记录结论、换页后管理焦点，并通过桌面端与 390 px
  移动端键盘和无障碍自动化检查

KeepFacts 只检查能够精确提取的硬事实，不查证事实真假，也不判断整段文字的语义是否正确。所有黄色项目都需要人工确认。“已提取事实保留率”的分母仅包含规则从原文中识别出的事实项，不表示事实抽取覆盖率或全文准确率。

核对时，KeepFacts 使用精确十进制字符串规范化金额、数量和百分比，避免浮点数舍入；重复或重排的数值则通过附近语境进行一对一关联。点击核对后，完整比较会在浏览器本地 Web Worker 中运行，避免大文本分析阻塞输入操作。人工结论不会改写已提取事实保留率，也不会写入浏览器存储；它们只存在于当前页面，并在复制或下载时写入报告。

## 本地运行

需要 Node.js 22.13 或更高版本。

```bash
npm install
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

安装 Playwright 浏览器后运行 Chromium 浏览器与无障碍检查：

```bash
npx playwright install chromium
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

## 许可证

MIT
