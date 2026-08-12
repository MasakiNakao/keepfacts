import type { ComparedFact, Fact, FactComparison, FactKind } from "./facts";

export type ReportLocale = "zh" | "en";

const labels: Record<
  ReportLocale,
  {
    title: string;
    generated: string;
    version: string;
    commit: string;
    metric: string;
    value: string;
    sourceFacts: string;
    automaticSummary: string;
    requiredSummary: string;
    requiredChecks: string;
    automaticReview: string;
    automaticPreserved: string;
    automaticAdded: string;
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
    sourceValue: string;
    rewriteValue: string;
    sourceContext: string;
    rewriteContext: string;
    notFound: string;
    disclaimer: string;
    kinds: Record<FactKind, string>;
  }
> = {
  zh: {
    title: "KeepFacts 核对报告",
    generated: "生成时间",
    version: "KeepFacts 版本",
    commit: "构建提交",
    metric: "项目",
    value: "结果",
    sourceFacts: "自动事实",
    automaticSummary: "自动事实摘要",
    requiredSummary: "必须保留摘要",
    requiredChecks: "必须保留检查",
    automaticReview: "自动事实：需确认",
    automaticPreserved: "自动事实：已保留",
    automaticAdded: "自动事实：改写新增",
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
    invalid: "可识别为日期或时间，但数值无效",
    notInSource: "原文中未找到，请检查这项输入",
    notInSourceAdded: "原文中未找到；仅在改写稿出现，不算作已保留",
    newFact: "只在改写稿中出现",
    sourceValue: "原文值",
    rewriteValue: "改写值",
    sourceContext: "原文语境",
    rewriteContext: "改写语境",
    notFound: "未找到",
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
    version: "KeepFacts version",
    commit: "Build commit",
    metric: "Metric",
    value: "Result",
    sourceFacts: "Automatic facts",
    automaticSummary: "Automatic fact summary",
    requiredSummary: "Must-preserve summary",
    requiredChecks: "Must-preserve checks",
    automaticReview: "Automatic facts: needs review",
    automaticPreserved: "Automatic facts: preserved",
    automaticAdded: "Automatic facts: new in rewrite",
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
    invalid: "Recognizable date or time found, but its value is invalid",
    notInSource: "Not found in the source; check this input",
    notInSourceAdded:
      "Not found in the source; appearing only in the rewrite is not preservation",
    newFact: "Appears only in the rewrite",
    sourceValue: "Source value",
    rewriteValue: "Rewrite value",
    sourceContext: "Source context",
    rewriteContext: "Rewrite context",
    notFound: "Not found",
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

  const sourceFact = added
    ? undefined
    : compared.sourceMatch ??
      (compared.reviewReason === "not-in-source" ? undefined : fact);
  const rewriteFact = added
    ? fact
    : compared.matched ?? compared.possibleMatch;
  const detail = (label: string, value?: string) =>
    `    - **${label}:** ${value ? inlineCode(value) : t.notFound}`;

  return [
    `- **${t.kinds[fact.kind]}** ${inlineCode(fact.raw)} — ${note}`,
    detail(t.sourceValue, sourceFact?.raw),
    detail(t.rewriteValue, rewriteFact?.raw),
    detail(t.sourceContext, sourceFact?.context),
    detail(t.rewriteContext, rewriteFact?.context),
  ];
}

export function formatLocalDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatLocalDateTime(value: Date) {
  const hours = String(value.getHours()).padStart(2, "0");
  const minutes = String(value.getMinutes()).padStart(2, "0");
  const seconds = String(value.getSeconds()).padStart(2, "0");
  const offsetMinutes = -value.getTimezoneOffset();
  const offsetSign = offsetMinutes >= 0 ? "+" : "-";
  const offsetHours = String(Math.floor(Math.abs(offsetMinutes) / 60)).padStart(
    2,
    "0",
  );
  const offsetRemainder = String(Math.abs(offsetMinutes) % 60).padStart(2, "0");
  return `${formatLocalDate(value)} ${hours}:${minutes}:${seconds} UTC${offsetSign}${offsetHours}:${offsetRemainder}`;
}

function section(
  title: string,
  facts: Array<Fact | ComparedFact>,
  locale: ReportLocale,
  added = false,
) {
  const t = labels[locale];
  const lines = facts.length
    ? facts.flatMap((fact) => factLine(fact, locale, added))
    : [`- ${t.none}`];
  return [`## ${title}`, "", ...lines, ""].join("\n");
}

export function buildMarkdownReport(
  comparison: FactComparison,
  locale: ReportLocale,
  options:
    | Date
    | {
        generatedAt?: Date;
        appVersion?: string;
        commitSha?: string;
      } = {},
) {
  const t = labels[locale];
  const normalizedOptions = options instanceof Date ? { generatedAt: options } : options;
  const generatedAt = normalizedOptions.generatedAt ?? new Date();
  const appVersion = normalizedOptions.appVersion?.trim() || "unknown";
  const commitSha = normalizedOptions.commitSha?.trim() || "local";
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
  const requiredSections = comparison.requiredCount
    ? [
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
      ]
    : [];

  return [
    `# ${t.title}`,
    "",
    `- **${t.generated}:** ${formatLocalDateTime(generatedAt)}`,
    `- **${t.version}:** v${appVersion}`,
    `- **${t.commit}:** ${inlineCode(commitSha)}`,
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
    ...requiredSections,
    section(t.automaticReview, review, locale),
    section(t.automaticPreserved, preserved, locale),
    section(t.automaticAdded, comparison.addedFacts, locale, true),
    `> ${t.disclaimer}`,
    "",
  ].join("\n");
}
