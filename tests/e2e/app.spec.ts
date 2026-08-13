import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
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

async function createThreeWayReview(page: Page) {
  await setComparison(
    page,
    "Alpha has 100 users. Keep Northstar.",
    "Alpha has 80 users. Launch on 2026-09-15.",
    "Northstar",
  );
  await page.getByRole("button", { name: /对照两版/ }).click();
  await expect(page.getByRole("heading", { name: "核对结果" })).toBeFocused();

  return {
    automatic: page.locator('.review-queue > li[data-review-scope="source"]'),
    required: page.locator('.review-queue > li[data-review-scope="required"]'),
    added: page.locator('.review-queue > li[data-review-scope="added"]'),
  };
}

async function answerConfirmation(
  page: Page,
  action: Locator,
  accept: boolean,
) {
  const dialogPromise = page.waitForEvent("dialog");
  const clickPromise = action.click();
  const dialog = await dialogPromise;
  expect(dialog.type()).toBe("confirm");
  expect(dialog.message()).toBe(
    "已有 1 条人工审阅记录。继续操作将清除这些记录，是否继续？",
  );
  if (accept) await dialog.accept();
  else await dialog.dismiss();
  await clickPromise;
}

test.beforeEach(async ({ page }) => {
  // Pin existing Chinese-language contracts. Language negotiation itself is
  // covered separately and must not make the rest of the suite depend on the
  // machine running Playwright.
  await page.goto("./?lang=zh");
});

test.describe("language negotiation", () => {
  test.use({ locale: "en-US" });

  test("honors URL language and otherwise follows the browser language", async ({
    page,
  }) => {
    await page.goto("./?lang=zh");
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await expect(page.getByRole("textbox", { name: "原文" })).toBeVisible();

    await page.goto("./?lang=en");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page).toHaveTitle(
      "KeepFacts — Change the wording, not the facts",
    );
    await expect(page.getByRole("textbox", { name: "Source" })).toBeVisible();

    await page.goto("./");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("textbox", { name: "Source" })).toBeVisible();
  });
});

test.describe("Chinese browser language", () => {
  test.use({ locale: "zh-CN" });

  test("uses Chinese without a URL override", async ({ page }) => {
    await page.goto("./");
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await expect(page.getByRole("textbox", { name: "原文" })).toBeVisible();
  });
});

test("distinguishes the example from the user's own text", async ({ page }) => {
  const mode = page.getByRole("region", { name: "示例模式" });
  await expect(mode).toContainText("当前显示示例内容和示例结果。");
  await expect(page.getByRole("heading", { name: "核对结果" })).toBeVisible();

  await mode
    .getByRole("button", { name: "使用我的文本", exact: true })
    .click();
  await expect(page.getByRole("textbox", { name: "原文" })).toHaveValue("");
  await expect(page.getByRole("textbox", { name: "改写稿" })).toHaveValue("");
  await expect(page.getByRole("heading", { name: "核对结果" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /对照两版/ }),
  ).toBeDisabled();
});

test("qualifies retention as extracted-fact coverage", async ({ page }) => {
  await expect(
    page.getByRole("meter", { name: /^已提取事实保留率/ }),
  ).toBeVisible();
  await expect(
    page.getByText("只统计规则识别到的硬事实，不代表全文事实正确。", {
      exact: true,
    }),
  ).toBeVisible();
});

test("uses a non-numeric status when no facts are extracted", async ({ page }) => {
  await setComparison(page, "Alpha text only.", "Alpha text only.");
  await page.getByRole("button", { name: /对照两版/ }).click();
  await expect(
    page.getByRole("status", { name: /^已提取事实保留率 —$/ }),
  ).toBeVisible();
  await expect(page.getByRole("meter", { name: /^已提取事实保留率/ })).toHaveCount(
    0,
  );

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test("offers unique hero actions for own text and the example", async ({
  page,
}) => {
  await expect(
    page.getByRole("button", { name: "核对我的文本", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "查看示例结果", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "使用我的文本", exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "载入示例", exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "载入示例", exact: true }),
  ).toBeDisabled();
});

test("shows draft, needs-changes, and completed review outcomes", async ({
  page,
}) => {
  const findings = await createThreeWayReview(page);
  const manual = page.getByRole("region", { name: "人工审阅进度" });

  await expect(manual.locator('[data-review-state="draft"]')).toHaveText(
    "审阅草稿",
  );
  await findings.automatic
    .getByRole("radio", { name: "确认需处理" })
    .check();
  await findings.required.getByRole("radio", { name: "改写合理" }).check();
  await findings.added.getByRole("radio", { name: "已忽略" }).check();
  await expect(
    manual.locator('[data-review-state="needs-changes"]'),
  ).toHaveText("需要修改");

  await findings.automatic.getByRole("radio", { name: "改写合理" }).check();
  await expect(manual.locator('[data-review-state="acceptable"]')).toHaveText(
    "审阅完成 · 无确认问题",
  );
});

test("uses one accessible review queue and moves focus to the next pending item", async ({
  page,
}) => {
  const findings = await createThreeWayReview(page);
  const queue = page.getByRole("list", { name: "人工审阅队列" });

  await expect(queue.locator(":scope > li")).toHaveCount(3);
  await expect(queue.getByRole("radio")).toHaveCount(12);
  await expect(findings.automatic.locator(".review-scope")).toHaveText("自动事实");
  await expect(findings.required.locator(".review-scope")).toHaveText("必保项");
  await expect(findings.added.locator(".review-scope")).toHaveText("改写新增");
  await expect(
    page.locator(
      ".automatic-results input[type=radio], .required-result-list input[type=radio], .automatic-results textarea, .required-result-list textarea",
    ),
  ).toHaveCount(0);

  const nextPending = page.getByRole("button", { name: "下一条待处理" });
  await nextPending.click();
  await expect(findings.automatic.getByRole("heading", { level: 4 })).toBeFocused();
  await findings.automatic
    .getByRole("radio", { name: "确认需处理" })
    .check();
  await nextPending.click();

  const nextHeading = findings.required.getByRole("heading", { level: 4 });
  await expect(nextHeading).toBeFocused();
  await expect(page.getByTestId("review-announcement")).toContainText(
    "已移动到第 1 条待处理：必保项",
  );
  await expect
    .poll(async () => {
      const [headingBox, toolbarBox] = await Promise.all([
        nextHeading.boundingBox(),
        page.locator(".review-toolbar").boundingBox(),
      ]);
      return Boolean(
        headingBox &&
          toolbarBox &&
          headingBox.y >= toolbarBox.y + toolbarBox.height - 1,
      );
    })
    .toBe(true);

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test("confirms destructive example and clear actions after a decision", async ({
  page,
}) => {
  let findings = await createThreeWayReview(page);
  await findings.automatic
    .getByRole("radio", { name: "确认需处理" })
    .check();
  const customSource = await page
    .getByRole("textbox", { name: "原文" })
    .inputValue();

  const loadExample = page
    .getByRole("region", { name: "我的文本" })
    .getByRole("button", { name: "载入示例", exact: true });
  await answerConfirmation(page, loadExample, false);
  await expect(page.getByRole("textbox", { name: "原文" })).toHaveValue(
    customSource,
  );
  await expect(
    findings.automatic.getByRole("radio", { name: "确认需处理" }),
  ).toBeChecked();

  await answerConfirmation(page, loadExample, true);
  await expect(page.getByRole("region", { name: "示例模式" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "原文" })).toHaveValue(
    /星河工作室/,
  );
  await expect(
    page
      .getByRole("region", { name: "人工审阅进度" })
      .locator('[data-review-state="draft"]'),
  ).toHaveText("审阅草稿");

  findings = {
    automatic: page.locator('.review-queue > li[data-review-scope="source"]').first(),
    required: page.locator('.review-queue > li[data-review-scope="required"]'),
    added: page.locator('.review-queue > li[data-review-scope="added"]'),
  };
  await findings.automatic
    .getByRole("radio", { name: "确认需处理" })
    .check();

  const clear = page.getByRole("button", { name: "清空", exact: true });
  await answerConfirmation(page, clear, false);
  await expect(
    findings.automatic.getByRole("radio", { name: "确认需处理" }),
  ).toBeChecked();
  await expect(page.getByRole("heading", { name: "核对结果" })).toBeVisible();

  await answerConfirmation(page, clear, true);
  await expect(page.getByRole("textbox", { name: "原文" })).toHaveValue("");
  await expect(page.getByRole("textbox", { name: "改写稿" })).toHaveValue("");
  await expect(page.getByRole("heading", { name: "核对结果" })).toHaveCount(0);
});

test("round-trips private session text and review records after confirmation", async ({
  page,
}) => {
  const findings = await createThreeWayReview(page);
  const sourceValue = await page.getByRole("textbox", { name: "原文" }).inputValue();
  const revisionValue = await page
    .getByRole("textbox", { name: "改写稿" })
    .inputValue();
  const privacyNotice =
    "会话文件包含完整原文、新稿、必保项和人工记录，是未加密明文；KeepFacts 不会自动保存或上传。";

  await findings.automatic
    .getByRole("radio", { name: "确认需处理" })
    .check();
  await findings.automatic
    .getByRole("textbox", { name: "审阅备注 · 可选" })
    .fill("原文数字已有审批记录");
  await findings.automatic
    .getByRole("textbox", { name: "期望修复 · 可选" })
    .fill("恢复为 100 users");

  await expect(page.locator(".session-notice")).toHaveText(privacyNotice);
  const fileInput = page.locator('.session-actions input[type="file"]');
  await expect(fileInput).toHaveAttribute("aria-hidden", "true");
  await expect(fileInput).toHaveAttribute("tabindex", "-1");

  const downloadPromise = page.waitForEvent("download");
  const exportDialogPromise = page.waitForEvent("dialog");
  const exportClick = page.getByRole("button", { name: "导出会话" }).click();
  const exportDialog = await exportDialogPromise;
  expect(exportDialog.message()).toBe(
    "导出的会话文件包含完整文本和人工记录，且未加密。拿到文件的人可以直接读取。是否继续导出？",
  );
  await exportDialog.accept();
  await exportClick;
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(
    /^keepfacts-session-\d{8}T\d{6}Z\.keepfacts\.json$/,
  );
  const sessionPath = await download.path();
  expect(sessionPath).not.toBeNull();
  const sessionBuffer = await readFile(sessionPath!);
  const sessionFile = {
    name: download.suggestedFilename(),
    mimeType: "application/json",
    buffer: sessionBuffer,
  };
  const exported = JSON.parse(sessionBuffer.toString("utf8")) as {
    privacy: { containsFullText: boolean; encrypted: boolean };
    result: {
      reviewRecords: Array<{
        decision?: string;
        note?: string;
        expectedFix?: string;
      }>;
    };
  };
  expect(exported.privacy).toEqual({ containsFullText: true, encrypted: false });
  expect(exported.result.reviewRecords).toContainEqual(
    expect.objectContaining({
      decision: "confirmed",
      note: "原文数字已有审批记录",
      expectedFix: "恢复为 100 users",
    }),
  );

  await page.getByRole("textbox", { name: "原文" }).fill("临时内容 999 users");
  const cancelledImportDialog = page.waitForEvent("dialog");
  await fileInput.setInputFiles(sessionFile);
  const cancelledImport = await cancelledImportDialog;
  expect(cancelledImport.message()).toBe(
    "导入将替换当前文本、结果和人工记录。已先在本地完成校验，是否继续？",
  );
  await cancelledImport.dismiss();
  await expect(page.getByRole("textbox", { name: "原文" })).toHaveValue(
    "临时内容 999 users",
  );

  const acceptedImportDialog = page.waitForEvent("dialog");
  await fileInput.setInputFiles(sessionFile);
  const acceptedImport = await acceptedImportDialog;
  await acceptedImport.accept();
  await expect(page.getByRole("heading", { name: "核对结果" })).toBeFocused();
  await expect(page.getByRole("textbox", { name: "原文" })).toHaveValue(sourceValue);
  await expect(page.getByRole("textbox", { name: "改写稿" })).toHaveValue(
    revisionValue,
  );

  const restored = page.locator(
    '.review-queue > li[data-review-scope="source"]',
  );
  await expect(
    restored.getByRole("radio", { name: "确认需处理" }),
  ).toBeChecked();
  await expect(
    restored.getByRole("textbox", { name: "审阅备注 · 可选" }),
  ).toHaveValue("原文数字已有审批记录");
  await expect(
    restored.getByRole("textbox", { name: "期望修复 · 可选" }),
  ).toHaveValue("恢复为 100 users");
  await expect(
    page.getByRole("status").filter({ hasText: "会话已导入：恢复 1 条人工记录" }),
  ).toBeVisible();
});

test("shows a concise privacy promise on mobile", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "mobile copy contract");

  await expect(page.getByTestId("privacy-copy")).toHaveText(
    "本地处理 · 文本不会上传",
  );
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
  await expect(page.locator('main > .sr-only[role="status"]')).toContainText(
    "核对完成",
  );

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
  await page.getByRole("button", { name: /对照两版/ }).click();
  await expect(page.getByRole("heading", { name: "核对结果" })).toBeFocused();

  const manualReview = page.getByRole("region", { name: "人工审阅进度" });
  await expect(manualReview).toContainText("0/3");
  await expect(page.locator(".summary-warning").filter({ hasText: "需确认" })).toContainText("1");

  const automaticFinding = page.locator(
    '.review-queue > li[data-review-scope="source"]',
  );
  await automaticFinding
    .getByRole("textbox", { name: "审阅备注 · 可选" })
    .fill("原文数字来自已批准版本");
  await automaticFinding
    .getByRole("textbox", { name: "期望修复 · 可选" })
    .fill("恢复为 100 users");
  await automaticFinding.getByRole("radio", { name: "待处理" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    automaticFinding.getByRole("radio", { name: "确认需处理" }),
  ).toBeChecked();
  const requiredFinding = page.locator(
    '.review-queue > li[data-review-scope="required"]',
  );
  await requiredFinding.getByRole("radio", { name: "改写合理" }).check();
  const addedFinding = page.locator(
    '.review-queue > li[data-review-scope="added"]',
  );
  await expect(addedFinding.locator(".fact-value")).toHaveCount(1);
  await addedFinding.getByRole("radio", { name: "已忽略" }).check();

  await expect(manualReview).toContainText("3/3");
  await expect(
    manualReview.locator('[data-review-state="confirmed"]'),
  ).toHaveCount(1);
  await expect(
    manualReview.locator('[data-review-state="accepted"]'),
  ).toHaveCount(1);
  await expect(
    manualReview.locator('[data-review-state="ignored"]'),
  ).toHaveCount(1);
  await expect(page.locator(".summary-warning").filter({ hasText: "需确认" })).toContainText("1");

  await page.getByRole("button", { name: "复制修复清单" }).click();
  await expect(page.getByTestId("review-announcement")).toHaveText(
    "修复清单已复制",
  );
  const fixList = await page.evaluate(() => navigator.clipboard.readText());
  expect(fixList).toContain("## 修复清单");
  expect(fixList).toContain("**期望修复:** 恢复为 100 users");
  expect(fixList).toContain("**备注:** 原文数字来自已批准版本");

  await page.getByRole("button", { name: "复制报告" }).click();
  await expect(page.getByTestId("review-announcement")).toHaveText(
    "报告已复制",
  );
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
      .locator('.review-queue > li[data-review-scope="source"]')
      .getByRole("radio", { name: "Confirmed issue" }),
  ).toBeChecked();
  await expect(
    page
      .locator('.review-queue > li[data-review-scope="required"]')
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
  const reviewQueue = page.getByRole("list", { name: "人工审阅队列" });
  await reviewQueue
    .getByRole("radio", { name: "确认需处理" })
    .first()
    .check();
  await expect(
    page.getByRole("button", { name: "复制修复清单" }),
  ).toBeEnabled();
  const source = page.getByRole("textbox", { name: "原文" });
  await source.fill(`${await source.inputValue()} 新增 42。`);
  await expect(page.getByText(/上次核对结果/)).toBeVisible();
  await expect(page.getByRole("button", { name: "复制报告" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "下载 Markdown" })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "下一条待处理" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "复制修复清单" }),
  ).toBeDisabled();
  await expect(reviewQueue.getByRole("radio").first()).toBeDisabled();
  await expect(reviewQueue.getByRole("textbox").first()).toBeDisabled();

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
  await expect(
    page.getByRole("list", { name: "人工审阅队列" }).getByRole("radio").first(),
  ).toBeEnabled();
});

test("rejects 1,001 extracted facts per side without replacing the old result", async ({
  page,
}) => {
  const previousQueue = page.getByRole("list", { name: "人工审阅队列" });
  const previousQueueText = await previousQueue.textContent();
  const oversized = Array.from(
    { length: 1_001 },
    (_, index) => `A ${100_000 + index}.`,
  ).join(" ");

  await page.getByRole("textbox", { name: "原文" }).fill(oversized);
  await page.getByRole("textbox", { name: "改写稿" }).fill(oversized);
  const compareButton = page.locator(".compare-button");
  await compareButton.click();

  await expect(page.getByRole("alert")).toHaveText(
    "每侧最多核对 1,000 项已提取事实，必保项最多 1,000 条。请拆分文本后重试；上次结果已保留。",
  );
  await expect(compareButton).toHaveAttribute("aria-busy", "false");
  await expect(page.getByText(/上次核对结果/)).toBeVisible();
  expect(await previousQueue.textContent()).toBe(previousQueueText);
  await expect(page.getByRole("heading", { name: "核对结果" })).toBeVisible();
});

test("keeps stale results and review records when dropped-record migration is cancelled", async ({
  page,
}) => {
  const findings = await createThreeWayReview(page);
  const sourceFinding = findings.automatic;
  const note = sourceFinding.getByRole("textbox", { name: "审阅备注 · 可选" });
  await sourceFinding
    .getByRole("radio", { name: "确认需处理" })
    .check();
  await note.fill("保留旧证据与审批判断");

  await page
    .getByRole("textbox", { name: "原文" })
    .fill("Alpha has 80 users. Keep Northstar.");
  await expect(page.getByText(/上次核对结果/)).toBeVisible();

  const dialogPromise = page.waitForEvent("dialog");
  const comparePromise = page.locator(".compare-button").click();
  const dialog = await dialogPromise;
  expect(dialog.message()).toBe(
    "本次重新核对有 1 条旧人工记录无法安全迁移。继续将采用新结果并移除这些旧记录；取消可保留上次结果和全部人工记录。是否继续？",
  );
  await dialog.dismiss();
  await comparePromise;

  await expect(page.getByText(/上次核对结果/)).toBeVisible();
  await expect(
    page.locator('main > .sr-only[role="status"]'),
  ).toHaveText("已取消采用新结果；上次结果和人工记录仍保留。");
  await expect(sourceFinding.getByRole("heading", { level: 4 })).toContainText(
    "100",
  );
  await expect(
    sourceFinding.getByRole("radio", { name: "确认需处理" }),
  ).toBeChecked();
  await expect(
    sourceFinding.getByRole("radio", { name: "确认需处理" }),
  ).toBeDisabled();
  await expect(note).toHaveValue("保留旧证据与审批判断");
  await expect(note).toBeDisabled();
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
  await expect(page.locator(".report-feedback")).toHaveText("报告已复制");
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

test("does not overflow and keeps review controls usable at either viewport", async ({
  page,
}) => {
  await setComparison(
    page,
    "URL https://example.com/a/very/long/path/that/must/remain?with=query&and=more",
    "URL https://example.com/a/very/long/path/that/must/remain?with=query&and=more",
    "https://example.com/a/very/long/path/that/must/remain?with=query&and=more",
  );
  await page.getByRole("button", { name: /对照两版/ }).click();
  await expect.poll(() =>
    page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
  ).toBe(true);

  const toolbar = page.locator(".review-toolbar");
  await expect(toolbar).toHaveCSS("position", "sticky");
  const viewportWidth = page.viewportSize()!.width;
  const toolbarBox = await toolbar.boundingBox();
  expect(toolbarBox).not.toBeNull();
  expect(toolbarBox!.x).toBeGreaterThanOrEqual(0);
  expect(toolbarBox!.x + toolbarBox!.width).toBeLessThanOrEqual(viewportWidth);

  const actionButtons = toolbar.getByRole("button");
  for (let index = 0; index < (await actionButtons.count()); index += 1) {
    const box = await actionButtons.nth(index).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewportWidth);
  }
});

test("paginates large result sets and moves focus to the new page", async ({ page }) => {
  const text = Array.from(
    { length: 55 },
    (_, index) => `Item ${index + 1} has value ${1000 + index}.`,
  ).join("\n");
  await page.getByRole("textbox", { name: "原文" }).fill(text);
  await page.getByRole("textbox", { name: "改写稿" }).fill(text);
  await page.getByRole("button", { name: /对照两版/ }).click();
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
  await page.getByRole("button", { name: /对照两版/ }).click();
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
