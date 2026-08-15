import { mkdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { chromium } from "@playwright/test";

const root = fileURLToPath(new URL("..", import.meta.url));
const output = path.join(root, "public", "keepfacts-share.jpg");

const html = String.raw`<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <style>
      :root {
        color-scheme: light;
        --paper: #f4f1ea;
        --paper-deep: #ebe6db;
        --panel: #fffdf8;
        --ink: #17251f;
        --muted: #5f6a65;
        --line: #d8d4ca;
        --green: #0f5d46;
        --green-dark: #0a4534;
        --green-pale: #e5f1eb;
        --yellow: #b87800;
        --yellow-pale: #fff2cf;
        --danger: #783d24;
        --danger-pale: #f6e6de;
      }

      * { box-sizing: border-box; }

      html,
      body {
        height: 630px;
        margin: 0;
        overflow: hidden;
        width: 1200px;
      }

      body {
        background: var(--paper);
        color: var(--ink);
        font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI",
          "PingFang SC", "Microsoft YaHei", sans-serif;
      }

      .card {
        background:
          radial-gradient(circle at 7% 2%, rgba(181, 203, 191, 0.45), transparent 330px),
          radial-gradient(circle at 98% 100%, rgba(15, 93, 70, 0.13), transparent 390px),
          var(--paper);
        display: grid;
        grid-template-columns: 1.04fr 0.96fr;
        height: 630px;
        overflow: hidden;
        padding: 54px 58px 48px;
        position: relative;
        width: 1200px;
      }

      .card::before {
        background: var(--green);
        content: "";
        height: 8px;
        left: 0;
        position: absolute;
        right: 0;
        top: 0;
      }

      .card::after {
        border: 1px solid rgba(15, 93, 70, 0.13);
        border-radius: 50%;
        content: "";
        height: 410px;
        position: absolute;
        right: -245px;
        top: -205px;
        width: 410px;
      }

      .intro {
        display: flex;
        flex-direction: column;
        min-width: 0;
        padding: 2px 54px 0 0;
        position: relative;
        z-index: 1;
      }

      .brand {
        align-items: center;
        display: flex;
        gap: 13px;
      }

      .mark {
        align-items: center;
        background: var(--ink);
        border-radius: 13px;
        color: var(--panel);
        display: flex;
        font-family: "SFMono-Regular", Consolas, monospace;
        font-size: 24px;
        font-weight: 700;
        height: 50px;
        justify-content: center;
        width: 50px;
      }

      .brand-name {
        font-size: 25px;
        font-weight: 760;
        letter-spacing: -0.04em;
      }

      .product-tag {
        background: var(--paper-deep);
        border: 1px solid var(--line);
        border-radius: 999px;
        color: var(--muted);
        font-family: "SFMono-Regular", Consolas, monospace;
        font-size: 14px;
        font-weight: 650;
        margin-left: 2px;
        padding: 6px 10px;
      }

      h1 {
        font-size: 55px;
        font-weight: 780;
        letter-spacing: -0.055em;
        line-height: 1.13;
        margin: 70px 0 20px;
        max-width: 570px;
      }

      h1 strong {
        color: var(--green);
        font-weight: 800;
      }

      .lead {
        color: var(--muted);
        font-size: 20px;
        line-height: 1.65;
        margin: 0;
        max-width: 510px;
      }

      .trust {
        display: flex;
        gap: 10px;
        margin-top: auto;
      }

      .trust span {
        align-items: center;
        background: rgba(255, 253, 248, 0.82);
        border: 1px solid #c9ded3;
        border-radius: 999px;
        color: var(--green-dark);
        display: inline-flex;
        font-size: 15px;
        font-weight: 700;
        gap: 8px;
        padding: 9px 13px;
      }

      .trust i {
        background: #2e9b6c;
        border-radius: 50%;
        display: block;
        height: 7px;
        width: 7px;
      }

      .evidence-panel {
        align-self: center;
        background: rgba(255, 253, 248, 0.93);
        border: 1px solid rgba(216, 212, 202, 0.95);
        border-radius: 26px;
        box-shadow: 0 24px 60px rgba(35, 46, 40, 0.12);
        padding: 28px;
        position: relative;
        z-index: 1;
      }

      .panel-heading {
        align-items: center;
        display: flex;
        justify-content: space-between;
        margin-bottom: 20px;
      }

      .panel-heading strong {
        font-size: 18px;
        letter-spacing: -0.02em;
      }

      .count {
        background: var(--yellow-pale);
        border: 1px solid #ead69f;
        border-radius: 999px;
        color: #785000;
        font-size: 13px;
        font-weight: 700;
        padding: 6px 10px;
      }

      .evidence-list {
        display: grid;
        gap: 13px;
      }

      .evidence {
        align-items: center;
        background: #fffbef;
        border: 1px solid #ead69f;
        border-radius: 16px;
        display: grid;
        gap: 12px;
        grid-template-columns: 76px 1fr auto;
        min-height: 91px;
        padding: 16px 17px;
      }

      .evidence.missing {
        background: var(--danger-pale);
        border-color: #dfc1b2;
      }

      .label {
        color: var(--muted);
        font-size: 14px;
        font-weight: 700;
      }

      .change {
        align-items: baseline;
        display: flex;
        font-family: "SFMono-Regular", Consolas, "PingFang SC", monospace;
        font-size: 20px;
        font-weight: 760;
        gap: 9px;
        white-space: nowrap;
      }

      .from {
        color: #66716c;
        text-decoration: line-through;
        text-decoration-color: #a54d32;
        text-decoration-thickness: 2px;
      }

      .arrow { color: var(--yellow); }
      .to { color: var(--ink); }
      .missing .arrow,
      .missing .to { color: var(--danger); }

      .status {
        border-radius: 999px;
        font-size: 12px;
        font-weight: 760;
        padding: 6px 9px;
        white-space: nowrap;
      }

      .changed-status {
        background: #f7df9f;
        color: #785000;
      }

      .missing-status {
        background: #ffe0d5;
        color: #783d24;
      }

      .panel-note {
        color: var(--muted);
        font-size: 13px;
        line-height: 1.5;
        margin: 19px 2px 0;
      }
    </style>
  </head>
  <body>
    <main class="card" id="share-card">
      <section class="intro">
        <div class="brand">
          <span class="mark">K</span>
          <span class="brand-name">KeepFacts</span>
          <span class="product-tag">硬事实核对</span>
        </div>
        <h1>AI 改写后，<br /><strong>30 秒</strong>核对硬事实</h1>
        <p class="lead">找出被改变、遗漏或新增的日期、数字与必保内容，再交付。</p>
        <div class="trust" aria-label="本地处理、无需登录、不上传">
          <span><i></i>本地处理</span>
          <span><i></i>无需登录</span>
          <span><i></i>不上传</span>
        </div>
      </section>
      <section class="evidence-panel" aria-label="核对证据">
        <div class="panel-heading">
          <strong>核对证据</strong>
          <span class="count">3 项需要确认</span>
        </div>
        <div class="evidence-list">
          <div class="evidence">
            <span class="label">发布日期</span>
            <span class="change"><span class="from">9月15日</span><span class="arrow">→</span><span class="to">9月18日</span></span>
            <span class="status changed-status">已改变</span>
          </div>
          <div class="evidence">
            <span class="label">参与人数</span>
            <span class="change"><span class="from">100人</span><span class="arrow">→</span><span class="to">80人</span></span>
            <span class="status changed-status">已改变</span>
          </div>
          <div class="evidence missing">
            <span class="label">必保内容</span>
            <span class="change"><span class="from">发布链接</span><span class="arrow">→</span><span class="to">缺失</span></span>
            <span class="status missing-status">需恢复</span>
          </div>
        </div>
        <p class="panel-note">只标出规则识别到的硬事实，人工确认后再修复。</p>
      </section>
    </main>
  </body>
</html>`;

await mkdir(path.dirname(output), { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    colorScheme: "light",
    deviceScaleFactor: 1,
    locale: "zh-CN",
    reducedMotion: "reduce",
    viewport: { width: 1200, height: 630 },
  });
  const page = await context.newPage();
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.locator("#share-card").screenshot({
    animations: "disabled",
    caret: "hide",
    path: output,
    quality: 92,
    type: "jpeg",
  });
  await context.close();
} finally {
  await browser.close();
}

const { size } = await stat(output);
process.stdout.write(`Rendered ${path.relative(root, output)} (${size} bytes)\n`);
