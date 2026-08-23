import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import {
  KEEPFACTS_MAX_REQUIRED_ITEM_LENGTH,
  KEEPFACTS_MAX_TEXT_LENGTH,
} from "../../src/lib/input-limits";

const packageMetadata = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
) as { version: string };
const expectedVersion = `v${packageMetadata.version}`;
const reviewAndTextResetMessage =
  "当前文本和已有 1 条人工审阅记录将被清除，是否继续？";
const reviewResetMessage =
  "已有 1 条人工审阅记录。继续操作将清除这些记录，是否继续？";
const textResetMessage =
  "当前输入的原文、改写稿或必保内容将被清除，是否继续？";

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
  expectedMessage: string,
) {
  const dialogPromise = page.waitForEvent("dialog");
  const clickPromise = action.click();
  const dialog = await dialogPromise;
  expect(dialog.type()).toBe("confirm");
  expect(dialog.message()).toBe(expectedMessage);
  if (accept) await dialog.accept();
  else await dialog.dismiss();
  await clickPromise;
}

async function forceTextareaValue(textarea: Locator, value: string) {
  await textarea.evaluate((element, nextValue) => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    setter?.call(element, nextValue);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}

async function openMachineEvidence(page: Page) {
  const details = page.getByTestId("machine-evidence");
  if (!(await details.evaluate((element) => (element as HTMLDetailsElement).open))) {
    await details.locator(":scope > summary").click();
  }
  await expect(details).toHaveAttribute("open", "");
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
  await expect(page.getByRole("button", { name: "载入示例" })).toHaveCount(0);

  await page
    .locator(".hero")
    .getByRole("button", { name: "核对我的文本", exact: true })
    .click();
  await expect(page.getByRole("textbox", { name: "原文" })).toHaveValue("");
  await expect(page.getByRole("textbox", { name: "改写稿" })).toHaveValue("");
  await expect(page.getByRole("heading", { name: "核对结果" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /对照两版/ }),
  ).toBeDisabled();
});

test("lets keyboard users skip directly to the comparison workspace", async ({
  page,
}) => {
  const skipLink = page.getByRole("link", { name: "跳到核对区" });
  await skipLink.focus();
  await expect(skipLink).toBeVisible();
  await skipLink.press("Enter");
  await expect(page).toHaveURL(/#checker$/);
  await expect
    .poll(() =>
      page.locator("#checker").evaluate((element) =>
        Math.round(element.getBoundingClientRect().top),
      ),
    )
    .toBeLessThanOrEqual(24);
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
  const primaryEmpty = page.locator(".results-primary-empty");
  await expect(
    primaryEmpty.getByRole("heading", { name: "未识别到可核对的硬事实" }),
  ).toBeVisible();
  await expect(
    primaryEmpty.getByText(
      "当前文本中未识别到日期、金额、数量、单位、邮箱或链接等硬事实。请调整文本后重新核对，或载入示例。",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.locator(".review-decision-guide")).toHaveCount(0);
  await expect(page.locator(".review-toolbar").getByText("0/0", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "复制核对报告", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "复制完成报告", exact: true }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "English" }).click();
  await expect(
    primaryEmpty.getByRole("heading", { name: "No comparable exact facts detected" }),
  ).toBeVisible();
  await expect(
    primaryEmpty.getByText(
      "No dates, amounts, quantities, units, emails, or links were detected. Edit the text and recheck, or load the example.",
      { exact: true },
    ),
  ).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test("distinguishes an empty filter from extracting no facts", async ({ page }) => {
  await setComparison(page, "Alpha has 100 users.", "Alpha has 100 users.");
  await page.getByRole("button", { name: /对照两版/ }).click();
  await openMachineEvidence(page);
  const filters = page.locator(".automatic-results .filter-tabs");
  await filters.getByRole("button", { name: /需确认/ }).click();
  await expect(
    page.getByRole("heading", { name: "当前筛选没有项目" }),
  ).toBeVisible();
  await expect(
    page.getByText("此筛选下没有可显示的自动事实，请选择其他筛选项。", {
      exact: true,
    }),
  ).toBeVisible();

  await page.getByRole("button", { name: "English" }).click();
  await expect(
    page.getByRole("heading", { name: "No items in this filter" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "This filter has no automatic facts to show. Choose another filter.",
      { exact: true },
    ),
  ).toBeVisible();
});

test("prioritizes the example and exposes proof, trust, and feedback", async ({
  page,
}) => {
  const hero = page.locator(".hero");
  const exampleAction = hero.getByRole("button", {
    name: "30 秒看它抓出 3 处错误",
    exact: true,
  });
  await expect(
    exampleAction,
  ).toBeVisible();
  await expect(exampleAction).toHaveClass(/hero-primary-action/);
  await expect(
    hero.getByRole("button", { name: "核对我的文本", exact: true }),
  ).toBeVisible();
  await expect(
    hero.getByRole("button", { name: "核对我的文本", exact: true }),
  ).toHaveClass(/hero-secondary-action/);

  const proof = hero.getByRole("list", { name: "示例中的三处变化" });
  await expect(proof.getByRole("listitem")).toHaveText([
    "9月15日 → 9月18日",
    "100人 → 80人",
    "发布链接缺失",
  ]);

  const trust = hero.getByRole("navigation", { name: "源码、隐私与反馈" });
  const links = [
    {
      name: "查看源码",
      href: "https://github.com/MasakiNakao/keepfacts",
    },
    {
      name: "隐私与边界",
      href: "https://github.com/MasakiNakao/keepfacts/blob/main/SECURITY.md",
    },
    {
      name: "反馈漏检 / 误报",
      href: "https://github.com/MasakiNakao/keepfacts/issues/new?template=bug_report.yml",
    },
  ];
  for (const { name, href } of links) {
    const link = trust.getByRole("link", { name, exact: true });
    await expect(link).toHaveAttribute("href", href);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noreferrer");
  }
  await expect(hero.locator(".feedback-safety")).toHaveText(
    "反馈时请勿提交敏感、私人或机密文本。",
  );

  await exampleAction.click();
  await expect(page.getByRole("heading", { name: "核对结果" })).toBeFocused();

  await expect(
    page.getByRole("button", { name: "使用我的文本", exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "载入示例", exact: true }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "English" }).click();
  await expect(
    hero.getByRole("button", {
      name: "See 3 errors in 30 seconds",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    hero.getByRole("list", { name: "Three changes in the example" })
      .getByRole("listitem"),
  ).toHaveText([
    "Sep 15 → Sep 18",
    "100 users → 80 users",
    "Launch link missing",
  ]);
  await expect(
    hero.getByText(
      "Do not include sensitive, private, or confidential text in feedback.",
      { exact: true },
    ),
  ).toBeVisible();
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
  await findings.required.getByRole("radio", { name: "改写可接受" }).check();
  await findings.added.getByRole("radio", { name: "不纳入本次审阅" }).check();
  await expect(
    manual.locator('[data-review-state="needs-changes"]'),
  ).toHaveText("需要修改");

  await findings.automatic.getByRole("radio", { name: "改写可接受" }).check();
  await expect(manual.locator('[data-review-state="acceptable"]')).toHaveText(
    "审阅完成 · 无确认问题",
  );
});

test("keeps the human decision queue primary and machine evidence available on demand", async ({
  page,
}) => {
  const evidence = page.getByTestId("machine-evidence");
  await expect(evidence).not.toHaveAttribute("open", "");
  await expect(page.locator(".review-evidence").first()).toBeVisible();
  await expect(evidence.locator(".automatic-results")).toBeHidden();

  const summary = evidence.locator(":scope > summary");
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(evidence).toHaveAttribute("open", "");
  await expect(evidence.locator(".automatic-results")).toBeVisible();
});

test("labels an invalid date introduced only by the rewrite", async ({ page }) => {
  await setComparison(
    page,
    "Project Atlas starts after approval.",
    "Project Atlas starts on 2026-02-30.",
  );
  await page.getByRole("button", { name: /对照两版/ }).click();

  const addedFinding = page.locator(
    '.review-queue > li[data-review-scope="added"]',
  );
  await expect(addedFinding).toContainText("2026-02-30");
  await expect(addedFinding).toContainText(
    "只在改写稿中出现，但该日期或时间值无效",
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
  const confirmed = findings.automatic.getByRole("radio", {
    name: "确认需处理",
  });
  await confirmed.focus();
  await page.keyboard.press("Space");

  const nextHeading = findings.required.getByRole("heading", { level: 4 });
  await expect(nextHeading).toBeFocused();
  await expect(page.getByTestId("review-announcement")).toContainText(
    "还剩 2 项待处理",
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

test("filters and searches review evidence without changing stable item numbers", async ({
  page,
}) => {
  const findings = await createThreeWayReview(page);
  const queue = page.getByRole("list", { name: "人工审阅队列" });

  await expect(page.locator(".review-evidence mark")).toHaveCount(4);
  await expect(findings.automatic.getByRole("heading", { level: 4 })).toContainText(
    /^1\./,
  );
  await findings.automatic
    .getByRole("radio", { name: "确认需处理" })
    .check();

  await page.getByRole("button", { name: /确认需处理.*1/ }).click();
  await expect(queue.locator(":scope > li")).toHaveCount(1);
  await expect(queue.getByRole("heading", { level: 4 })).toContainText(/^1\./);

  await page.getByRole("button", { name: /^全部/ }).click();
  const search = page.getByRole("searchbox", { name: "查找审阅项" });
  await search.fill("2026-09-15");
  await expect(queue.locator(":scope > li")).toHaveCount(2);
  await expect(
    queue
      .locator(':scope > li[data-review-scope="added"]')
      .getByRole("heading", { level: 4 }),
  ).toContainText(/^3\./);
  await search.fill("not-present-anywhere");
  await expect(
    page.getByRole("heading", { name: "没有符合条件的审阅项" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "显示全部审阅项" }).click();
  await expect(queue.locator(":scope > li")).toHaveCount(3);
  await expect(page.getByTestId("review-visible-count")).toHaveText(
    "显示 3/3 项",
  );
});

test("keeps focus and control relationships valid when a decision hides its card", async ({
  page,
}) => {
  const findings = await createThreeWayReview(page);
  await findings.automatic
    .getByRole("radio", { name: "确认需处理" })
    .check();
  await page.getByRole("button", { name: /确认需处理.*1/ }).click();

  const filteredCard = page.locator(
    '.review-queue > li[data-review-scope="source"]',
  );
  await expect(filteredCard).toHaveCount(1);
  const accepted = filteredCard.getByRole("radio", { name: "改写可接受" });
  await accepted.focus();
  await page.keyboard.press("Space");

  const search = page.getByRole("searchbox", { name: "查找审阅项" });
  await expect(search).toBeFocused();
  await expect(page.getByRole("list", { name: "人工审阅队列" })).toHaveCount(0);
  await expect(page.locator(".review-filter-tabs button").first()).not.toHaveAttribute(
    "aria-controls",
  );

  await page.getByRole("button", { name: "显示全部审阅项" }).click();
  await expect(search).toBeFocused();
  await expect(page.getByRole("list", { name: "人工审阅队列" })).toBeVisible();
  await expect(page.locator(".review-filter-tabs button").first()).toHaveAttribute(
    "aria-controls",
    "review-queue",
  );
});

test("highlights the exact repeated and whitespace-normalized evidence", async ({
  page,
}) => {
  await setComparison(
    page,
    "Alpha has 100 users. Beta has 100 users. Weight is 100   kg.",
    "Alpha has 100 users. Beta has 90 users. Weight is 90 kg.",
  );
  await page.getByRole("button", { name: /对照两版/ }).click();

  const sourceContexts = page.locator(
    '.review-queue > li[data-review-scope="source"] .review-evidence > div:first-child p',
  );
  await expect(sourceContexts).toHaveCount(2);

  const repeatedMark = sourceContexts.nth(0).locator("mark");
  await expect(repeatedMark).toHaveText("100");
  expect(
    await repeatedMark.evaluate(
      (element) => element.previousSibling?.textContent ?? "",
    ),
  ).toMatch(/Beta has $/u);

  await expect(sourceContexts.nth(1).locator("mark")).toHaveText("100 kg");
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
  await answerConfirmation(page, loadExample, false, reviewAndTextResetMessage);
  await expect(page.getByRole("textbox", { name: "原文" })).toHaveValue(
    customSource,
  );
  await expect(
    findings.automatic.getByRole("radio", { name: "确认需处理" }),
  ).toBeChecked();

  await answerConfirmation(page, loadExample, true, reviewAndTextResetMessage);
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
  await answerConfirmation(page, clear, false, reviewResetMessage);
  await expect(
    findings.automatic.getByRole("radio", { name: "确认需处理" }),
  ).toBeChecked();
  await expect(page.getByRole("heading", { name: "核对结果" })).toBeVisible();

  await answerConfirmation(page, clear, true, reviewResetMessage);
  await expect(page.getByRole("textbox", { name: "原文" })).toHaveValue("");
  await expect(page.getByRole("textbox", { name: "改写稿" })).toHaveValue("");
  await expect(page.getByRole("heading", { name: "核对结果" })).toHaveCount(0);
});

test("protects entered text before loading an example or clearing", async ({
  page,
}) => {
  await page
    .locator(".hero")
    .getByRole("button", { name: "核对我的文本", exact: true })
    .click();
  const source = page.getByRole("textbox", { name: "原文" });
  const revision = page.getByRole("textbox", { name: "改写稿" });
  await source.fill("合同金额为 ¥12,000。交付日期为 2026年10月1日。");
  await revision.fill("合同金额为 ¥12,000，计划于 2026年10月1日交付。");

  const loadExample = page
    .getByRole("region", { name: "我的文本" })
    .getByRole("button", { name: "载入示例", exact: true });
  await answerConfirmation(page, loadExample, false, textResetMessage);
  await expect(source).toHaveValue(/合同金额/);
  await expect(revision).toHaveValue(/计划于/);

  await answerConfirmation(page, loadExample, true, textResetMessage);
  await expect(page.getByRole("region", { name: "示例模式" })).toBeVisible();
  await page.getByRole("button", { name: "使用我的文本", exact: true }).click();
  await source.fill("原文仍在编辑中，预算为 ¥9,000。");
  await revision.fill("改写稿仍在编辑中，预算为 ¥9,000。");

  const clear = page.getByRole("button", { name: "清空", exact: true });
  await answerConfirmation(page, clear, false, textResetMessage);
  await expect(source).toHaveValue(/原文仍在编辑中/);
  await expect(revision).toHaveValue(/改写稿仍在编辑中/);

  await answerConfirmation(page, clear, true, textResetMessage);
  await expect(source).toHaveValue("");
  await expect(revision).toHaveValue("");
});

test("round-trips private session text and review records after confirmation", async ({
  page,
}) => {
  const findings = await createThreeWayReview(page);
  const sourceValue = await page.getByRole("textbox", { name: "原文" }).inputValue();
  const revisionValue = await page
    .getByRole("textbox", { name: "改写稿" })
    .inputValue();
  const unsavedNotice =
    "有未导出的更改：内容仅保存在当前页面内存中，刷新或关闭可能丢失。";
  const checkpointNotice =
    "当前工作已与最近导入或导出的会话文件一致；浏览器仍不会自动保存。";

  await findings.automatic
    .getByRole("radio", { name: "确认需处理" })
    .check();
  await findings.automatic
    .getByRole("textbox", { name: "审阅备注 · 可选" })
    .fill("原文数字已有审批记录");
  await findings.automatic
    .getByRole("textbox", { name: "期望修复 · 可选" })
    .fill("恢复为 100 users");

  const saveState = page.getByTestId("session-save-state");
  await expect(saveState).toHaveAttribute("data-session-state", "unsaved");
  await expect(saveState).toHaveText(unsavedNotice);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const event = new Event("beforeunload", { cancelable: true });
        return window.dispatchEvent(event);
      }),
    )
    .toBe(false);
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
  await expect(saveState).toHaveAttribute("data-session-state", "checkpoint");
  await expect(saveState).toHaveText(checkpointNotice);
  expect(
    await page.evaluate(() => {
      const event = new Event("beforeunload", { cancelable: true });
      return window.dispatchEvent(event);
    }),
  ).toBe(true);
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

test("rejects a malformed session without changing current work", async ({
  page,
}) => {
  const source = page.getByRole("textbox", { name: "原文" });
  const revision = page.getByRole("textbox", { name: "改写稿" });
  const originalSource = await source.inputValue();
  const originalRevision = await revision.inputValue();
  const queue = page.getByRole("list", { name: "人工审阅队列" });
  const originalQueue = await queue.textContent();
  let dialogs = 0;
  page.on("dialog", async (dialog) => {
    dialogs += 1;
    await dialog.dismiss();
  });

  await page.locator('.session-actions input[type="file"]').setInputFiles({
    name: "broken.keepfacts.json",
    mimeType: "application/json",
    buffer: Buffer.from("{not valid JSON", "utf8"),
  });

  await expect(page.getByRole("alert")).toHaveText(
    "会话文件内容损坏或结构不符合格式，无法导入；当前内容未更改。",
  );
  await expect(page.getByRole("button", { name: "导入会话" })).toBeEnabled();
  await expect(source).toHaveValue(originalSource);
  await expect(revision).toHaveValue(originalRevision);
  expect(await queue.textContent()).toBe(originalQueue);
  expect(dialogs).toBe(0);

  await page.getByRole("button", { name: "English" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("classifies an imported session that exceeds the fact limit", async ({
  page,
}) => {
  const originalSource = await page.getByRole("textbox", { name: "原文" }).inputValue();
  const dense = Array.from(
    { length: 1_001 },
    (_, index) => `Item ${index} is ${100_000 + index}.`,
  ).join(" ");
  const input = { source: dense, revision: dense, required: "" };
  const session = {
    format: "keepfacts.session",
    schemaVersion: 1,
    exportedAt: "2026-08-24T00:00:00.000Z",
    generator: { appVersion: packageMetadata.version, commitSha: "local" },
    privacy: { containsFullText: true, encrypted: false },
    locale: "zh",
    editor: input,
    result: { input, reviewRecords: [] },
  };

  await page.locator('.session-actions input[type="file"]').setInputFiles({
    name: "too-many-facts.keepfacts.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(session), "utf8"),
  });

  await expect(page.getByRole("alert")).toHaveText(
    "会话内容超过当前版本的安全处理上限，无法导入；当前内容未更改。",
  );
  await expect(page.getByRole("textbox", { name: "原文" })).toHaveValue(
    originalSource,
  );
});

test("marks a new comparison from an imported draft as unexported work", async ({
  page,
}) => {
  const input = {
    source: "Alpha has 100 users.",
    revision: "Alpha has 80 users.",
    required: "",
  };
  const draftSession = {
    format: "keepfacts.session",
    schemaVersion: 1,
    exportedAt: "2026-08-24T00:00:00.000Z",
    generator: { appVersion: packageMetadata.version, commitSha: "local" },
    privacy: { containsFullText: true, encrypted: false },
    locale: "zh",
    editor: input,
    result: null,
  };

  const confirmation = page.waitForEvent("dialog");
  await page.locator('.session-actions input[type="file"]').setInputFiles({
    name: "draft.keepfacts.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(draftSession), "utf8"),
  });
  const dialog = await confirmation;
  await dialog.accept();

  const saveState = page.getByTestId("session-save-state");
  await expect(saveState).toHaveAttribute("data-session-state", "checkpoint");
  await page.getByRole("button", { name: /对照两版/ }).click();
  await expect(page.getByRole("heading", { name: "核对结果" })).toBeFocused();
  await expect(saveState).toHaveAttribute("data-session-state", "unsaved");

  const orphanSession = {
    ...draftSession,
    result: {
      input,
      reviewRecords: [{ key: "source:number-orphan", decision: "confirmed" }],
    },
  };
  const orphanConfirmation = page.waitForEvent("dialog");
  await page.locator('.session-actions input[type="file"]').setInputFiles({
    name: "orphan.keepfacts.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(orphanSession), "utf8"),
  });
  const orphanDialog = await orphanConfirmation;
  await orphanDialog.accept();
  await expect(
    page.getByRole("status").filter({
      hasText: "会话已导入：恢复 0 条人工记录，1 条未匹配。",
    }),
  ).toBeVisible();
  await expect(saveState).toHaveAttribute("data-session-state", "unsaved");
});

test("imports a valid session with 400 must-preserve items", async ({ page }) => {
  const alphaSuffix = (value: number) => {
    let remaining = value;
    let suffix = "";
    do {
      suffix = String.fromCharCode(97 + (remaining % 26)) + suffix;
      remaining = Math.floor(remaining / 26) - 1;
    } while (remaining >= 0);
    return suffix;
  };
  const requiredItems = Array.from(
    { length: 400 },
    (_, index) => `KeepTerm${alphaSuffix(index)}`,
  );
  const input = {
    source: requiredItems.join(" "),
    revision: requiredItems.join(" "),
    required: requiredItems.join("\n"),
  };
  const session = {
    format: "keepfacts.session",
    schemaVersion: 1,
    exportedAt: "2026-08-15T00:00:00.000Z",
    generator: { appVersion: packageMetadata.version, commitSha: "local" },
    privacy: { containsFullText: true, encrypted: false },
    locale: "zh",
    editor: input,
    result: { input, reviewRecords: [] },
  };

  const confirmation = page.waitForEvent("dialog");
  await page.locator('.session-actions input[type="file"]').setInputFiles({
    name: "four-hundred.keepfacts.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(session), "utf8"),
  });
  const dialog = await confirmation;
  expect(dialog.message()).toBe(
    "导入将替换当前文本、结果和人工记录。已先在本地完成校验，是否继续？",
  );
  await dialog.accept();

  await expect(page.getByRole("heading", { name: "核对结果" })).toBeFocused();
  await openMachineEvidence(page);
  const requiredResults = page.locator(".required-results");
  await expect(
    requiredResults
      .locator(".summary-card")
      .filter({ hasText: "已配置" })
      .locator("strong"),
  ).toHaveText("400");
  await expect(
    requiredResults.getByRole("navigation", { name: "必须保留检查" }),
  ).toContainText("第 1/8 页，共 400 项");
  await expect(
    page.getByRole("status").filter({ hasText: "会话已导入：恢复 0 条人工记录" }),
  ).toBeVisible();
});

test("keeps first-exposure controls accessible at 390px", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "mobile copy contract");

  await expect(page.getByTestId("privacy-copy")).toHaveText(
    "本地处理 · 文本不会上传",
  );
  await expect.poll(() =>
    page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);

  const viewportWidth = page.viewportSize()!.width;
  expect(viewportWidth).toBe(390);
  const controls = page.locator(
    "button, .brand, .trust-links a, .required-panel summary, .context-details summary, .review-decision-option",
  );
  for (let index = 0; index < (await controls.count()); index += 1) {
    const box = await controls.nth(index).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }

  const firstExposureControls = page.locator(
    ".language-button, .hero-actions button, .trust-links a, .input-mode button",
  );
  for (
    let index = 0;
    index < (await firstExposureControls.count());
    index += 1
  ) {
    const box = await firstExposureControls.nth(index).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewportWidth);
  }

  const retentionMetric = page.locator(".retention-metric");
  const metricBox = await retentionMetric.boundingBox();
  expect(metricBox).not.toBeNull();
  expect(metricBox!.width).toBeGreaterThan(metricBox!.height);
  await expect
    .poll(() =>
      retentionMetric.locator("small").evaluate(
        (label) => label.scrollWidth <= label.clientWidth,
      ),
    )
    .toBe(true);

  await page.getByRole("button", { name: "English", exact: true }).click();
  const englishCheckerBox = await page.locator("#checker").boundingBox();
  expect(englishCheckerBox).not.toBeNull();
  expect(englishCheckerBox!.y).toBeLessThanOrEqual(800);

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);

  await page.setViewportSize({ width: 320, height: 720 });
  await openMachineEvidence(page);
  const narrowFilters = page.locator(".automatic-results .filter-tabs button");
  for (let index = 0; index < (await narrowFilters.count()); index += 1) {
    const button = narrowFilters.nth(index);
    await expect
      .poll(() =>
        button.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      )
      .toBe(true);
  }
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    )
    .toBe(true);
});

test("shows a visible focus ring on must-preserve input", async ({ page }) => {
  const panel = page.locator(".required-panel");
  if (!(await panel.evaluate((element) => (element as HTMLDetailsElement).open))) {
    await panel.locator("summary").click();
  }
  const required = page.getByRole("textbox", { name: "必须保留的内容" });
  await required.focus();
  await expect(required).toBeFocused();
  expect(await required.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe(
    "solid",
  );
  expect(
    Number.parseFloat(
      await required.evaluate((element) => getComputedStyle(element).outlineWidth),
    ),
  ).toBeGreaterThanOrEqual(3);
});

test("keeps the review toolbar compact in a short landscape viewport", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "desktop landscape contract");
  await page.setViewportSize({ width: 800, height: 360 });
  const toolbar = page.locator(".review-toolbar");
  await expect(toolbar).toHaveCSS("position", "static");
  const box = await toolbar.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeLessThanOrEqual(126);
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

  await openMachineEvidence(page);
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

  await openMachineEvidence(page);
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
  await expect(automaticFinding).toContainText(
    "选择人工结论后，可补充备注和期望修复。",
  );
  await expect(
    automaticFinding.getByRole("textbox", { name: "审阅备注 · 可选" }),
  ).toHaveCount(0);
  await automaticFinding.getByRole("radio", { name: "待处理" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    automaticFinding.getByRole("radio", { name: "确认需处理" }),
  ).toBeChecked();
  await automaticFinding
    .getByRole("textbox", { name: "审阅备注 · 可选" })
    .fill("原文数字来自已批准版本");
  await automaticFinding
    .getByRole("textbox", { name: "期望修复 · 可选" })
    .fill("恢复为 100 users");
  const requiredFinding = page.locator(
    '.review-queue > li[data-review-scope="required"]',
  );
  await requiredFinding.getByRole("radio", { name: "改写可接受" }).check();
  const addedFinding = page.locator(
    '.review-queue > li[data-review-scope="added"]',
  );
  await expect(addedFinding.locator(".fact-value")).toHaveCount(1);
  await addedFinding
    .getByRole("radio", { name: "不纳入本次审阅" })
    .check();

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

  await page.getByRole("button", { name: "复制完成报告" }).click();
  await expect(page.getByTestId("review-announcement")).toHaveText(
    "报告已复制",
  );
  const report = await page.evaluate(() => navigator.clipboard.readText());
  expect(report).toContain("## 人工审阅摘要");
  expect(report).toContain("**人工结论:** `确认需处理`");
  expect(report).toContain("**人工结论:** `改写可接受`");
  expect(report).toContain("**人工结论:** `不纳入本次审阅`");

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
      .getByRole("radio", { name: "Acceptable change" }),
  ).toBeChecked();
  await page
    .locator('.review-queue > li[data-review-scope="source"]')
    .getByRole("radio", { name: "Acceptable change" })
    .check();
  await expect(page.getByTestId("review-announcement")).toHaveText(
    /^Automatic fact .*: Acceptable change\. 0 pending items remain\.$/,
  );

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
  await expect(page.getByRole("button", { name: "复制草稿报告" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "下载草稿" })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "下一条待处理" }),
  ).toHaveCount(0);
  const inPlaceRecheck = page.locator(
    'button[data-review-action="recheck"]',
  );
  await expect(inPlaceRecheck).toHaveText("重新核对当前文本");
  await expect(inPlaceRecheck).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "复制修复清单" }),
  ).toBeDisabled();
  await expect(reviewQueue.getByRole("radio").first()).toBeDisabled();
  await expect(reviewQueue.getByRole("textbox").first()).toBeDisabled();

  await inPlaceRecheck.click();
  await expect(inPlaceRecheck).toHaveAttribute("aria-busy", "true");
  await source.fill(`${await source.inputValue()} 再新增 43。`);
  await expect(inPlaceRecheck).toHaveAttribute("aria-busy", "false");
  await page.waitForTimeout(300);
  await expect(page.getByText(/上次核对结果/)).toBeVisible();

  await page.unroute("**/*compare.worker*.js");
  await inPlaceRecheck.click();
  await expect(page.getByRole("button", { name: "复制草稿报告" })).toBeEnabled();
  await expect(page.getByText(/上次核对结果/)).toHaveCount(0);
  await expect(
    page.getByRole("list", { name: "人工审阅队列" }).getByRole("radio").first(),
  ).toBeEnabled();
});

test("rejects structural input limits atomically before compare or session export", async ({
  page,
}) => {
  const source = page.getByRole("textbox", { name: "原文" });
  const revision = page.getByRole("textbox", { name: "改写稿" });
  const required = page.locator(".required-panel textarea");
  await expect(source).toHaveAttribute(
    "aria-describedby",
    "source-character-limit",
  );
  await expect(revision).toHaveAttribute(
    "aria-describedby",
    "revision-character-limit",
  );
  await expect(required).toHaveAttribute(
    "aria-describedby",
    "required-character-limit",
  );

  const originalSource = await source.inputValue();
  const previousQueue = page.getByRole("list", { name: "人工审阅队列" });
  const previousQueueText = await previousQueue.textContent();
  let workerRequests = 0;
  await page.route("**/*compare.worker*.js", async (route) => {
    workerRequests += 1;
    await route.continue();
  });

  await forceTextareaValue(source, "A".repeat(KEEPFACTS_MAX_TEXT_LENGTH + 1));
  await expect(source).toHaveValue(originalSource);
  await expect(page.getByRole("alert")).toHaveText(
    "此次输入会使“原文”超过 250,000 个字符，已取消输入；当前内容未更改。",
  );
  expect(workerRequests).toBe(0);
  expect(await previousQueue.textContent()).toBe(previousQueueText);

  const requiredPanel = page.locator(".required-panel");
  if (!(await requiredPanel.evaluate((element) => (element as HTMLDetailsElement).open))) {
    await requiredPanel.locator("summary").click();
  }
  await forceTextareaValue(
    required,
    "R".repeat(KEEPFACTS_MAX_REQUIRED_ITEM_LENGTH + 1),
  );
  await expect.poll(async () => (await required.inputValue()).length).toBe(
    KEEPFACTS_MAX_REQUIRED_ITEM_LENGTH + 1,
  );
  await page.locator(".compare-button").click();
  await expect(page.getByRole("alert")).toHaveText(
    "必须保留的内容第 1 行最多 500 个字符，请缩短后重试。 上次结果已保留。",
  );
  expect(workerRequests).toBe(0);
  expect(await previousQueue.textContent()).toBe(previousQueueText);

  let dialogs = 0;
  page.on("dialog", async (dialog) => {
    dialogs += 1;
    await dialog.dismiss();
  });
  await page.getByRole("button", { name: "导出会话" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "无法导出会话" }),
  ).toHaveText(
    "无法导出会话：必须保留的内容第 1 行最多 500 个字符，请缩短后重试。 当前内容未更改。",
  );
  expect(dialogs).toBe(0);
  expect(await previousQueue.textContent()).toBe(previousQueueText);
});

test("rejects an oversized user insertion instead of silently truncating it", async ({
  page,
}) => {
  const source = page.getByRole("textbox", { name: "原文" });
  const acceptedLength = KEEPFACTS_MAX_TEXT_LENGTH - 2;
  await forceTextareaValue(source, "A".repeat(acceptedLength));
  await source.focus();
  await source.press("End");
  await page.keyboard.insertText("BBBB");

  await expect.poll(async () => (await source.inputValue()).length).toBe(
    acceptedLength,
  );
  await expect(page.getByRole("alert")).toHaveText(
    "此次输入会使“原文”超过 250,000 个字符，已取消输入；当前内容未更改。",
  );
  await expect(page.locator("#source-character-limit")).toHaveText(
    "249,998 / 250,000 字符",
  );

  await source.evaluate((element) => {
    const textarea = element as HTMLTextAreaElement;
    textarea.setSelectionRange(textarea.value.length - 2, textarea.value.length);
  });
  const pastePrevented = await source.evaluate((element) => {
    const transfer = new DataTransfer();
    transfer.setData("text/plain", "BBBBB");
    return !element.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: transfer,
      }),
    );
  });
  expect(pastePrevented).toBe(true);
  await expect.poll(async () => (await source.inputValue()).length).toBe(
    acceptedLength,
  );
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
    "每侧最多核对 1,000 项已提取事实，必保项最多 1,000 条。请拆分文本后重试。 上次结果已保留。",
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
  await expect(page.getByRole("alert")).toHaveText("核对未完成，请重试。");
  await expect(compareButton).toHaveAttribute("aria-busy", "false");
  await expect(page.getByRole("heading", { name: "核对结果" })).toHaveCount(0);

  await page.unroute("**/*compare.worker*.js");
  await compareButton.click();
  await expect(page.getByRole("heading", { name: "核对结果" })).toBeFocused();
  await expect(page.getByRole("alert")).toHaveCount(0);

  const source = page.getByRole("textbox", { name: "原文" });
  await source.fill(`${await source.inputValue()} Added 42.`);
  await page.route("**/*compare.worker*.js", (route) => route.abort());
  await compareButton.click();
  await expect(page.getByRole("alert")).toHaveText(
    "核对未完成，请重试。 上次结果已保留。",
  );
  await expect(page.getByText(/上次核对结果/)).toBeVisible();
});

test("times out a silent comparison worker and allows a retry", async ({
  page,
}) => {
  await page.getByRole("button", { name: "清空" }).click();
  await page.getByRole("textbox", { name: "原文" }).fill("Alpha has 100 users.");
  await page
    .getByRole("textbox", { name: "改写稿" })
    .fill("Alpha has 100 users.");
  await page.clock.install();
  let silenceNextWorker = true;
  await page.route("**/*compare.worker*.js", async (route) => {
    if (silenceNextWorker) {
      silenceNextWorker = false;
      await route.fulfill({
        status: 200,
        contentType: "application/javascript",
        headers: { "cache-control": "no-store" },
        body: "self.onmessage = () => {};",
      });
      return;
    }
    await route.continue();
  });

  const compareButton = page.locator(".compare-button");
  await compareButton.click();
  await expect(compareButton).toHaveAttribute("aria-busy", "true");
  await page.clock.fastForward(30_001);
  await expect(page.getByRole("alert")).toHaveText(
    "核对超过 30 秒，已停止。请重试。",
  );
  await expect(compareButton).toHaveAttribute("aria-busy", "false");
  await expect(page.getByRole("heading", { name: "核对结果" })).toHaveCount(0);

  await page.unroute("**/*compare.worker*.js");
  await compareButton.click();
  await expect(page.getByRole("heading", { name: "核对结果" })).toBeFocused();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("copies and downloads a traceable bilingual report", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "复制草稿报告" }).click();
  await expect(page.locator(".report-feedback")).toHaveText("报告已复制");
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain(`- **KeepFacts 版本:** ${expectedVersion}`);
  expect(copied).toMatch(/构建提交:\*\* `(?:local|[0-9a-f]{40})`/);
  expect(copied).toContain("原文语境");
  expect(copied).toContain("改写语境");

  const reportAnnouncement = page.getByTestId("review-announcement");
  await expect(reportAnnouncement).toHaveText("报告已复制");
  await expect(reportAnnouncement).toHaveText("", { timeout: 3_500 });
  await page.getByRole("button", { name: "复制草稿报告" }).click();
  await expect(reportAnnouncement).toHaveText("报告已复制");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载草稿" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(
    /^keepfacts-report-draft-\d{8}T\d{6}Z\.md$/,
  );
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const downloaded = await readFile(downloadPath!, "utf8");
  expect(downloaded).toContain(`- **KeepFacts 版本:** ${expectedVersion}`);
  expect(downloaded).toContain("原文语境");
  expect(downloaded).toContain("改写语境");

  await page.getByRole("button", { name: "English" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page).toHaveTitle("KeepFacts — Change the wording, not the facts");
  await openMachineEvidence(page);
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
  if (viewportWidth <= 520) {
    expect(toolbarBox!.height).toBeLessThanOrEqual(96);
  }

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
  await openMachineEvidence(page);
  await page
    .getByTestId("machine-evidence")
    .getByRole("button", { name: /^全部/ })
    .click();

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
  await openMachineEvidence(page);
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

test("paginates a large human-review queue with stable global numbering", async ({
  page,
}) => {
  const source = Array.from(
    { length: 25 },
    (_, index) =>
      `Item ${String.fromCharCode(65 + index)} has ${1000 + index} users.`,
  ).join("\n");
  const revision = Array.from(
    { length: 25 },
    (_, index) =>
      `Item ${String.fromCharCode(65 + index)} has ${2000 + index} users.`,
  ).join("\n");
  await setComparison(page, source, revision);
  await page.getByRole("button", { name: /对照两版/ }).click();

  const queue = page.getByRole("list", { name: "人工审阅队列" });
  const pagination = page.getByRole("navigation", { name: "人工审阅队列" });
  await expect(queue.locator(":scope > li")).toHaveCount(20);
  await expect(pagination).toContainText("第 1/2 页，共 25 项");
  await pagination.getByRole("button", { name: "下一页" }).click();
  await expect(queue.locator(":scope > li")).toHaveCount(5);
  await expect(queue.getByRole("heading", { level: 4 }).first()).toContainText(
    /^21\./,
  );
  await expect(page.getByRole("heading", { name: "人工审阅进度" })).toBeFocused();
});
