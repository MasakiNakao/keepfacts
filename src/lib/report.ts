import type { ComparedFact, Fact, FactComparison, FactKind } from "./facts";

export type ReportLocale = "zh" | "en";

const labels: Record<
  ReportLocale,
  {
    title: string;
    generated: string;
    metric: string;
    value: string;
    sourceFacts: string;
    automaticSummary: string;
    requiredSummary: string;
    requiredChecks: string;
    requiredCount: string;
    requiredCheckable: string;
    requiredMissing: string;
    requiredNotInSource: string;
    requiredRetention: string;
    preserved: string;
    review: string;
    added: string;
    retention: string;
    none: string;
    changed: string;
    missing: string;
    invalid: string;
    notInSource: string;
    notInSourceAdded: string;
    newFact: string;
    disclaimer: string;
    kinds: Record<FactKind, string>;
  }
> = {
  zh: {
    title: "KeepFacts 核对报告",
    generated: "生成日期",
    metric: "项目",
    value: "结果",
    sourceFacts: "自动事实",
    automaticSummary: "自动事实摘要",
    requiredSummary: "必须保留摘要",
    requiredChecks: "必须保留检查",
    requiredCount: "必保项目",
    requiredCheckable: "可核对",
    requiredMissing: "改写缺失",
    requiredNotInSource: "原文未找到",
    requiredRetention: "必保保留率",
    preserved: "已保留",
    review: "需确认",
    added: "改写新增",
    retention: "自动事实保留率",
    none: "无",
    changed: "可能改成",
    missing: "改写稿中未找到对应事实",
    invalid: "日期数值超出有效范围",
    notInSource: "原文中未找到，请检查这项输入",
    notInSourceAdded: "原文中未找到；仅在改写稿出现，不算作已保留",
    newFact: "只在改写稿中出现",
    disclaimer:
      "KeepFacts 只检查可精确提取的硬事实，不能代替人工判断整段文字的语义是否正确。",
    kinds: {
      required: "必须保留",
      money: "金额",
      percentage: "百分比",
      date: "日期",
      time: "时间",
      version: "版本",
      email: "邮箱",
      url: "链接",
      measurement: "数量 / 单位",
      range: "数值范围",
      quote: "引语",
      number: "数字",
    },
  },
  en: {
    title: "KeepFacts report",
    generated: "Generated",
    metric: "Metric",
    value: "Result",
    sourceFacts: "Automatic facts",
    automaticSummary: "Automatic fact summary",
    requiredSummary: "Must-preserve summary",
    requiredChecks: "Must-preserve checks",
    requiredCount: "Required items",
    requiredCheckable: "Checkable",
    requiredMissing: "Missing from rewrite",
    requiredNotInSource: "Not found in source",
    requiredRetention: "Required retention",
    preserved: "Preserved",
    review: "Needs review",
    added: "New in rewrite",
    retention: "Automatic retention",
    none: "None",
    changed: "Possibly changed to",
    missing: "No corresponding fact found in the rewrite",
    invalid: "Date value is outside the valid calendar range",
    notInSource: "Not found in the source; check this input",
    notInSourceAdded:
      "Not found in the source; appearing only in the rewrite is not preservation",
    newFact: "Appears only in the rewrite",
    disclaimer:
      "KeepFacts checks exact, extractable facts only. It cannot replace human review of the full meaning.",
    kinds: {
      required: "Required",
      money: "Money",
      percentage: "Percentage",
      date: "Date",
      time: "Time",
      version: "Version",
      email: "Email",
      url: "Link",
      measurement: "Quantity / unit",
      range: "Range",
      quote: "Quote",
      number: "Number",
    },
  },
};

function inlineCode(value: string) {
  const runs = value.match(/`+/g) ?? [];
  const longestRun = Math.max(0, ...runs.map((run) => run.length));
  const fence = "`".repeat(longestRun + 1);
  const padded = value.startsWith("`") || value.endsWith("`")
    ? ` ${value} `
    : value;
  return `${fence}${padded}${fence}`;
}

function factLine(
  fact: Fact | ComparedFact,
  locale: ReportLocale,
  added = false,
) {
  const t = labels[locale];
  const compared = fact as ComparedFact;
  let note = added ? t.newFact : t.preserved;

  if (!added && compared.status === "review") {
    if (compared.reviewReason === "invalid") note = t.invalid;
    else if (compared.reviewReason === "not-in-source") {
      note = compared.matched ? t.notInSourceAdded : t.notInSource;
    }
    else if (compared.possibleMatch) {
      note = `${t.changed} ${inlineCode(compared.possibleMatch.raw)}`;
    } else note = t.missing;
  }

  return `- **${t.kinds[fact.kind]}** ${inlineCode(fact.raw)} — ${note}`;
}

export function formatLocalDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function section(
  title: string,
  facts: Array<Fact | ComparedFact>,
  locale: ReportLocale,
  added = false,
) {
  const t = labels[locale];
  const lines = facts.length
    ? facts.map((fact) => factLine(fact, locale, added))
    : [`- ${t.none}`];
  return [`## ${title}`, "", ...lines, ""].join("\n");
}

export function buildMarkdownReport(
  comparison: FactComparison,
  locale: ReportLocale,
  generatedAt = new Date(),
) {
  const t = labels[locale];
  const total = comparison.sourceFacts.length;
  const retention = total
    ? Math.round((comparison.preservedCount / total) * 100)
    : null;
  const requiredRetention = comparison.requiredCheckableCount
    ? Math.round(
        (comparison.requiredPreservedCount /
          comparison.requiredCheckableCount) *
          100,
      )
    : null;
  const retentionLabel = retention === null ? "—" : `${retention}%`;
  const requiredRetentionLabel =
    requiredRetention === null ? "—" : `${requiredRetention}%`;
  const preserved = comparison.sourceFacts.filter(
    (fact) => fact.status === "preserved",
  );
  const review = comparison.sourceFacts.filter(
    (fact) => fact.status === "review",
  );

  return [
    `# ${t.title}`,
    "",
    `${t.generated}: ${formatLocalDate(generatedAt)}`,
    "",
    `## ${t.automaticSummary}`,
    "",
    `| ${t.metric} | ${t.value} |`,
    "| --- | ---: |",
    `| ${t.sourceFacts} | ${total} |`,
    `| ${t.preserved} | ${comparison.preservedCount} |`,
    `| ${t.review} | ${comparison.reviewCount} |`,
    `| ${t.added} | ${comparison.addedCount} |`,
    `| ${t.retention} | ${retentionLabel} |`,
    "",
    `## ${t.requiredSummary}`,
    "",
    `| ${t.metric} | ${t.value} |`,
    "| --- | ---: |",
    `| ${t.requiredCount} | ${comparison.requiredCount} |`,
    `| ${t.requiredCheckable} | ${comparison.requiredCheckableCount} |`,
    `| ${t.preserved} | ${comparison.requiredPreservedCount} |`,
    `| ${t.requiredMissing} | ${comparison.requiredMissingCount} |`,
    `| ${t.requiredNotInSource} | ${comparison.requiredNotInSourceCount} |`,
    `| ${t.requiredRetention} | ${requiredRetentionLabel} |`,
    "",
    section(t.requiredChecks, comparison.requiredFacts, locale),
    section(t.review, review, locale),
    section(t.preserved, preserved, locale),
    section(t.added, comparison.addedFacts, locale, true),
    `> ${t.disclaimer}`,
    "",
  ].join("\n");
}
