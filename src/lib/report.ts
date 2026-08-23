import type { ComparedFact, Fact, FactComparison, FactKind } from "./facts";
import {
  getFixList,
  getReviewOutcome,
  normalizeReviewRecord,
  reviewDecisionKey,
  summarizeReviews,
  type ReviewDecision,
  type ReviewDecisions,
  type ReviewRecord,
  type ReviewRecordInput,
  type ReviewRecords,
  type ReviewScope,
} from "./review.ts";

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
    manualSummary: string;
    manualTotal: string;
    manualStatus: string;
    manualDraft: string;
    manualNeedsChanges: string;
    manualAcceptable: string;
    manualPending: string;
    manualConfirmed: string;
    manualAccepted: string;
    manualIgnored: string;
    manualDecision: string;
    manualNote: string;
    reviewerNote: string;
    expectedFix: string;
    unspecified: string;
    fixList: string;
    scopeSource: string;
    scopeRequired: string;
    scopeAdded: string;
    requiredCount: string;
    requiredCheckable: string;
    requiredMissing: string;
    requiredNotInSource: string;
    requiredRetention: string;
    preserved: string;
    review: string;
    added: string;
    retention: string;
    retentionNote: string;
    none: string;
    changed: string;
    missing: string;
    invalid: string;
    notInSource: string;
    notInSourceAdded: string;
    newFact: string;
    newInvalidFact: string;
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
    manualSummary: "人工审阅摘要",
    manualTotal: "待审阅项目",
    manualStatus: "报告状态",
    manualDraft: "草稿（仍有待处理项）",
    manualNeedsChanges: "需要修改",
    manualAcceptable: "审阅完成 · 无确认问题",
    manualPending: "待处理",
    manualConfirmed: "确认需处理",
    manualAccepted: "改写可接受",
    manualIgnored: "不纳入本次审阅",
    manualDecision: "人工结论",
    manualNote:
      "人工结论独立于自动统计，不会自动持久化；主动导出的报告或会话文件可能包含人工结论、备注和期望修复。",
    reviewerNote: "备注",
    expectedFix: "期望修复",
    unspecified: "未指定",
    fixList: "修复清单",
    scopeSource: "自动事实",
    scopeRequired: "必须保留",
    scopeAdded: "改写新增",
    requiredCount: "必保项目",
    requiredCheckable: "可核对",
    requiredMissing: "改写缺失",
    requiredNotInSource: "原文未找到",
    requiredRetention: "必保保留率",
    preserved: "已保留",
    review: "需确认",
    added: "改写新增",
    retention: "已提取事实保留率",
    retentionNote:
      "保留率只统计已提取的硬事实，不代表事实真假、抽取覆盖率或全文语义完整。",
    none: "无",
    changed: "可能改成",
    missing: "改写稿中未找到对应事实",
    invalid: "可识别为日期或时间，但数值无效",
    notInSource: "原文中未找到，请检查这项输入",
    notInSourceAdded: "原文中未找到；仅在改写稿出现，不算作已保留",
    newFact: "只在改写稿中出现",
    newInvalidFact: "只在改写稿中出现，但该日期或时间值无效",
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
    manualSummary: "Human review summary",
    manualTotal: "Reviewable items",
    manualStatus: "Report status",
    manualDraft: "Draft (pending items remain)",
    manualNeedsChanges: "Needs changes",
    manualAcceptable: "Review complete · no confirmed issues",
    manualPending: "Pending",
    manualConfirmed: "Confirmed issue",
    manualAccepted: "Acceptable change",
    manualIgnored: "Out of this review",
    manualDecision: "Human decision",
    manualNote:
      "Human review is separate from automatic metrics and is not persisted automatically; reports or session files you explicitly export may contain decisions, notes, and expected fixes.",
    reviewerNote: "Note",
    expectedFix: "Expected fix",
    unspecified: "Not specified",
    fixList: "Fix list",
    scopeSource: "Automatic fact",
    scopeRequired: "Must-preserve",
    scopeAdded: "New in rewrite",
    requiredCount: "Required items",
    requiredCheckable: "Checkable",
    requiredMissing: "Missing from rewrite",
    requiredNotInSource: "Not found in source",
    requiredRetention: "Required retention",
    preserved: "Preserved",
    review: "Needs review",
    added: "New in rewrite",
    retention: "Extracted-fact retention",
    retentionNote:
      "Retention includes extracted exact facts only; it does not represent truth, extraction coverage, or full-document semantic completeness.",
    none: "None",
    changed: "Possibly changed to",
    missing: "No corresponding fact found in the rewrite",
    invalid: "Recognizable date or time found, but its value is invalid",
    notInSource: "Not found in the source; check this input",
    notInSourceAdded:
      "Not found in the source; appearing only in the rewrite is not preservation",
    newFact: "Appears only in the rewrite",
    newInvalidFact:
      "Appears only in the rewrite, but this date or time value is invalid",
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

function safeMarkdownText(value: string) {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/\\/gu, "\\\\")
    .replace(/([`*_[\]{}()#+\-.!|])/gu, "\\$1")
    .replace(/\t/gu, "    ")
    .replace(/\n/gu, "<br>");
}

function recordAt(records: ReviewRecordInput, key: string) {
  const value = (
    records as Partial<Record<string, ReviewRecord | ReviewDecision>>
  )[key];
  return normalizeReviewRecord(
    typeof value === "string" ? { decision: value } : value,
  );
}

function factSides(fact: Fact | ComparedFact, added: boolean) {
  const compared = fact as ComparedFact;
  return {
    sourceFact: added
      ? undefined
      : compared.sourceMatch ??
        (compared.reviewReason === "not-in-source" ? undefined : fact),
    rewriteFact: added
      ? fact
      : compared.matched ?? compared.possibleMatch,
  };
}

function findingNote(
  fact: Fact | ComparedFact,
  locale: ReportLocale,
  added: boolean,
) {
  const t = labels[locale];
  const compared = fact as ComparedFact;
  if (added) return fact.valid === false ? t.newInvalidFact : t.newFact;
  if (compared.status !== "review") return t.preserved;
  if (compared.reviewReason === "invalid") return t.invalid;
  if (compared.reviewReason === "not-in-source") {
    return compared.matched ? t.notInSourceAdded : t.notInSource;
  }
  if (compared.possibleMatch) {
    return `${t.changed} ${inlineCode(compared.possibleMatch.raw)}`;
  }
  return t.missing;
}

function factLine(
  fact: Fact | ComparedFact,
  locale: ReportLocale,
  options: {
    added?: boolean;
    scope?: ReviewScope;
    reviewRecords?: ReviewRecordInput;
  } = {},
) {
  const t = labels[locale];
  const { added = false, scope, reviewRecords = {} } = options;
  const compared = fact as ComparedFact;
  const note = findingNote(fact, locale, added);
  const { sourceFact, rewriteFact } = factSides(fact, added);
  const detail = (label: string, value?: string) =>
    `    - **${label}:** ${value ? inlineCode(value) : t.notFound}`;
  const annotation = (label: string, value?: string, fallback = t.none) =>
    `    - **${label}:** ${value ? safeMarkdownText(value) : fallback}`;
  const reviewable = added || (!added && compared.status === "review");
  const record =
    reviewable && scope
      ? recordAt(reviewRecords, reviewDecisionKey(scope, fact))
      : undefined;
  const decision = record?.decision;
  const decisionLabel = decision
    ? {
        confirmed: t.manualConfirmed,
        accepted: t.manualAccepted,
        ignored: t.manualIgnored,
      }[decision]
    : t.manualPending;

  return [
    `- **${t.kinds[fact.kind]}** ${inlineCode(fact.raw)} — ${note}`,
    ...(reviewable ? [detail(t.manualDecision, decisionLabel)] : []),
    ...(reviewable
      ? [
          annotation(t.reviewerNote, record?.note),
          annotation(t.expectedFix, record?.expectedFix, t.unspecified),
        ]
      : []),
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
  options: {
    added?: boolean;
    scope?: ReviewScope;
    reviewRecords?: ReviewRecordInput;
  } = {},
) {
  const t = labels[locale];
  const lines = facts.length
    ? facts.flatMap((fact) => factLine(fact, locale, options))
    : [`- ${t.none}`];
  return [`## ${title}`, "", ...lines, ""].join("\n");
}

export function buildFixListMarkdown(
  comparison: FactComparison,
  locale: ReportLocale,
  records: ReviewRecordInput,
) {
  const t = labels[locale];
  const scopeLabels: Record<ReviewScope, string> = {
    source: t.scopeSource,
    required: t.scopeRequired,
    added: t.scopeAdded,
  };
  const fixes = getFixList(comparison, records);
  const lines = fixes.length
    ? fixes.flatMap(({ fact, scope, record }) => {
        const added = scope === "added";
        const { sourceFact, rewriteFact } = factSides(fact, added);
        const detail = (label: string, value?: string) =>
          `    - **${label}:** ${value ? inlineCode(value) : t.notFound}`;
        const annotation = (
          label: string,
          value?: string,
          fallback = t.none,
        ) => `    - **${label}:** ${value ? safeMarkdownText(value) : fallback}`;
        return [
          `- [ ] **${scopeLabels[scope]} · ${t.kinds[fact.kind]}** ${inlineCode(fact.raw)} — ${findingNote(fact, locale, added)}`,
          annotation(t.expectedFix, record.expectedFix, t.unspecified),
          annotation(t.reviewerNote, record.note),
          detail(t.sourceValue, sourceFact?.raw),
          detail(t.rewriteValue, rewriteFact?.raw),
          detail(t.sourceContext, sourceFact?.context),
          detail(t.rewriteContext, rewriteFact?.context),
        ];
      })
    : [`- ${t.none}`];
  return [`## ${t.fixList}`, "", ...lines, ""].join("\n");
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
        reviewDecisions?: ReviewDecisions;
        reviewRecords?: ReviewRecords;
      } = {},
) {
  const t = labels[locale];
  const normalizedOptions = options instanceof Date ? { generatedAt: options } : options;
  const generatedAt = normalizedOptions.generatedAt ?? new Date();
  const appVersion = normalizedOptions.appVersion?.trim() || "unknown";
  const commitSha = normalizedOptions.commitSha?.trim() || "local";
  const reviewRecords: ReviewRecordInput =
    normalizedOptions.reviewRecords ?? normalizedOptions.reviewDecisions ?? {};
  const manual = summarizeReviews(comparison, reviewRecords);
  const manualOutcome = getReviewOutcome(manual);
  const manualStatus =
    manualOutcome === "draft"
      ? t.manualDraft
      : manualOutcome === "needs-changes"
        ? t.manualNeedsChanges
        : t.manualAcceptable;
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
        section(t.requiredChecks, comparison.requiredFacts, locale, {
          scope: "required",
          reviewRecords,
        }),
      ]
    : [];
  const fixListSection = manual.confirmed
    ? [buildFixListMarkdown(comparison, locale, reviewRecords)]
    : [];
  const manualSection = manual.total
    ? [
        `## ${t.manualSummary}`,
        "",
        `| ${t.metric} | ${t.value} |`,
        "| --- | --- |",
        `| ${t.manualStatus} | ${manualStatus} |`,
        `| ${t.manualTotal} | ${manual.total} |`,
        `| ${t.manualPending} | ${manual.pending} |`,
        `| ${t.manualConfirmed} | ${manual.confirmed} |`,
        `| ${t.manualAccepted} | ${manual.accepted} |`,
        `| ${t.manualIgnored} | ${manual.ignored} |`,
        "",
        `> ${t.manualNote}`,
        "",
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
    `> ${t.retentionNote}`,
    "",
    ...requiredSections,
    ...manualSection,
    ...fixListSection,
    section(t.automaticReview, review, locale, {
      scope: "source",
      reviewRecords,
    }),
    section(t.automaticPreserved, preserved, locale),
    section(t.automaticAdded, comparison.addedFacts, locale, {
      added: true,
      scope: "added",
      reviewRecords,
    }),
    `> ${t.disclaimer}`,
    "",
  ].join("\n");
}
