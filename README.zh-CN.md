# KeepFacts

[English](README.md) · [在线体验](https://masakinakao.github.io/keepfacts/)

[![在线体验](https://img.shields.io/badge/在线体验-打开-0f5d46)](https://masakinakao.github.io/keepfacts/)
[![CI](https://github.com/MasakiNakao/keepfacts/actions/workflows/ci.yml/badge.svg)](https://github.com/MasakiNakao/keepfacts/actions/workflows/ci.yml)
[![最新标签](https://img.shields.io/github/v/tag/MasakiNakao/keepfacts?sort=semver)](https://github.com/MasakiNakao/keepfacts/tags)
[![License](https://img.shields.io/github/license/MasakiNakao/keepfacts)](LICENSE)

**措辞可以改变，事实不该走样。**

KeepFacts 是一个小巧、隐私优先的 AI 文本事实核对器。把原文和 AI 改写、总结或翻译后的文本分别粘贴进去，它会检查日期、金额、百分比、数量、版本、链接和邮箱等硬事实是否被保留、修改、遗漏或新增。

所有分析都在浏览器本地完成，不上传文本，不需要账号，也不需要 AI API Key。

[![KeepFacts 原文与改写稿事实核对界面](docs/keepfacts-demo.jpg)](https://masakinakao.github.io/keepfacts/)

## 30 秒体验

1. 打开[在线体验](https://masakinakao.github.io/keepfacts/)。
2. 左侧粘贴原文，右侧粘贴 AI 改写、总结或翻译后的文本。
3. 如有需要，每行填写一个“必须保留”的名称、术语或关键短语。
4. 点击“开始核对”生成一份固定结果，先检查黄色项目，再复制或下载 Markdown 报告；修改文本后请重新核对。

## 当前能力

- 日期和时间
- 金额和百分比
- 数量与常用单位
- 版本号与数值范围
- URL 与邮箱
- 引语和独立数字
- 按出现次数核对重复事实
- 常见中英文格式等价识别
- 用户自定义必须保留的名称、术语和关键短语，并与自动事实保留率分开统计
- 复制或下载 Markdown 核对报告

KeepFacts 只检查能够精确提取的硬事实，不判断整段文字的语义是否正确。所有黄色项目都需要人工确认。

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

## 公开验证

仓库包含一组数据驱动的公开验证样本，覆盖事实保留、修改、遗漏、新增、重复和误报边界。当前验证快照、复现步骤、匹配保证和已知限制见 [VALIDATION.md](VALIDATION.md)。

## 后续方向

- 提供独立核心包和 CLI
- 增加更多语言、币种和单位
- 浏览器扩展与编辑器集成
- 由贡献者添加新的识别规则

## 参与贡献

欢迎提交事实漏检、误报和界面问题。新增识别规则时，需要同时添加正确匹配与误报边界测试。具体参见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 隐私与边界

KeepFacts 使用浏览器本地的确定性规则，不包含追踪代码。它只能作为额外核对工具，不能代替法律、医疗、金融或其他高风险场景中的人工审查。

## 许可证

MIT
