import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";

const packageMetadata = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
) as { version: string };
const expectedVersion = `v${packageMetadata.version}`;

async function setComparison(
  page: Page,
  source: string,
  revision: string,
  required = "",
) {
  await page.getByRole("textbox", { name: "原文" }).fill(source);
  await page.getByRole("textbox", { name: "改写稿" }).fill(revision);
  const panel = page.locator(".required-panel");
  if (!(await panel.evaluate((element) => (element as HTMLDetailsElement).open))) {
    await panel.locator("summary").click();
  }
  await page.getByRole("textbox", { name: "必须保留的内容" }).fill(required);
}

test.beforeEach(async ({ page }) => {
  await page.goto("./");
});

test("is accessible and explains normalized matches", async ({ page }) => {
  const initialAccessibility = await new AxeBuilder({ page }).analyze();
  expect(initialAccessibility.violations).toEqual([]);

  await page.route("**/*compare.worker*.js", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    await route.continue();
  });
  await setComparison(
    page,
    "Alpha 预算为 ¥30,000。",
    "Alpha 的预算仍是3万元。",
  );
  const button = page.locator(".compare-button");
  await button.click();
  await expect(button).toHaveAttribute("aria-busy", "true");
  await expect(page.getByRole("heading", { name: "核对结果" })).toBeFocused();
  await expect(button).toHaveAttribute("aria-busy", "false");
  await expect(page.locator(".sr-only[role=status]")).toContainText("核对完成");

  const preserved = page.locator(".result-preserved").filter({ hasText: "¥30,000" });
  await expect(preserved).toContainText("3万元");
  await preserved.getByText("查看原文与改写语境").click();
  await expect(preserved).toContainText("原文语境");
  await expect(preserved).toContainText("改写语境");

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test("filters with aria-pressed and supports keyboard details", async ({ page }) => {
  const details = page.locator(".required-panel");
  await details.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(details).toHaveAttribute("open", "");

  const preserved = page.getByRole("button", { name: /已保留/ });
  await preserved.focus();
  await page.keyboard.press("Space");
  await expect(preserved).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".automatic-results .result-review")).toHaveCount(0);
});

test("completes human review and exports decisions without changing auto counts", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await setComparison(
    page,
    "Alpha has 100 users. Keep Northstar.",
    "Alpha has 80 users. Launch on 2026-09-15.",
    "Northstar",
  );
  await page.getByRole("button", { name: "开始核对" }).click();
  await expect(page.getByRole("heading", { name: "核对结果" })).toBeFocused();

  const manualReview = page.getByRole("region", { name: "人工审阅进度" });
  await expect(manualReview).toContainText("0/3");
  await expect(page.locator(".summary-warning").filter({ hasText: "需确认" })).toContainText("1");

  const automaticFinding = page.locator(".automatic-results .result-review");
  await automaticFinding.getByRole("radio", { name: "待处理" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    automaticFinding.getByRole("radio", { name: "确认需处理" }),
  ).toBeChecked();
  const requiredFinding = page.locator(".required-result-list .result-review");
  await requiredFinding.getByRole("radio", { name: "改写合理" }).check();
  const addedFinding = page.locator(".automatic-results .result-added");
  await expect(addedFinding.locator(".fact-value")).toHaveCount(1);
  await addedFinding.getByRole("radio", { name: "已忽略" }).check();

  await expect(manualReview).toContainText("3/3");
  await expect(manualReview).toContainText("确认需处理1");
  await expect(manualReview).toContainText("改写合理1");
  await expect(manualReview).toContainText("已忽略1");
  await expect(page.locator(".summary-warning").filter({ hasText: "需确认" })).toContainText("1");

  await page.getByRole("button", { name: "复制报告" }).click();
  const report = await page.evaluate(() => navigator.clipboard.readText());
  expect(report).toContain("## 人工审阅摘要");
  expect(report).toContain("**人工结论:** `确认需处理`");
  expect(report).toContain("**人工结论:** `改写合理`");
  expect(report).toContain("**人工结论:** `已忽略`");

  await page.getByRole("button", { name: "English" }).click();
  await expect(page.getByRole("region", { name: "Human review progress" })).toContainText(
    "3/3",
  );
  await expect(
    page
      .locator(".automatic-results .result-review")
      .getByRole("radio", { name: "Confirmed issue" }),
  ).toBeChecked();
  await expect(
    page
      .locator(".required-result-list .result-review")
      .getByRole("radio", { name: "Acceptable rewrite" }),
  ).toBeChecked();

  await page.getByRole("textbox", { name: "Source" }).fill("Changed input 100.");
  await expect(
    page.locator(".review-decision-buttons input").first(),
  ).toBeDisabled();
});

test("keeps stale results, disables exports, and recovers", async ({ page }) => {
  await page.route("**/*compare.worker*.js", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    await route.continue();
  });
  const source = page.getByRole("textbox", { name: "原文" });
  await source.fill(`${await source.inputValue()} 新增 42。`);
  await expect(page.getByText(/上次核对结果/)).toBeVisible();
  await expect(page.getByRole("button", { name: "复制报告" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "下载 Markdown" })).toBeDisabled();

  const compareButton = page.locator(".compare-button");
  await compareButton.click();
  await expect(compareButton).toHaveAttribute("aria-busy", "true");
  await source.fill(`${await source.inputValue()} 再新增 43。`);
  await expect(compareButton).toHaveAttribute("aria-busy", "false");
  await page.waitForTimeout(300);
  await expect(page.getByText(/上次核对结果/)).toBeVisible();

  await page.unroute("**/*compare.worker*.js");
  await compareButton.click();
  await expect(page.getByRole("button", { name: "复制报告" })).toBeEnabled();
  await expect(page.getByText(/上次核对结果/)).toHaveCount(0);
});

test("shows worker failures after clearing and allows a retry", async ({ page }) => {
  await page.getByRole("button", { name: "清空" }).click();
  await page.getByRole("textbox", { name: "原文" }).fill("Alpha has 100 users.");
  await page
    .getByRole("textbox", { name: "改写稿" })
    .fill("Alpha has 100 users.");
  await page.route("**/*compare.worker*.js", (route) => route.abort());

  const compareButton = page.locator(".compare-button");
  await compareButton.click();
  await expect(page.getByRole("alert")).toContainText("核对未完成");
  await expect(compareButton).toHaveAttribute("aria-busy", "false");
  await expect(page.getByRole("heading", { name: "核对结果" })).toHaveCount(0);

  await page.unroute("**/*compare.worker*.js");
  await compareButton.click();
  await expect(page.getByRole("heading", { name: "核对结果" })).toBeFocused();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("copies and downloads a traceable bilingual report", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "复制报告" }).click();
  await expect(page.getByText("报告已复制")).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain(`- **KeepFacts 版本:** ${expectedVersion}`);
  expect(copied).toMatch(/构建提交:\*\* `(?:local|[0-9a-f]{40})`/);
  expect(copied).toContain("原文语境");
  expect(copied).toContain("改写语境");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载 Markdown" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^keepfacts-report-\d{4}-\d{2}-\d{2}\.md$/);
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const downloaded = await readFile(downloadPath!, "utf8");
  expect(downloaded).toContain(`- **KeepFacts 版本:** ${expectedVersion}`);
  expect(downloaded).toContain("原文语境");
  expect(downloaded).toContain("改写语境");

  await page.getByRole("button", { name: "English" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page).toHaveTitle("KeepFacts — Change the wording, not the facts");
  await expect(page.getByRole("heading", { name: "Automatic fact details" })).toBeVisible();
});

test("does not overflow at either configured viewport", async ({ page }) => {
  await setComparison(
    page,
    "URL https://example.com/a/very/long/path/that/must/remain?with=query&and=more",
    "URL https://example.com/a/very/long/path/that/must/remain?with=query&and=more",
    "https://example.com/a/very/long/path/that/must/remain?with=query&and=more",
  );
  await page.getByRole("button", { name: "开始核对" }).click();
  await expect.poll(() =>
    page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
  ).toBe(true);
});

test("paginates large result sets and moves focus to the new page", async ({ page }) => {
  const text = Array.from(
    { length: 55 },
    (_, index) => `Item ${index + 1} has value ${1000 + index}.`,
  ).join("\n");
  await page.getByRole("textbox", { name: "原文" }).fill(text);
  await page.getByRole("textbox", { name: "改写稿" }).fill(text);
  await page.getByRole("button", { name: "开始核对" }).click();
  await expect(page.getByRole("heading", { name: "核对结果" })).toBeFocused();
  await page.getByRole("button", { name: /全部/ }).click();

  const pagination = page.getByRole("navigation", { name: "自动事实明细" });
  await expect(pagination).toContainText(/第 1\/\d+ 页/);
  await expect(page.locator(".automatic-results .result-card")).toHaveCount(50);
  await pagination.getByRole("button", { name: "下一页" }).click();
  await expect(pagination).toContainText(/第 2\/\d+ 页/);
  await expect(page.locator(".automatic-results .result-card")).toHaveCount(50);
  await expect(page.getByRole("heading", { name: "自动事实明细" })).toBeFocused();

  const requiredItems = Array.from({ length: 55 }, (_, index) => {
    const first = String.fromCharCode(65 + Math.floor(index / 26));
    const second = String.fromCharCode(65 + (index % 26));
    return `Keep term ${first}${second}`;
  });
  const requiredText = requiredItems.join(". ");
  await setComparison(page, requiredText, requiredText, requiredItems.join("\n"));
  await page.getByRole("button", { name: "开始核对" }).click();
  const requiredPagination = page.getByRole("navigation", {
    name: "必须保留检查",
  });
  await expect(requiredPagination).toContainText("第 1/2 页，共 55 项");
  await expect(page.locator(".required-result-list .result-card")).toHaveCount(50);
  await requiredPagination.getByRole("button", { name: "下一页" }).click();
  await expect(requiredPagination).toContainText("第 2/2 页，共 55 项");
  await expect(page.locator(".required-result-list .result-card")).toHaveCount(5);
  await expect(page.getByRole("heading", { name: "必须保留检查" })).toBeFocused();
});
