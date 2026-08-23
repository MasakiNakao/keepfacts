import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  compareFacts,
  countRequiredNotInSource,
  type ComparedFact,
  type Fact,
  type FactKind,
} from "./lib/facts";
import {
  buildFixListMarkdown,
  buildMarkdownReport,
  formatLocalDate,
} from "./lib/report";
import {
  getKeepFactsInputLimitViolation,
  KEEPFACTS_MAX_REQUIRED_LENGTH,
  KEEPFACTS_MAX_TEXT_LENGTH,
  type KeepFactsInputLimitViolation,
} from "./lib/input-limits";
import {
  getFixList,
  getNextPendingReviewKey,
  getReviewItems,
  getReviewOutcome,
  getReviewOrder,
  migrateReviewRecords,
  orderReviewQueue,
  reviewDecisionKey,
  summarizeReviews,
  updateReviewRecord,
  type ReviewDecision,
  type ReviewRecord,
  type ReviewRecords,
  type ReviewScope,
} from "./lib/review";
import {
  KEEPFACTS_SESSION_MAX_BYTES,
  KEEPFACTS_SESSION_SCHEMA_VERSION,
  parseKeepFactsSession,
  reconcileKeepFactsReviewRecords,
  serializeKeepFactsSession,
  type KeepFactsSessionV1,
} from "./lib/session";
import { APP_COMMIT_SHA, APP_VERSION } from "./version";
import type {
  CompareInput,
  CompareWorkerRequest,
  CompareWorkerResponse,
} from "./workers/compare.protocol";

type Locale = "zh" | "en";
type Filter = "all" | "actionable" | "review" | "preserved" | "added";
const RESULT_PAGE_SIZE = 50;
const WORKER_TIMEOUT_MS = 30_000;
const SOURCE_URL = "https://github.com/MasakiNakao/keepfacts";
const PRIVACY_URL = `${SOURCE_URL}/blob/main/SECURITY.md`;
const FEEDBACK_URL = `${SOURCE_URL}/issues/new?template=bug_report.yml`;

const examples = {
  zh: {
    source:
      "星河工作室将在2026年9月15日发布 v1.2.0。首批预算为 ¥30,000，计划邀请100名测试用户，目标转化率为12.5%。问题请发送至 hello@example.com，项目说明见 https://example.com/launch。",
    revision:
      "星河工作室计划在2026年9月18日发布 v1.2.0。首批预算为3万元，计划邀请80名测试用户，目标转化率为12.5%。如有问题，请发送邮件至 hello@example.com。",
    required: "星河工作室",
  },
  en: {
    source:
      "Northstar Studio will release v1.2.0 on September 15, 2026. The initial budget is $30,000, with 100 test users and a 12.5% conversion target. Contact hello@example.com or visit https://example.com/launch.",
    revision:
      "Northstar Studio plans to release v1.2.0 on September 18, 2026. The initial budget is $30,000, with 80 test users and a 12.5% conversion target. Questions can be sent to hello@example.com.",
    required: "Northstar Studio",
  },
};

function detectInitialLocale(): Locale {
  if (typeof window !== "undefined") {
    const requested = new URLSearchParams(window.location.search).get("lang");
    if (requested === "zh" || requested === "en") return requested;
  }
  if (typeof navigator !== "undefined") {
    const preferred = navigator.languages?.[0] ?? navigator.language;
    return preferred?.toLowerCase().startsWith("zh") ? "zh" : "en";
  }
  return "zh";
}

const copy = {
  zh: {
    skipToChecker: "跳到核对区",
    privacy: "本地处理 · 文本不会上传",
    mobilePrivacy: "本地处理 · 文本不会上传",
    eyebrow: "AI 改写硬事实保留检查",
    titleA: "措辞可以改变，",
    titleB: "事实不该走样。",
    intro:
      "在接受 AI 改写、总结或翻译前，对照可信原文找出被改变、遗漏或新增的日期、金额、数量和链接；它不查证事实真假。",
    checkOwnText: "核对我的文本",
    viewExample: "30 秒看它抓出 3 处错误",
    exampleProof: "示例中的三处变化",
    proofDate: "9月15日 → 9月18日",
    proofUsers: "100人 → 80人",
    proofLink: "发布链接缺失",
    trustLinks: "源码、隐私与反馈",
    sourceCode: "查看源码",
    privacyBoundaries: "隐私与边界",
    reportDetectionIssue: "反馈漏检 / 误报",
    feedbackSafety: "反馈时请勿提交敏感、私人或机密文本。",
    exampleMode: "示例模式",
    ownTextMode: "我的文本",
    exampleModeHint: "当前显示示例内容和示例结果。",
    ownTextModeHint: "粘贴可信原文和需要审核的新稿",
    useOwnText: "使用我的文本",
    localeScope: "当前针对常见中英文数字、日期、币种和单位格式优化。",
    source: "原文",
    sourceHint: "需要保留事实的文本",
    revision: "改写稿",
    revisionHint: "AI 改写、总结或翻译后的文本",
    required: "必须保留的内容",
    requiredHint: "可选：每行填写一个名称、术语或关键短语",
    requiredPlaceholder: "例如：品牌全称\n例如：不得更改的术语",
    chars: "字符",
    placeholderSource: "在这里粘贴原文……",
    placeholderRevision: "在这里粘贴改写稿……",
    loadExample: "载入示例",
    clear: "清空",
    compare: "对照两版",
    comparing: "正在核对…",
    compareFailed: "核对未完成，请重试。",
    compareTimedOut: "核对超过 30 秒，已停止。请重试。",
    compareLimitExceeded:
      "每侧最多核对 1,000 项已提取事实，必保项最多 1,000 条。请拆分文本后重试。",
    inputLimitFallback:
      "输入超过可处理上限。请缩短原文、改写稿或必保项后重试。",
    inputSourceTooLong: (maximum: number) =>
      `原文最多 ${maximum.toLocaleString("en-US")} 个字符，请缩短后重试。`,
    inputRevisionTooLong: (maximum: number) =>
      `改写稿最多 ${maximum.toLocaleString("en-US")} 个字符，请缩短后重试。`,
    inputRequiredTooLong: (maximum: number) =>
      `必须保留的内容合计最多 ${maximum.toLocaleString("en-US")} 个字符，请缩短后重试。`,
    inputRequiredItemsTooMany: (maximum: number) =>
      `必须保留的内容最多 ${maximum.toLocaleString("en-US")} 条，请删除部分条目后重试。`,
    inputRequiredItemTooLong: (line: number, maximum: number) =>
      `必须保留的内容第 ${line.toLocaleString("en-US")} 行最多 ${maximum.toLocaleString("en-US")} 个字符，请缩短后重试。`,
    previousResultPreserved: "上次结果已保留。",
    sessionInputLimit: (detail: string) =>
      `无法导出会话：${detail} 当前内容未更改。`,
    compareHint: "点击后生成一份固定结果；修改内容后请重新核对",
    resultsOutdated: "输入内容已更改，以下仍是上次核对结果。请重新核对后再导出报告。",
    resultTitle: "核对结果",
    resultIntro: "先处理需要人工确认的项目，再判断是否接受这次改写。",
    resultReady: (automatic: number, review: number, added: number, required: number) =>
      `核对完成：自动事实 ${automatic} 项，需确认 ${review} 项，新增 ${added} 项，必须保留异常 ${required} 项。`,
    copyReport: "复制报告",
    downloadReport: "下载 Markdown",
    copied: "报告已复制",
    copyFailed: "复制失败，请使用下载功能",
    downloaded: "报告已下载",
    scanned: "已提取硬事实",
    preserved: "已保留",
    review: "需确认",
    reviewItems: "人工审阅",
    issuesAndAdditions: "异常与新增",
    added: "改写新增",
    score: "已提取事实保留率",
    retentionDisclaimer: "只统计规则识别到的硬事实，不代表全文事实正确。",
    requiredResults: "必须保留检查",
    requiredConfigured: "已配置",
    requiredCheckable: "可核对",
    requiredMissing: "改写缺失",
    requiredNotInSource: "原文未找到",
    requiredRetention: "必保保留率",
    requiredInputWarning: (count: number) =>
      `${count} 条内容未在原文中找到，不纳入必保保留率。`,
    all: "全部",
    automaticDetails: "自动事实明细",
    automaticDetailsHint: "以下筛选只作用于自动提取的事实。",
    visibleItems: (label: string, count: number) =>
      `${label}筛选：当前显示 ${count} 项自动事实。`,
    manualReview: "人工审阅进度",
    manualReviewHint:
      "三类异常集中处理；人工记录不会改变机器统计，重新核对时只保留证据仍可对应的记录。",
    manualTotal: "待审阅项目",
    manualPending: "待处理",
    manualConfirmed: "确认需处理",
    manualAccepted: "改写合理",
    manualIgnored: "已忽略",
    reviewDraft: "审阅草稿",
    reviewNeedsChanges: "需要修改",
    reviewAcceptable: "审阅完成 · 无确认问题",
    reviewNoFindings: "未发现需人工审阅项",
    reviewOutdated: "结果已过期",
    reviewOutcomeLabel: "当前审阅状态",
    resetWorkConfirm: (count: number, includesText: boolean) => {
      if (includesText && count) {
        return `当前文本和已有 ${count} 条人工审阅记录将被清除，是否继续？`;
      }
      if (includesText) {
        return "当前输入的原文、改写稿或必保内容将被清除，是否继续？";
      }
      return `已有 ${count} 条人工审阅记录。继续操作将清除这些记录，是否继续？`;
    },
    manualDecision: "人工结论",
    manualDecisionGroup: "选择人工结论",
    reviewQueue: "人工审阅队列",
    reviewToolbar: "审阅与导出操作",
    scopeSource: "自动事实",
    scopeRequired: "必保项",
    scopeAdded: "改写新增",
    nextPending: "下一条待处理",
    copyFixList: "复制修复清单",
    fixListCopied: "修复清单已复制",
    fixListEmpty: "尚无确认需处理的项目",
    note: "审阅备注",
    expectedFix: "期望修复",
    optional: "可选",
    notePlaceholder: "补充判断依据或交接说明（最多 500 字）",
    expectedFixPlaceholder: "说明希望如何修改新稿（最多 500 字）",
    reviewAnnotationHint: "选择人工结论后，可补充备注和期望修复。",
    machineDetailsNote: "以下为机器明细；人工结论请在上方统一队列处理。",
    remainingPending: (count: number) => `还剩 ${count} 项待处理。`,
    movedToPending: (index: number, scope: string, raw: string) =>
      `已移动到第 ${index} 条待处理：${scope} ${raw}。`,
    migrationResult: (
      retained: number,
      reset: number,
      dropped: number,
      ambiguous: number,
    ) =>
      `重新核对完成：保留 ${retained} 条结论，${reset} 条因证据变化回到待处理${dropped ? `，${dropped} 条旧记录未迁移${ambiguous ? `（其中 ${ambiguous} 条匹配不明确）` : ""}` : ""}。`,
    migrationDropConfirm: (dropped: number, ambiguous: number) =>
      `本次重新核对有 ${dropped} 条旧人工记录无法安全迁移${ambiguous ? `，其中 ${ambiguous} 条存在多个可能对应项` : ""}。继续将采用新结果并移除这些旧记录；取消可保留上次结果和全部人工记录。是否继续？`,
    migrationCancelled: "已取消采用新结果；上次结果和人工记录仍保留。",
    exportSession: "导出会话",
    importSession: "导入会话",
    sessionPrivacy:
      "会话文件包含完整原文、新稿、必保项和人工记录，是未加密明文；KeepFacts 不会自动保存或上传。",
    exportSessionConfirm:
      "导出的会话文件包含完整文本和人工记录，且未加密。拿到文件的人可以直接读取。是否继续导出？",
    importSessionConfirm:
      "导入将替换当前文本、结果和人工记录。已先在本地完成校验，是否继续？",
    sessionExported: "会话文件已导出",
    sessionExportFailed: "无法导出会话文件；当前内容未更改。",
    sessionImported: (restored: number, dropped: number) =>
      `会话已导入：恢复 ${restored} 条人工记录${dropped ? `，${dropped} 条未匹配` : ""}。`,
    sessionImporting: "正在本地校验会话…",
    sessionImportFailed: "无法导入该会话文件；当前内容未更改。",
    previousPage: "上一页",
    nextPage: "下一页",
    pageStatus: (page: number, pages: number, total: number) =>
      `第 ${page}/${pages} 页，共 ${total} 项`,
    emptyNoFactsTitle: "未识别到可核对的硬事实",
    emptyNoFactsBody:
      "当前文本中未识别到日期、金额、数量、单位、邮箱或链接等硬事实。请调整文本后重新核对，或载入示例。",
    emptyFilterTitle: "当前筛选没有项目",
    emptyFilterBody: "此筛选下没有可显示的自动事实，请选择其他筛选项。",
    preservedNote: "改写稿中找到等价事实",
    possibleChange: "可能改成了",
    missingNote: "改写稿中未找到对应事实",
    invalidNote: "可识别为日期或时间，但数值无效",
    notInSourceNote: "原文中未找到，无法作为必须保留项核对",
    notInSourceAddedNote: "原文中未找到；仅在改写稿出现，不算作已保留",
    addedNote: "只在改写稿中出现",
    sourceContext: "原文语境",
    revisionContext: "改写语境",
    comparisonContext: "查看原文与改写语境",
    disclaimer:
      "KeepFacts 只比较两版文本中可精确提取的硬事实，不联网查证事实真假，也不判断全文语义。黄色项目需要人工确认。",
    footer: "确定性规则 · 无追踪代码",
    homeLabel: "KeepFacts 首页",
    documentTitle: "KeepFacts — 措辞可以改变，事实不该走样",
    changeLanguage: "English",
  },
  en: {
    skipToChecker: "Skip to comparison",
    privacy: "Local only · Text is not uploaded",
    mobilePrivacy: "Local only · Text is not uploaded",
    eyebrow: "AI rewrite exact-fact preservation",
    titleA: "Change the wording,",
    titleB: "not the facts.",
    intro:
      "Before accepting an AI rewrite, summary, or translation, compare it with a trusted source to catch changed, missing, or new exact facts. KeepFacts does not verify whether claims are true.",
    checkOwnText: "Check my text",
    viewExample: "See 3 errors in 30 seconds",
    exampleProof: "Three changes in the example",
    proofDate: "Sep 15 → Sep 18",
    proofUsers: "100 users → 80 users",
    proofLink: "Launch link missing",
    trustLinks: "Source, privacy, and feedback",
    sourceCode: "View source",
    privacyBoundaries: "Privacy and boundaries",
    reportDetectionIssue: "Report a missed fact / false positive",
    feedbackSafety:
      "Do not include sensitive, private, or confidential text in feedback.",
    exampleMode: "Example mode",
    ownTextMode: "My text",
    exampleModeHint: "You are viewing example content and results",
    ownTextModeHint: "Paste a trusted source and the new draft to review",
    useOwnText: "Use my text",
    localeScope: "Currently optimized for common Chinese and English number, date, currency, and unit formats.",
    source: "Source",
    sourceHint: "The text whose facts must survive",
    revision: "Rewrite",
    revisionHint: "AI rewrite, summary, or translation",
    required: "Must-preserve content",
    requiredHint: "Optional: one name, term, or key phrase per line",
    requiredPlaceholder: "Example: Full brand name\nExample: Required terminology",
    chars: "characters",
    placeholderSource: "Paste the source text here…",
    placeholderRevision: "Paste the rewritten text here…",
    loadExample: "Load example",
    clear: "Clear",
    compare: "Compare both texts",
    comparing: "Checking…",
    compareFailed: "The check did not finish. Try again.",
    compareTimedOut: "The check exceeded 30 seconds and was stopped. Try again.",
    compareLimitExceeded:
      "Each side supports up to 1,000 extracted facts and 1,000 must-preserve items. Split the text and try again.",
    inputLimitFallback:
      "The input exceeds the processing limit. Shorten the source, rewrite, or must-preserve content and try again.",
    inputSourceTooLong: (maximum: number) =>
      `Source supports up to ${maximum.toLocaleString("en-US")} characters. Shorten it and try again.`,
    inputRevisionTooLong: (maximum: number) =>
      `Rewrite supports up to ${maximum.toLocaleString("en-US")} characters. Shorten it and try again.`,
    inputRequiredTooLong: (maximum: number) =>
      `Must-preserve content supports up to ${maximum.toLocaleString("en-US")} characters in total. Shorten it and try again.`,
    inputRequiredItemsTooMany: (maximum: number) =>
      `Must-preserve content supports up to ${maximum.toLocaleString("en-US")} items. Remove some items and try again.`,
    inputRequiredItemTooLong: (line: number, maximum: number) =>
      `Line ${line.toLocaleString("en-US")} of must-preserve content supports up to ${maximum.toLocaleString("en-US")} characters. Shorten it and try again.`,
    previousResultPreserved: "The previous result is unchanged.",
    sessionInputLimit: (detail: string) =>
      `The session cannot be exported: ${detail} Current work is unchanged.`,
    compareHint: "Creates a fixed result. Recheck after editing either text.",
    resultsOutdated:
      "The inputs changed. These are still the previous results; recheck before exporting.",
    resultTitle: "Comparison results",
    resultIntro: "Review flagged items before accepting the rewrite.",
    resultReady: (automatic: number, review: number, added: number, required: number) =>
      `Check complete: ${automatic} automatic facts, ${review} for review, ${added} new, and ${required} must-preserve issues.`,
    copyReport: "Copy report",
    downloadReport: "Download Markdown",
    copied: "Report copied",
    copyFailed: "Copy failed. Please download the report instead.",
    downloaded: "Report downloaded",
    scanned: "Extracted exact facts",
    preserved: "Preserved",
    review: "Review",
    reviewItems: "Human review",
    issuesAndAdditions: "Issues and additions",
    added: "New in rewrite",
    score: "Extracted-fact retention",
    retentionDisclaimer:
      "Retention includes extracted exact facts only; it does not represent full-document factual accuracy or semantic completeness.",
    requiredResults: "Must-preserve checks",
    requiredConfigured: "Configured",
    requiredCheckable: "Checkable",
    requiredMissing: "Missing in rewrite",
    requiredNotInSource: "Not in source",
    requiredRetention: "Required retention",
    requiredInputWarning: (count: number) =>
      `${count} item${count === 1 ? "" : "s"} not found in the source and excluded from required retention.`,
    all: "All",
    automaticDetails: "Automatic fact details",
    automaticDetailsHint: "These filters apply only to automatically extracted facts.",
    visibleItems: (label: string, count: number) =>
      `${label} filter: showing ${count} automatic fact${count === 1 ? "" : "s"}.`,
    manualReview: "Human review progress",
    manualReviewHint:
      "Review all three finding scopes in one queue. Human records never change machine metrics and migrate only when evidence can be matched safely.",
    manualTotal: "Reviewable items",
    manualPending: "Pending",
    manualConfirmed: "Confirmed issue",
    manualAccepted: "Acceptable rewrite",
    manualIgnored: "Ignored",
    reviewDraft: "Review draft",
    reviewNeedsChanges: "Needs changes",
    reviewAcceptable: "Review complete · no confirmed issues",
    reviewNoFindings: "No findings require human review",
    reviewOutdated: "Results outdated",
    reviewOutcomeLabel: "Current review status",
    resetWorkConfirm: (count: number, includesText: boolean) => {
      const records = `${count} human review record${count === 1 ? "" : "s"}`;
      if (includesText && count) {
        return `Your current text and ${records} will be cleared. Continue?`;
      }
      if (includesText) {
        return "Your current source, rewrite, or must-preserve content will be cleared. Continue?";
      }
      return `${records} will be cleared if you continue. Continue?`;
    },
    manualDecision: "Human decision",
    manualDecisionGroup: "Choose a human decision",
    reviewQueue: "Human review queue",
    reviewToolbar: "Review and export actions",
    scopeSource: "Automatic fact",
    scopeRequired: "Must-preserve",
    scopeAdded: "New in rewrite",
    nextPending: "Next pending",
    copyFixList: "Copy fix list",
    fixListCopied: "Fix list copied",
    fixListEmpty: "No confirmed issues yet",
    note: "Review note",
    expectedFix: "Expected fix",
    optional: "Optional",
    notePlaceholder: "Add reasoning or handoff context (500 characters max)",
    expectedFixPlaceholder: "Describe how the rewrite should be corrected (500 characters max)",
    reviewAnnotationHint: "Choose a human decision to add a note or expected fix.",
    machineDetailsNote: "Machine details only; record human decisions in the unified queue above.",
    remainingPending: (count: number) =>
      `${count} pending item${count === 1 ? "" : "s"} remain.`,
    movedToPending: (index: number, scope: string, raw: string) =>
      `Moved to pending item ${index}: ${scope} ${raw}.`,
    migrationResult: (
      retained: number,
      reset: number,
      dropped: number,
      ambiguous: number,
    ) =>
      `Recheck complete: ${retained} decision${retained === 1 ? "" : "s"} retained; ${reset} reset because the evidence changed${dropped ? `; ${dropped} old record${dropped === 1 ? " was" : "s were"} not migrated${ambiguous ? ` (${ambiguous} ambiguous)` : ""}` : ""}.`,
    migrationDropConfirm: (dropped: number, ambiguous: number) =>
      `${dropped} old human review record${dropped === 1 ? " cannot" : "s cannot"} be migrated safely${ambiguous ? `; ${ambiguous} ${ambiguous === 1 ? "has" : "have"} multiple possible matches` : ""}. Continuing adopts the new result and removes those old records. Cancel to keep the previous result and every review record. Continue?`,
    migrationCancelled:
      "The new result was not adopted. The previous result and review records are unchanged.",
    exportSession: "Export session",
    importSession: "Import session",
    sessionPrivacy:
      "Session files contain the full source, rewrite, must-preserve content, and human records as unencrypted text. KeepFacts never autosaves or uploads them.",
    exportSessionConfirm:
      "The session file contains the full text and human records and is not encrypted. Anyone with the file can read it. Continue exporting?",
    importSessionConfirm:
      "Importing replaces the current text, results, and human records. The file has been validated locally. Continue?",
    sessionExported: "Session file exported",
    sessionExportFailed: "The session file could not be exported. Current work is unchanged.",
    sessionImported: (restored: number, dropped: number) =>
      `Session imported: ${restored} human record${restored === 1 ? "" : "s"} restored${dropped ? `; ${dropped} did not match` : ""}.`,
    sessionImporting: "Validating the session locally…",
    sessionImportFailed: "This session file could not be imported. Current work was not changed.",
    previousPage: "Previous",
    nextPage: "Next",
    pageStatus: (page: number, pages: number, total: number) =>
      `Page ${page} of ${pages}, ${total} items`,
    emptyNoFactsTitle: "No comparable exact facts detected",
    emptyNoFactsBody:
      "No dates, amounts, quantities, units, emails, or links were detected. Edit the text and recheck, or load the example.",
    emptyFilterTitle: "No items in this filter",
    emptyFilterBody: "This filter has no automatic facts to show. Choose another filter.",
    preservedNote: "Equivalent fact found in the rewrite",
    possibleChange: "Possibly changed to",
    missingNote: "No corresponding fact found in the rewrite",
    invalidNote: "Recognizable date or time found, but its value is invalid",
    notInSourceNote: "Not found in the source, so it cannot be checked",
    notInSourceAddedNote:
      "Not found in the source; appearing only in the rewrite is not preservation",
    addedNote: "Appears only in the rewrite",
    sourceContext: "Source context",
    revisionContext: "Rewrite context",
    comparisonContext: "View source and rewrite context",
    disclaimer:
      "KeepFacts compares exact, extractable facts between two texts. It does not verify truth or judge the full meaning. Yellow items need human review.",
    footer: "Deterministic rules · No tracking",
    homeLabel: "KeepFacts home",
    documentTitle: "KeepFacts — Change the wording, not the facts",
    changeLanguage: "中文",
  },
};

const kindLabels: Record<Locale, Record<FactKind, string>> = {
  zh: {
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
  en: {
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
};

function ResultCard({
  fact,
  locale,
  added = false,
  reviewScope,
  reviewRecord,
  onReviewRecordChange,
  reviewDisabled = false,
  queuePosition,
  scopeLabel,
  headingRef,
}: {
  fact: Fact | ComparedFact;
  locale: Locale;
  added?: boolean;
  reviewScope?: ReviewScope;
  reviewRecord?: ReviewRecord;
  onReviewRecordChange?: (patch: Partial<ReviewRecord>) => void;
  reviewDisabled?: boolean;
  queuePosition?: number;
  scopeLabel?: string;
  headingRef?: (element: HTMLHeadingElement | null) => void;
}) {
  const t = copy[locale];
  const compared = fact as ComparedFact;
  const status = added ? "added" : compared.status;
  const notInSource = compared.reviewReason === "not-in-source";
  const sourceFact = added
    ? undefined
    : compared.sourceMatch ?? (notInSource ? undefined : fact);
  const rewriteFact = added
    ? fact
    : compared.matched ?? compared.possibleMatch;
  const showRewriteValue =
    !added && rewriteFact !== undefined && rewriteFact.raw !== sourceFact?.raw;
  const reviewable = added || status === "review";
  const decisionOptions: Array<{
    key: string;
    value?: ReviewDecision;
    label: string;
  }> = [
    { key: "pending", label: t.manualPending },
    { key: "confirmed", value: "confirmed", label: t.manualConfirmed },
    { key: "accepted", value: "accepted", label: t.manualAccepted },
    { key: "ignored", value: "ignored", label: t.manualIgnored },
  ];
  const statusText =
    status === "preserved"
      ? t.preservedNote
      : status === "added"
        ? t.addedNote
        : compared.reviewReason === "invalid"
          ? t.invalidNote
          : notInSource
            ? compared.matched
              ? t.notInSourceAddedNote
              : t.notInSourceNote
            : compared.possibleMatch
              ? t.possibleChange
              : t.missingNote;

  return (
    <article className={`result-card result-${status}`}>
      <div className="result-marker" aria-hidden="true">
        {status === "preserved" ? "✓" : status === "added" ? "+" : "!"}
      </div>
      <div className="result-content">
        {queuePosition && scopeLabel ? (
          <div className="review-card-heading">
            <span className="review-scope">{scopeLabel}</span>
            <h4 ref={headingRef} className="review-card-title" tabIndex={-1}>
              {`${queuePosition}. ${kindLabels[locale][fact.kind]} ${sourceFact?.raw ?? fact.raw}`}
            </h4>
          </div>
        ) : null}
        <div className="result-heading">
          <span className="kind-label">{kindLabels[locale][fact.kind]}</span>
          <div className="fact-comparison">
            <code className="fact-value">{sourceFact?.raw ?? fact.raw}</code>
            {showRewriteValue ? (
              <>
                <span className="comparison-arrow" aria-hidden="true">
                  →
                </span>
                <code
                  className={`fact-value ${status === "preserved" ? "fact-value-preserved-match" : "fact-value-candidate"}`}
                >
                  {rewriteFact.raw}
                </code>
              </>
            ) : null}
          </div>
        </div>
        <p className="status-note">{statusText}</p>
        {reviewable && reviewScope && onReviewRecordChange ? (
          <fieldset className="review-decision" disabled={reviewDisabled}>
            <legend className="sr-only">
              {`${queuePosition ? `${queuePosition}. ` : ""}${scopeLabel ? `${scopeLabel}, ` : ""}${t.manualDecisionGroup}: ${sourceFact?.raw ?? fact.raw}`}
            </legend>
            <div className="review-decision-heading">
              <span>{t.manualDecision}</span>
              <strong>
                {reviewRecord?.decision
                  ? decisionOptions.find(
                      (option) => option.value === reviewRecord.decision,
                    )
                      ?.label
                  : t.manualPending}
              </strong>
            </div>
            <div className="review-decision-buttons">
              {decisionOptions.map((option) => (
                <label
                  key={option.key}
                  className={
                    reviewRecord?.decision === option.value
                      ? "review-decision-option selected"
                      : "review-decision-option"
                  }
                >
                  <input
                    type="radio"
                    name={reviewDecisionKey(reviewScope, fact)}
                    value={option.key}
                    checked={reviewRecord?.decision === option.value}
                    onChange={() =>
                      onReviewRecordChange({ decision: option.value })
                    }
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
        {reviewable && reviewScope && onReviewRecordChange ? (
          reviewRecord?.decision ||
          reviewRecord?.note ||
          reviewRecord?.expectedFix ? (
            <div className="review-annotations">
              <label className="review-field">
                <span>{`${t.note} · ${t.optional}`}</span>
                <textarea
                  value={reviewRecord?.note ?? ""}
                  maxLength={500}
                  disabled={reviewDisabled}
                  placeholder={t.notePlaceholder}
                  onChange={(event) =>
                    onReviewRecordChange({ note: event.target.value })
                  }
                />
              </label>
              <label className="review-field">
                <span>{`${t.expectedFix} · ${t.optional}`}</span>
                <textarea
                  value={reviewRecord?.expectedFix ?? ""}
                  maxLength={500}
                  disabled={reviewDisabled}
                  placeholder={t.expectedFixPlaceholder}
                  onChange={(event) =>
                    onReviewRecordChange({ expectedFix: event.target.value })
                  }
                />
              </label>
            </div>
          ) : (
            <p className="review-annotation-hint">{t.reviewAnnotationHint}</p>
          )
        ) : null}
        {sourceFact?.context || rewriteFact?.context ? (
          <details className="context-details">
            <summary>{t.comparisonContext}</summary>
            {sourceFact?.context ? (
              <>
                <strong>{t.sourceContext}</strong>
                <p>{sourceFact.context}</p>
              </>
            ) : null}
            {rewriteFact?.context ? (
              <>
                <strong>{t.revisionContext}</strong>
                <p>{rewriteFact.context}</p>
              </>
            ) : null}
          </details>
        ) : null}
      </div>
    </article>
  );
}

export default function Home() {
  const [initialLocale] = useState<Locale>(detectInitialLocale);
  const initialExample = examples[initialLocale];
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [source, setSource] = useState(initialExample.source);
  const [revision, setRevision] = useState(initialExample.revision);
  const [required, setRequired] = useState(initialExample.required);
  const [checkedInput, setCheckedInput] = useState({
    source: initialExample.source,
    revision: initialExample.revision,
    required: initialExample.required,
  });
  const [comparison, setComparison] = useState(() =>
    compareFacts(
      initialExample.source,
      initialExample.revision,
      initialExample.required,
    ),
  );
  const [hasRun, setHasRun] = useState(true);
  const [isExampleMode, setIsExampleMode] = useState(true);
  const [filter, setFilter] = useState<Filter>("actionable");
  const [reviewRecords, setReviewRecords] = useState<ReviewRecords>({});
  const [reviewQueueOrder, setReviewQueueOrder] = useState(() =>
    getReviewOrder(
      compareFacts(
        initialExample.source,
        initialExample.revision,
        initialExample.required,
      ),
    ),
  );
  const [reviewPage, setReviewPage] = useState(1);
  const [reviewAnnouncement, setReviewAnnouncement] = useState("");
  const [pendingReviewFocus, setPendingReviewFocus] = useState<string>();
  const [sessionFeedback, setSessionFeedback] = useState("");
  const [sessionError, setSessionError] = useState("");
  const [importingSession, setImportingSession] = useState(false);
  const [resultPage, setResultPage] = useState(1);
  const [requiredPage, setRequiredPage] = useState(1);
  const [reportFeedback, setReportFeedback] = useState("");
  const [comparisonFeedback, setComparisonFeedback] = useState("");
  const [comparisonError, setComparisonError] = useState("");
  const [busy, setBusy] = useState(false);
  const [focusResultsAfterRun, setFocusResultsAfterRun] = useState(false);
  const [focusSourceAfterReset, setFocusSourceAfterReset] = useState(false);
  const [requiredNotInSourceCount, setRequiredNotInSourceCount] = useState(() =>
    countRequiredNotInSource(initialExample.source, initialExample.required),
  );
  const reportFeedbackTimer = useRef<number | undefined>(undefined);
  const resultsHeading = useRef<HTMLHeadingElement | null>(null);
  const sourceInput = useRef<HTMLTextAreaElement | null>(null);
  const automaticResultsHeading = useRef<HTMLHeadingElement | null>(null);
  const requiredResultsHeading = useRef<HTMLHeadingElement | null>(null);
  const reviewWorkspaceHeading = useRef<HTMLHeadingElement | null>(null);
  const localeRef = useRef(locale);
  const activeReviewKey = useRef<string | undefined>(undefined);
  const reviewItemElements = useRef(new Map<string, HTMLElement>());
  const sessionInput = useRef<HTMLInputElement | null>(null);
  const importWorkerRef = useRef<Worker | null>(null);
  const importSequence = useRef(0);
  const importTimeout = useRef<number | undefined>(undefined);
  const workerRef = useRef<Worker | null>(null);
  const comparisonTimeout = useRef<number | undefined>(undefined);
  const requestSequence = useRef(0);
  const pendingRef = useRef<
    | {
        requestId: number;
        input: CompareInput;
        worker: Worker;
        previous?: { input: CompareInput; comparison: typeof comparison };
        records: ReviewRecords;
      }
    | undefined
  >(undefined);
  const t = copy[locale];
  localeRef.current = locale;

  const inputLimitMessage = (violation: KeepFactsInputLimitViolation) => {
    switch (violation.reason) {
      case "text-length":
        return violation.field === "source"
          ? t.inputSourceTooLong(violation.maximum)
          : t.inputRevisionTooLong(violation.maximum);
      case "required-length":
        return t.inputRequiredTooLong(violation.maximum);
      case "required-items":
        return t.inputRequiredItemsTooMany(violation.maximum);
      case "required-item-length":
        return t.inputRequiredItemTooLong(
          (violation.itemIndex ?? 0) + 1,
          violation.maximum,
        );
    }
  };

  const preservePreviousResult = (message: string, hadPrevious: boolean) =>
    hadPrevious ? `${message} ${t.previousResultPreserved}` : message;

  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
    document.title = t.documentTitle;
  }, [locale, t.documentTitle]);

  useEffect(
    () => () => {
      if (reportFeedbackTimer.current !== undefined) {
        window.clearTimeout(reportFeedbackTimer.current);
      }
      workerRef.current?.terminate();
      importWorkerRef.current?.terminate();
      if (comparisonTimeout.current !== undefined) {
        window.clearTimeout(comparisonTimeout.current);
      }
      if (importTimeout.current !== undefined) {
        window.clearTimeout(importTimeout.current);
      }
    },
    [],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setRequiredNotInSourceCount(countRequiredNotInSource(source, required));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [source, required]);

  useEffect(() => {
    if (!focusResultsAfterRun || !hasRun) return;
    resultsHeading.current?.focus({ preventScroll: true });
    document
      .getElementById("results")
      ?.scrollIntoView({ behavior: "auto", block: "start" });
    setFocusResultsAfterRun(false);
  }, [focusResultsAfterRun, hasRun]);

  useEffect(() => {
    if (!focusSourceAfterReset) return;
    sourceInput.current?.focus({ preventScroll: true });
    sourceInput.current?.scrollIntoView({ behavior: "auto", block: "center" });
    setFocusSourceAfterReset(false);
  }, [focusSourceAfterReset]);

  useEffect(() => {
    if (!pendingReviewFocus) return;
    const frame = window.requestAnimationFrame(() => {
      const target = reviewItemElements.current.get(pendingReviewFocus);
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ behavior: "auto", block: "center" });
      setPendingReviewFocus(undefined);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pendingReviewFocus, reviewPage, reviewQueueOrder]);

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
  const resultsOutdated =
    hasRun &&
    (source !== checkedInput.source ||
      revision !== checkedInput.revision ||
      required !== checkedInput.required);

  const cancelPendingComparison = () => {
    requestSequence.current += 1;
    if (comparisonTimeout.current !== undefined) {
      window.clearTimeout(comparisonTimeout.current);
      comparisonTimeout.current = undefined;
    }
    workerRef.current?.terminate();
    workerRef.current = null;
    pendingRef.current = undefined;
    setBusy(false);
    setFocusResultsAfterRun(false);
    setComparisonFeedback("");
  };

  const cancelPendingImport = () => {
    importSequence.current += 1;
    importWorkerRef.current?.terminate();
    importWorkerRef.current = null;
    if (importTimeout.current !== undefined) {
      window.clearTimeout(importTimeout.current);
      importTimeout.current = undefined;
    }
    setImportingSession(false);
  };

  const updateInput = (
    setter: (value: string) => void,
    value: string,
  ) => {
    if (workerRef.current) cancelPendingComparison();
    setComparisonError("");
    setIsExampleMode(false);
    setter(value);
  };

  const confirmWorkReset = (protectOwnText = true) => {
    const recordCount = Object.keys(reviewRecords).length;
    const includesText = Boolean(
      protectOwnText &&
        !isExampleMode &&
        (source || revision || required || hasRun),
    );
    return (
      (!includesText && recordCount === 0) ||
      window.confirm(t.resetWorkConfirm(recordCount, includesText))
    );
  };

  const changeLocale = () => {
    const nextLocale = locale === "zh" ? "en" : "zh";
    const url = new URL(window.location.href);
    url.searchParams.set("lang", nextLocale);
    window.history.replaceState(window.history.state, "", url);
    setLocale(nextLocale);
  };

  const loadExample = () => {
    if (!confirmWorkReset()) return;
    cancelPendingComparison();
    cancelPendingImport();
    const example = examples[locale];
    setSource(example.source);
    setRevision(example.revision);
    setRequired(example.required);
    setCheckedInput(example);
    const nextComparison = compareFacts(
      example.source,
      example.revision,
      example.required,
    );
    setComparison(nextComparison);
    setReviewRecords({});
    setReviewQueueOrder(getReviewOrder(nextComparison));
    setReviewPage(1);
    setHasRun(true);
    setIsExampleMode(true);
    setFilter("actionable");
    setResultPage(1);
    setRequiredPage(1);
    setComparisonError("");
    setComparisonFeedback("");
    setReviewAnnouncement("");
    setSessionError("");
    setFocusResultsAfterRun(false);
  };

  const clearAll = () => {
    if (!confirmWorkReset()) return;
    cancelPendingComparison();
    cancelPendingImport();
    setSource("");
    setRevision("");
    setRequired("");
    setCheckedInput({ source: "", revision: "", required: "" });
    setComparison(compareFacts("", "", ""));
    setReviewRecords({});
    setReviewQueueOrder([]);
    setReviewPage(1);
    setHasRun(false);
    setIsExampleMode(false);
    setFilter("all");
    setResultPage(1);
    setRequiredPage(1);
    setComparisonError("");
    setComparisonFeedback("");
    setReviewAnnouncement("");
    setSessionError("");
  };

  const startOwnText = () => {
    if (!isExampleMode) {
      setFocusSourceAfterReset(true);
      return;
    }
    if (!confirmWorkReset(false)) return;
    cancelPendingComparison();
    cancelPendingImport();
    setSource("");
    setRevision("");
    setRequired("");
    setCheckedInput({ source: "", revision: "", required: "" });
    setComparison(compareFacts("", "", ""));
    setReviewRecords({});
    setReviewQueueOrder([]);
    setReviewPage(1);
    setHasRun(false);
    setIsExampleMode(false);
    setFilter("all");
    setResultPage(1);
    setRequiredPage(1);
    setComparisonError("");
    setComparisonFeedback("");
    setReviewAnnouncement("");
    setSessionError("");
    setFocusSourceAfterReset(true);
  };

  const viewExampleResults = () => {
    resultsHeading.current?.focus({ preventScroll: true });
    document
      .getElementById("results")
      ?.scrollIntoView({ behavior: "auto", block: "start" });
  };

  const runComparison = () => {
    if (busy || pendingRef.current) return;
    if (hasRun && !resultsOutdated) {
      setFocusResultsAfterRun(true);
      return;
    }
    const input = { source, revision, required };
    const inputViolation = getKeepFactsInputLimitViolation(input);
    if (inputViolation) {
      setComparisonError(
        preservePreviousResult(inputLimitMessage(inputViolation), hasRun),
      );
      setComparisonFeedback("");
      return;
    }
    const requestId = ++requestSequence.current;
    const previous = hasRun
      ? { input: checkedInput, comparison }
      : undefined;
    const recordsAtStart = reviewRecords;
    let worker: Worker;

    try {
      worker = new Worker(
        new URL("./workers/compare.worker.ts", import.meta.url),
        { type: "module", name: "keepfacts-compare" },
      );
    } catch {
      const currentCopy = copy[localeRef.current];
      setComparisonError(
        previous
          ? `${currentCopy.compareFailed} ${currentCopy.previousResultPreserved}`
          : currentCopy.compareFailed,
      );
      setComparisonFeedback("");
      return;
    }

    const isCurrent = () =>
      workerRef.current === worker &&
      pendingRef.current?.worker === worker &&
      pendingRef.current.requestId === requestId;
    const finishError = (message?: string) => {
      if (!isCurrent()) return;
      if (comparisonTimeout.current !== undefined) {
        window.clearTimeout(comparisonTimeout.current);
        comparisonTimeout.current = undefined;
      }
      worker.terminate();
      workerRef.current = null;
      pendingRef.current = undefined;
      setBusy(false);
      const currentCopy = copy[localeRef.current];
      const baseMessage =
        message === "input-limit-exceeded"
          ? currentCopy.inputLimitFallback
          : message === "comparison-limit-exceeded"
          ? currentCopy.compareLimitExceeded
          : message === "comparison-timeout"
            ? currentCopy.compareTimedOut
            : currentCopy.compareFailed;
      setComparisonError(
        previous
          ? `${baseMessage} ${currentCopy.previousResultPreserved}`
          : baseMessage,
      );
      setComparisonFeedback("");
    };

    worker.onmessage = ({ data }: MessageEvent<CompareWorkerResponse>) => {
      if (!isCurrent() || data.requestId !== requestId) return;
      if (data.type === "error") {
        finishError(data.message);
        return;
      }

      if (comparisonTimeout.current !== undefined) {
        window.clearTimeout(comparisonTimeout.current);
        comparisonTimeout.current = undefined;
      }
      worker.terminate();
      workerRef.current = null;
      pendingRef.current = undefined;
      setBusy(false);
      const migration = previous
        ? migrateReviewRecords(
            previous,
            { input, comparison: data.comparison },
            recordsAtStart,
          )
        : {
            records: {},
            retainedDecisions: 0,
            resetDecisions: 0,
            retainedAnnotations: 0,
            droppedRecords: 0,
            ambiguousRecords: 0,
          };
      const currentCopy = copy[localeRef.current];
      if (
        (migration.droppedRecords > 0 || migration.ambiguousRecords > 0) &&
        !window.confirm(
          currentCopy.migrationDropConfirm(
            migration.droppedRecords,
            migration.ambiguousRecords,
          ),
        )
      ) {
        setComparisonError("");
        setComparisonFeedback(currentCopy.migrationCancelled);
        return;
      }
      setComparison(data.comparison);
      setReviewRecords(migration.records);
      setReviewQueueOrder(getReviewOrder(data.comparison));
      setReviewPage(1);
      setCheckedInput(input);
      setHasRun(true);
      setFilter(
        data.comparison.reviewCount || data.comparison.addedCount
          ? "actionable"
          : "all",
      );
      setResultPage(1);
      setRequiredPage(1);
      setComparisonError("");
      setComparisonFeedback(
        previous &&
          (migration.retainedDecisions ||
            migration.resetDecisions ||
            migration.droppedRecords ||
            migration.ambiguousRecords)
          ? currentCopy.migrationResult(
              migration.retainedDecisions,
              migration.resetDecisions,
              migration.droppedRecords,
              migration.ambiguousRecords,
            )
          : currentCopy.resultReady(
              data.comparison.sourceFacts.length,
              data.comparison.reviewCount,
              data.comparison.addedCount,
              data.comparison.requiredMissingCount +
                data.comparison.requiredNotInSourceCount,
            ),
      );
      setFocusResultsAfterRun(true);
    };
    worker.onerror = () => finishError();
    worker.onmessageerror = () => finishError();
    workerRef.current = worker;
    pendingRef.current = {
      requestId,
      input,
      worker,
      previous,
      records: recordsAtStart,
    };
    setBusy(true);
    setComparisonError("");
    setComparisonFeedback(t.comparing);
    comparisonTimeout.current = window.setTimeout(
      () => finishError("comparison-timeout"),
      WORKER_TIMEOUT_MS,
    );
    const request: CompareWorkerRequest = {
      type: "compare",
      requestId,
      input,
      limits: { maxFactsPerSide: 1_000, maxRequiredItems: 1_000 },
    };
    try {
      worker.postMessage(request);
    } catch {
      finishError();
    }
  };

  const showReportFeedback = (message: string) => {
    if (reportFeedbackTimer.current !== undefined) {
      window.clearTimeout(reportFeedbackTimer.current);
    }
    setReportFeedback(message);
    setReviewAnnouncement(message);
    reportFeedbackTimer.current = window.setTimeout(() => {
      setReportFeedback((current) => (current === message ? "" : current));
      setReviewAnnouncement((current) =>
        current === message ? "" : current,
      );
      reportFeedbackTimer.current = undefined;
    }, 2400);
  };

  const reportMarkdown = (generatedAt: Date) =>
    buildMarkdownReport(comparison, locale, {
      appVersion: APP_VERSION,
      commitSha: APP_COMMIT_SHA,
      generatedAt,
      reviewRecords,
    });

  const setFactReviewRecord = (
    key: string,
    patch: Partial<ReviewRecord>,
  ) => {
    setReviewRecords((current) => updateReviewRecord(current, key, patch));
  };

  const manualSummary = summarizeReviews(comparison, reviewRecords);
  const reviewOutcome = getReviewOutcome(manualSummary);
  const currentReviewState = resultsOutdated ? "outdated" : reviewOutcome;
  const reviewOutcomeText = resultsOutdated
    ? t.reviewOutdated
    : ({
        "no-review": t.reviewNoFindings,
        draft: t.reviewDraft,
        "needs-changes": t.reviewNeedsChanges,
        acceptable: t.reviewAcceptable,
      }[reviewOutcome]);
  const reviewItems = getReviewItems(comparison);
  const reviewItemsByKey = new Map(reviewItems.map((item) => [item.key, item]));
  const effectiveReviewOrder = [
    ...reviewQueueOrder.filter((key) => reviewItemsByKey.has(key)),
    ...reviewItems
      .map(({ key }) => key)
      .filter((key) => !reviewQueueOrder.includes(key)),
  ];
  const orderedReviewItems = effectiveReviewOrder.flatMap((key) => {
    const item = reviewItemsByKey.get(key);
    return item ? [item] : [];
  });
  const reviewTotalPages = Math.max(
    1,
    Math.ceil(orderedReviewItems.length / RESULT_PAGE_SIZE),
  );
  const currentReviewPage = Math.min(reviewPage, reviewTotalPages);
  const pagedReviewItems = orderedReviewItems.slice(
    (currentReviewPage - 1) * RESULT_PAGE_SIZE,
    currentReviewPage * RESULT_PAGE_SIZE,
  );
  const scopeLabels: Record<ReviewScope, string> = {
    source: t.scopeSource,
    required: t.scopeRequired,
    added: t.scopeAdded,
  };
  const focusPageHeading = (heading: HTMLHeadingElement | null) => {
    window.requestAnimationFrame(() => {
      heading?.focus({ preventScroll: true });
      heading?.scrollIntoView({ behavior: "auto", block: "start" });
    });
  };
  const moveToNextPending = () => {
    const targetKey = getNextPendingReviewKey(
      comparison,
      reviewRecords,
      activeReviewKey.current,
    );
    if (!targetKey) return;
    const nextOrder = orderReviewQueue(
      effectiveReviewOrder,
      reviewRecords,
      targetKey,
    );
    const targetIndex = nextOrder.indexOf(targetKey);
    const target = reviewItemsByKey.get(targetKey);
    setReviewQueueOrder(nextOrder);
    setReviewPage(Math.floor(targetIndex / RESULT_PAGE_SIZE) + 1);
    setPendingReviewFocus(targetKey);
    if (target) {
      setReviewAnnouncement(
        t.movedToPending(
          targetIndex + 1,
          scopeLabels[target.scope],
          target.fact.raw,
        ),
      );
    }
  };
  const copyReport = async () => {
    const generatedAt = new Date();
    try {
      await navigator.clipboard.writeText(reportMarkdown(generatedAt));
      showReportFeedback(t.copied);
    } catch {
      showReportFeedback(t.copyFailed);
    }
  };
  const copyFixList = async () => {
    const fixes = getFixList(comparison, reviewRecords);
    if (!fixes.length) {
      showReportFeedback(t.fixListEmpty);
      return;
    }
    try {
      await navigator.clipboard.writeText(
        buildFixListMarkdown(comparison, locale, reviewRecords),
      );
      showReportFeedback(t.fixListCopied);
    } catch {
      showReportFeedback(t.copyFailed);
    }
  };

  const downloadReport = () => {
    const generatedAt = new Date();
    const blob = new Blob([reportMarkdown(generatedAt)], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `keepfacts-report-${formatLocalDate(generatedAt)}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    showReportFeedback(t.downloaded);
  };

  const exportSession = () => {
    const input = { source, revision, required };
    const inputViolation = getKeepFactsInputLimitViolation(input);
    if (inputViolation) {
      setSessionFeedback("");
      setSessionError(t.sessionInputLimit(inputLimitMessage(inputViolation)));
      return;
    }
    if (!window.confirm(t.exportSessionConfirm)) return;
    const exportedAt = new Date();
    const session: KeepFactsSessionV1 = {
      format: "keepfacts.session",
      schemaVersion: KEEPFACTS_SESSION_SCHEMA_VERSION,
      exportedAt: exportedAt.toISOString(),
      generator: { appVersion: APP_VERSION, commitSha: APP_COMMIT_SHA },
      privacy: { containsFullText: true, encrypted: false },
      locale,
      editor: { source, revision, required },
      result: hasRun
        ? {
            input: checkedInput,
            reviewRecords: Object.entries(reviewRecords)
              .sort(([left], [right]) => left.localeCompare(right))
              .flatMap(([key, record]) =>
                record
                  ? [
                      {
                        key,
                        ...(record.decision
                          ? { decision: record.decision }
                          : {}),
                        ...(record.note ? { note: record.note } : {}),
                        ...(record.expectedFix
                          ? { expectedFix: record.expectedFix }
                          : {}),
                      },
                    ]
                  : [],
              ),
          }
        : null,
    };
    try {
      const serialized = serializeKeepFactsSession(session);
      const blob = new Blob([serialized], {
        type: "application/json;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `keepfacts-session-${exportedAt
        .toISOString()
        .replace(/[-:]/gu, "")
        .replace(/\.\d{3}Z$/u, "Z")}.keepfacts.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setSessionFeedback(t.sessionExported);
      setSessionError("");
    } catch {
      setSessionError(t.sessionExportFailed);
    }
  };

  const commitImportedSession = (
    session: KeepFactsSessionV1,
    importedComparison?: typeof comparison,
  ) => {
    if (!window.confirm(t.importSessionConfirm)) return false;
    cancelPendingComparison();
    const nextLocale = session.locale;
    const url = new URL(window.location.href);
    url.searchParams.set("lang", nextLocale);
    window.history.replaceState(window.history.state, "", url);
    setLocale(nextLocale);
    setSource(session.editor.source);
    setRevision(session.editor.revision);
    setRequired(session.editor.required);
    setIsExampleMode(false);
    setFilter(
      importedComparison &&
        (importedComparison.reviewCount || importedComparison.addedCount)
        ? "actionable"
        : "all",
    );
    setResultPage(1);
    setRequiredPage(1);
    setReviewPage(1);
    setComparisonError("");
    setComparisonFeedback("");
    setReviewAnnouncement("");

    if (!session.result || !importedComparison) {
      setCheckedInput({ source: "", revision: "", required: "" });
      setComparison(compareFacts("", "", ""));
      setReviewRecords({});
      setReviewQueueOrder([]);
      setHasRun(false);
      setFocusSourceAfterReset(true);
      setSessionFeedback(copy[nextLocale].sessionImported(0, 0));
      return true;
    }

    const reconciled = reconcileKeepFactsReviewRecords(
      session.result.reviewRecords,
      importedComparison,
    );
    setCheckedInput(session.result.input);
    setComparison(importedComparison);
    setReviewRecords(reconciled.reviewRecords);
    setReviewQueueOrder(getReviewOrder(importedComparison));
    setHasRun(true);
    setFocusResultsAfterRun(true);
    setSessionFeedback(
      copy[nextLocale].sessionImported(
        reconciled.restoredCount,
        reconciled.discardedCount,
      ),
    );
    return true;
  };

  const importSessionFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const inputElement = event.currentTarget;
    const file = inputElement.files?.[0];
    inputElement.value = "";
    if (!file) return;
    cancelPendingImport();
    const importId = ++importSequence.current;
    const isCurrentImport = () => importSequence.current === importId;
    setImportingSession(true);
    setSessionError("");
    setSessionFeedback("");
    if (
      !file.name.toLowerCase().endsWith(".keepfacts.json") ||
      file.size <= 0 ||
      file.size > KEEPFACTS_SESSION_MAX_BYTES
    ) {
      if (isCurrentImport()) {
        setImportingSession(false);
        setSessionError(t.sessionImportFailed);
      }
      return;
    }

    let session: KeepFactsSessionV1;
    try {
      const contents = await file.text();
      if (!isCurrentImport()) return;
      session = parseKeepFactsSession(contents);
    } catch {
      if (isCurrentImport()) {
        setImportingSession(false);
        setSessionError(copy[localeRef.current].sessionImportFailed);
      }
      return;
    }

    if (!session.result) {
      if (!isCurrentImport()) return;
      commitImportedSession(session);
      if (isCurrentImport()) setImportingSession(false);
      return;
    }

    const requestId = importId;
    let worker: Worker;
    try {
      worker = new Worker(
        new URL("./workers/compare.worker.ts", import.meta.url),
        { type: "module", name: "keepfacts-session-import" },
      );
    } catch {
      if (isCurrentImport()) {
        setImportingSession(false);
        setSessionError(copy[localeRef.current].sessionImportFailed);
      }
      return;
    }
    importWorkerRef.current = worker;
    setImportingSession(true);
    const isCurrentWorker = () =>
      isCurrentImport() && importWorkerRef.current === worker;
    const finish = () => {
      if (!isCurrentWorker()) return false;
      worker.terminate();
      importWorkerRef.current = null;
      if (importTimeout.current !== undefined) {
        window.clearTimeout(importTimeout.current);
        importTimeout.current = undefined;
      }
      setImportingSession(false);
      return true;
    };
    const fail = () => {
      if (!finish()) return;
      setSessionError(copy[localeRef.current].sessionImportFailed);
    };
    worker.onmessage = ({ data }: MessageEvent<CompareWorkerResponse>) => {
      if (
        !isCurrentWorker() ||
        data.requestId !== requestId
      ) {
        return;
      }
      if (data.type === "error") {
        fail();
        return;
      }
      if (!finish()) return;
      if (
        data.comparison.sourceFacts.length > 1_000 ||
        data.comparison.requiredCount > 1_000
      ) {
        setSessionError(copy[localeRef.current].sessionImportFailed);
        return;
      }
      commitImportedSession(session, data.comparison);
    };
    worker.onerror = fail;
    worker.onmessageerror = fail;
    importTimeout.current = window.setTimeout(fail, WORKER_TIMEOUT_MS);
    const request: CompareWorkerRequest = {
      type: "compare",
      requestId,
      input: session.result.input,
      limits: { maxFactsPerSide: 1_000, maxRequiredItems: 1_000 },
    };
    try {
      worker.postMessage(request);
    } catch {
      fail();
    }
  };

  const visibleSourceFacts = comparison.sourceFacts.filter((fact) => {
    if (filter === "all") return true;
    if (filter === "added") return false;
    if (filter === "actionable") return fact.status === "review";
    return fact.status === filter;
  });
  const visibleAddedFacts = comparison.addedFacts.filter((fact) => {
    if (filter === "all" || filter === "added") return true;
    if (filter === "actionable") return true;
    return false;
  });
  const visibleCount =
    visibleSourceFacts.length + visibleAddedFacts.length;
  const visibleItems = [
    ...visibleSourceFacts.map((fact) => ({ fact, added: false as const })),
    ...visibleAddedFacts.map((fact) => ({ fact, added: true as const })),
  ];
  const totalPages = Math.max(1, Math.ceil(visibleItems.length / RESULT_PAGE_SIZE));
  const currentPage = Math.min(resultPage, totalPages);
  const pagedItems = visibleItems.slice(
    (currentPage - 1) * RESULT_PAGE_SIZE,
    currentPage * RESULT_PAGE_SIZE,
  );
  const requiredTotalPages = Math.max(
    1,
    Math.ceil(comparison.requiredFacts.length / RESULT_PAGE_SIZE),
  );
  const currentRequiredPage = Math.min(requiredPage, requiredTotalPages);
  const pagedRequiredFacts = comparison.requiredFacts.slice(
    (currentRequiredPage - 1) * RESULT_PAGE_SIZE,
    currentRequiredPage * RESULT_PAGE_SIZE,
  );

  const filters: Array<{ key: Filter; label: string; count: number }> = [
    {
      key: "actionable",
      label: t.issuesAndAdditions,
      count: comparison.reviewCount + comparison.addedCount,
    },
    {
      key: "review",
      label: t.review,
      count: comparison.reviewCount,
    },
    {
      key: "preserved",
      label: t.preserved,
      count: comparison.preservedCount,
    },
    {
      key: "added",
      label: t.added,
      count: comparison.addedCount,
    },
    {
      key: "all",
      label: t.all,
      count: total + comparison.addedCount,
    },
  ];

  return (
    <main lang={locale === "zh" ? "zh-CN" : "en"}>
      <a className="skip-link" href="#checker">
        {t.skipToChecker}
      </a>
      <header className="site-header">
        <a className="brand" href="#top" aria-label={t.homeLabel}>
          <span className="brand-mark" aria-hidden="true">
            K
          </span>
          <span>KeepFacts</span>
          <span className="version-tag">v{APP_VERSION}</span>
        </a>
        <div className="header-actions">
          <span className="privacy-badge">
            <span className="privacy-dot" aria-hidden="true" />
            {t.privacy}
          </span>
          <button
            className="language-button"
            type="button"
            onClick={changeLocale}
          >
            {t.changeLanguage}
          </button>
        </div>
      </header>

      <section
        className={`hero ${isExampleMode && hasRun ? "hero-with-proof" : "hero-single"}`}
        id="top"
      >
        <h1>
          {t.titleA}
          <br />
          <span>{t.titleB}</span>
        </h1>
        <p className="hero-copy">{t.intro}</p>
        {isExampleMode && hasRun ? (
          <ul className="hero-proof" aria-label={t.exampleProof}>
            {[t.proofDate, t.proofUsers, t.proofLink].map((proof) => {
              const [before, after] = proof.split("→").map((part) => part.trim());

              return (
                <li key={proof}>
                  <span className="proof-change">
                    {after ? (
                      <>
                        <span className="proof-before">{before}</span>
                        {" "}
                        <span className="proof-arrow">→</span>
                        {" "}
                        <strong>{after}</strong>
                      </>
                    ) : (
                      <strong className="proof-single">{proof}</strong>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}
        <div className="hero-actions">
          {isExampleMode && hasRun ? (
            <>
              <button
                className="hero-primary-action"
                type="button"
                onClick={viewExampleResults}
              >
                {t.viewExample}
              </button>
              <button
                className="hero-secondary-action"
                type="button"
                onClick={startOwnText}
              >
                {t.checkOwnText}
              </button>
            </>
          ) : (
            <button
              className="hero-primary-action"
              type="button"
              onClick={startOwnText}
            >
              {t.checkOwnText}
            </button>
          )}
        </div>
        <p className="locale-scope">{t.localeScope}</p>
        <p className="mobile-privacy-copy" data-testid="privacy-copy">
          <span className="privacy-dot" aria-hidden="true" />
          {t.mobilePrivacy}
        </p>
        <div className="hero-trust">
          <nav className="trust-links" aria-label={t.trustLinks}>
            <a href={SOURCE_URL} target="_blank" rel="noreferrer">
              {t.sourceCode}
            </a>
            <a href={PRIVACY_URL} target="_blank" rel="noreferrer">
              {t.privacyBoundaries}
            </a>
            <a href={FEEDBACK_URL} target="_blank" rel="noreferrer">
              {t.reportDetectionIssue}
            </a>
          </nav>
          <p className="feedback-safety">{t.feedbackSafety}</p>
        </div>
      </section>

      <section className="checker" id="checker" aria-label={t.eyebrow}>
        <section
          className="input-mode"
          data-testid="input-mode"
          aria-label={isExampleMode ? t.exampleMode : t.ownTextMode}
        >
          <div>
            <strong>{isExampleMode ? t.exampleMode : t.ownTextMode}</strong>
            <span>
              {isExampleMode ? t.exampleModeHint : t.ownTextModeHint}
            </span>
          </div>
          {isExampleMode ? (
            <button type="button" onClick={startOwnText}>
              {t.useOwnText}
            </button>
          ) : (
            <button type="button" onClick={loadExample}>
              {t.loadExample}
            </button>
          )}
        </section>
        <div className="editor-grid">
          <article className="editor-card">
            <div className="editor-header">
              <div>
                <span className="step-number">01</span>
                <h2>{t.source}</h2>
                <p>{t.sourceHint}</p>
              </div>
              <span className="char-count">
                {source.length} {t.chars}
              </span>
            </div>
            <textarea
              ref={sourceInput}
              aria-label={t.source}
              value={source}
              maxLength={KEEPFACTS_MAX_TEXT_LENGTH}
              onChange={(event) => updateInput(setSource, event.target.value)}
              placeholder={t.placeholderSource}
              spellCheck="false"
            />
          </article>

          <article className="editor-card">
            <div className="editor-header">
              <div>
                <span className="step-number">02</span>
                <h2>{t.revision}</h2>
                <p>{t.revisionHint}</p>
              </div>
              <span className="char-count">
                {revision.length} {t.chars}
              </span>
            </div>
            <textarea
              aria-label={t.revision}
              value={revision}
              maxLength={KEEPFACTS_MAX_TEXT_LENGTH}
              onChange={(event) => updateInput(setRevision, event.target.value)}
              placeholder={t.placeholderRevision}
              spellCheck="false"
            />
          </article>
        </div>

        <details className="required-panel">
          <summary>
            <span>{t.required}</span>
            <small>{t.requiredHint}</small>
          </summary>
          <textarea
            aria-label={t.required}
            value={required}
            maxLength={KEEPFACTS_MAX_REQUIRED_LENGTH}
            onChange={(event) => updateInput(setRequired, event.target.value)}
            placeholder={t.requiredPlaceholder}
            spellCheck="false"
          />
          <p className="required-input-feedback" role="status" aria-live="polite">
            {requiredNotInSourceCount
              ? t.requiredInputWarning(requiredNotInSourceCount)
              : ""}
          </p>
        </details>

        <div className="action-bar">
          <div className="secondary-actions">
            <button type="button" className="text-button" onClick={clearAll}>
              {t.clear}
            </button>
          </div>
          <div className="primary-action-wrap">
            <button
              className="compare-button"
              type="button"
              onClick={runComparison}
              disabled={busy || !source.trim() || !revision.trim()}
              aria-busy={busy}
            >
              <span className="button-step">03</span>
              {busy ? t.comparing : t.compare}
              <span aria-hidden="true">→</span>
            </button>
            <span>{t.compareHint}</span>
          </div>
        </div>
        <div className="session-actions" role="group" aria-label={t.sessionPrivacy}>
          <button type="button" onClick={exportSession}>
            {t.exportSession}
          </button>
          <button
            type="button"
            onClick={() => sessionInput.current?.click()}
            disabled={importingSession}
          >
            {importingSession ? t.sessionImporting : t.importSession}
          </button>
          <input
            ref={sessionInput}
            className="sr-only"
            type="file"
            aria-hidden="true"
            tabIndex={-1}
            accept=".keepfacts.json,application/json"
            onChange={(event) => void importSessionFile(event)}
          />
        </div>
        <p className="session-notice">{t.sessionPrivacy}</p>
        {sessionFeedback ? <p role="status">{sessionFeedback}</p> : null}
        {sessionError ? <p role="alert">{sessionError}</p> : null}
        {comparisonError ? (
          <div className="stale-notice comparison-error" role="alert">
            {comparisonError}
          </div>
        ) : null}
      </section>

      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {comparisonFeedback}
      </span>

      {hasRun ? (
        <section className="results-section" id="results">
          <div className="results-heading-row">
            <div>
              <h2 ref={resultsHeading} tabIndex={-1}>{t.resultTitle}</h2>
              <p>{t.resultIntro}</p>
            </div>
            <div className="result-tools">
              <div
                className="retention-metric"
                role={retention === null ? "status" : "meter"}
                aria-valuemin={retention === null ? undefined : 0}
                aria-valuemax={retention === null ? undefined : 100}
                aria-valuenow={retention ?? undefined}
                aria-describedby="retention-disclaimer"
                aria-label={
                  retention === null ? `${t.score} ${retentionLabel}` : t.score
                }
              >
                <span>{retentionLabel}</span>
                <small>{t.score}</small>
              </div>
            </div>
          </div>

          <p
            className="retention-disclaimer"
            id="retention-disclaimer"
            data-testid="retention-disclaimer"
          >
            {t.retentionDisclaimer}
          </p>

          {resultsOutdated ? (
            <div className="stale-notice" role="status">
              {t.resultsOutdated}
            </div>
          ) : null}

          <div className="summary-grid">
            <div className="summary-card summary-neutral">
              <span>{t.scanned}</span>
              <strong>{total}</strong>
            </div>
            <div className="summary-card summary-success">
              <span>{t.preserved}</span>
              <strong>{comparison.preservedCount}</strong>
            </div>
            <div className="summary-card summary-warning">
              <span>{t.review}</span>
              <strong>{comparison.reviewCount}</strong>
            </div>
            <div className="summary-card summary-added">
              <span>{t.added}</span>
              <strong>{comparison.addedCount}</strong>
            </div>
          </div>

          <section className="review-workspace" aria-labelledby="review-workspace-title">
            <header>
              <h3
                id="review-workspace-title"
                ref={reviewWorkspaceHeading}
                tabIndex={-1}
              >
                {t.manualReview}
              </h3>
              <p>{t.manualReviewHint}</p>
            </header>
            <div className="review-toolbar">
              <div className="review-toolbar-main">
                <div className="review-progress">
                  {manualSummary.total ? (
                    <progress
                      value={manualSummary.total - manualSummary.pending}
                      max={manualSummary.total}
                      aria-label={t.manualReview}
                      aria-valuetext={`${manualSummary.total - manualSummary.pending}/${manualSummary.total}`}
                    />
                  ) : null}
                  <strong>
                    {manualSummary.total - manualSummary.pending}/{manualSummary.total}
                  </strong>
                  <span
                    className={`review-outcome review-outcome-${currentReviewState}`}
                    data-review-state={currentReviewState}
                    data-testid="review-outcome"
                    aria-label={`${t.reviewOutcomeLabel}: ${reviewOutcomeText}`}
                  >
                    {reviewOutcomeText}
                  </span>
                </div>
                <div className="review-actions" role="group" aria-label={t.reviewToolbar}>
                  {manualSummary.total ? (
                    <>
                      <button
                        type="button"
                        data-review-action="next-pending"
                        onClick={moveToNextPending}
                        disabled={busy || resultsOutdated || manualSummary.pending === 0}
                      >
                        {t.nextPending}
                      </button>
                      <button
                        type="button"
                        data-review-action="copy-fix-list"
                        onClick={copyFixList}
                        disabled={busy || resultsOutdated || manualSummary.confirmed === 0}
                      >
                        {t.copyFixList}
                      </button>
                    </>
                  ) : null}
                  <button type="button" onClick={copyReport} disabled={busy || resultsOutdated}>
                    {t.copyReport}
                  </button>
                  <button type="button" onClick={downloadReport} disabled={busy || resultsOutdated}>
                    {t.downloadReport}
                  </button>
                </div>
              </div>
              <span className="report-feedback">{reportFeedback}</span>
            </div>
            <span
              className="sr-only"
              role="status"
              aria-live="polite"
              aria-atomic="true"
              data-testid="review-announcement"
            >
              {reviewAnnouncement || reportFeedback}
            </span>

            {pagedReviewItems.length ? (
              <ol className="review-queue" aria-label={t.reviewQueue}>
                {pagedReviewItems.map((item) => {
                  const added = item.scope === "added";
                  const position = effectiveReviewOrder.indexOf(item.key) + 1;
                  return (
                    <li
                      key={item.key}
                      data-review-key={item.key}
                      data-review-scope={item.scope}
                      data-review-state={reviewRecords[item.key]?.decision ?? "pending"}
                      onFocusCapture={() => {
                        activeReviewKey.current = item.key;
                      }}
                    >
                      <ResultCard
                        fact={item.fact}
                        locale={locale}
                        added={added}
                        reviewScope={item.scope}
                        reviewRecord={reviewRecords[item.key]}
                        onReviewRecordChange={(patch) => {
                          setFactReviewRecord(item.key, patch);
                          const nextDecision = patch.decision;
                          if (Object.prototype.hasOwnProperty.call(patch, "decision")) {
                            const decisionLabel = nextDecision
                              ? {
                                  confirmed: t.manualConfirmed,
                                  accepted: t.manualAccepted,
                                  ignored: t.manualIgnored,
                                }[nextDecision]
                              : t.manualPending;
                            const wasPending = !reviewRecords[item.key]?.decision;
                            const willBePending = !nextDecision;
                            const remaining = Math.max(
                              0,
                              manualSummary.pending +
                                (wasPending === willBePending
                                  ? 0
                                  : willBePending
                                    ? 1
                                    : -1),
                            );
                            setReviewAnnouncement(
                              `${scopeLabels[item.scope]} ${item.fact.raw}：${decisionLabel}。${t.remainingPending(remaining)}`,
                            );
                          }
                        }}
                        reviewDisabled={busy || resultsOutdated}
                        queuePosition={position}
                        scopeLabel={scopeLabels[item.scope]}
                        headingRef={(element) => {
                          if (element) reviewItemElements.current.set(item.key, element);
                          else reviewItemElements.current.delete(item.key);
                        }}
                      />
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="machine-details-note">{t.reviewNoFindings}</p>
            )}
            {orderedReviewItems.length > RESULT_PAGE_SIZE ? (
              <nav className="review-pagination" aria-label={t.reviewQueue}>
                <button
                  type="button"
                  disabled={currentReviewPage === 1}
                  onClick={() => {
                    setReviewPage(currentReviewPage - 1);
                    focusPageHeading(reviewWorkspaceHeading.current);
                  }}
                >
                  {t.previousPage}
                </button>
                <span aria-current="page">
                  {t.pageStatus(currentReviewPage, reviewTotalPages, orderedReviewItems.length)}
                </span>
                <button
                  type="button"
                  disabled={currentReviewPage === reviewTotalPages}
                  onClick={() => {
                    setReviewPage(currentReviewPage + 1);
                    focusPageHeading(reviewWorkspaceHeading.current);
                  }}
                >
                  {t.nextPage}
                </button>
              </nav>
            ) : null}
          </section>

          {comparison.requiredCount ? (
            <section className="required-results" aria-label={t.requiredResults}>
              <div className="required-results-heading">
                <div>
                  <h3 ref={requiredResultsHeading} tabIndex={-1}>
                    {t.requiredResults}
                  </h3>
                </div>
                <div
                  className="required-score"
                  aria-label={`${t.requiredRetention} ${requiredRetentionLabel}`}
                >
                  <strong>{requiredRetentionLabel}</strong>
                  <span>{t.requiredRetention}</span>
                </div>
              </div>
              <div className="required-summary-grid">
                <div className="summary-card summary-neutral">
                  <span>{t.requiredConfigured}</span>
                  <strong>{comparison.requiredCount}</strong>
                </div>
                <div className="summary-card summary-neutral">
                  <span>{t.requiredCheckable}</span>
                  <strong>{comparison.requiredCheckableCount}</strong>
                </div>
                <div className="summary-card summary-success">
                  <span>{t.preserved}</span>
                  <strong>{comparison.requiredPreservedCount}</strong>
                </div>
                <div className="summary-card summary-warning">
                  <span>{t.requiredMissing}</span>
                  <strong>{comparison.requiredMissingCount}</strong>
                </div>
                <div className="summary-card summary-invalid">
                  <span>{t.requiredNotInSource}</span>
                  <strong>{comparison.requiredNotInSourceCount}</strong>
                </div>
              </div>
              <p className="machine-details-note">{t.machineDetailsNote}</p>
              <div className="required-result-list">
                {pagedRequiredFacts.map((fact) => (
                  <ResultCard
                    key={fact.id}
                    fact={fact}
                    locale={locale}
                  />
                ))}
              </div>
              {comparison.requiredFacts.length > RESULT_PAGE_SIZE ? (
                <nav className="result-pagination" aria-label={t.requiredResults}>
                  <button
                    type="button"
                    disabled={currentRequiredPage === 1}
                    onClick={() => {
                      setRequiredPage(currentRequiredPage - 1);
                      focusPageHeading(requiredResultsHeading.current);
                    }}
                  >
                    {t.previousPage}
                  </button>
                  <span aria-current="page" aria-live="polite">
                    {t.pageStatus(
                      currentRequiredPage,
                      requiredTotalPages,
                      comparison.requiredFacts.length,
                    )}
                  </span>
                  <button
                    type="button"
                    disabled={currentRequiredPage === requiredTotalPages}
                    onClick={() => {
                      setRequiredPage(currentRequiredPage + 1);
                      focusPageHeading(requiredResultsHeading.current);
                    }}
                  >
                    {t.nextPage}
                  </button>
                </nav>
              ) : null}
            </section>
          ) : null}

          <section className="automatic-results" aria-labelledby="automatic-details-title">
            <div className="automatic-results-heading">
              <h3
                id="automatic-details-title"
                ref={automaticResultsHeading}
                tabIndex={-1}
              >
                {t.automaticDetails}
              </h3>
              <p>{t.automaticDetailsHint}</p>
            </div>
            <div className="filter-tabs" role="group" aria-label={t.automaticDetails}>
              {filters.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  aria-pressed={filter === item.key}
                  className={filter === item.key ? "active" : ""}
                  onClick={() => {
                    setFilter(item.key);
                    setResultPage(1);
                    setComparisonFeedback(t.visibleItems(item.label, item.count));
                  }}
                >
                  {item.label}
                  <span>{item.count}</span>
                </button>
              ))}
            </div>
            <p className="machine-details-note">{t.machineDetailsNote}</p>

            <div className="result-list">
            {pagedItems.map(({ fact, added }) =>
              added ? (
                  <ResultCard
                    key={`added-${fact.id}`}
                    fact={fact}
                    locale={locale}
                    added
                  />
                ) : (
                  <ResultCard
                    key={fact.id}
                    fact={fact}
                    locale={locale}
                  />
                ),
            )}
            {visibleCount === 0 ? (
              <div className="empty-state">
                <span aria-hidden="true">◎</span>
                <h3>
                  {total + comparison.addedFacts.length === 0
                    ? t.emptyNoFactsTitle
                    : t.emptyFilterTitle}
                </h3>
                <p>
                  {total + comparison.addedFacts.length === 0
                    ? t.emptyNoFactsBody
                    : t.emptyFilterBody}
                </p>
              </div>
            ) : null}
            </div>
            {visibleCount > RESULT_PAGE_SIZE ? (
              <nav className="result-pagination" aria-label={t.automaticDetails}>
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => {
                    setResultPage(currentPage - 1);
                    focusPageHeading(automaticResultsHeading.current);
                  }}
                >
                  {t.previousPage}
                </button>
                <span aria-current="page" aria-live="polite">
                  {t.pageStatus(currentPage, totalPages, visibleCount)}
                </span>
                <button
                  type="button"
                  disabled={currentPage === totalPages}
                  onClick={() => {
                    setResultPage(currentPage + 1);
                    focusPageHeading(automaticResultsHeading.current);
                  }}
                >
                  {t.nextPage}
                </button>
              </nav>
            ) : null}
          </section>

          <aside className="disclaimer">
            <span aria-hidden="true">i</span>
            <p>{t.disclaimer}</p>
          </aside>
        </section>
      ) : null}

      <footer>
        <span>KeepFacts</span>
        <p>
          v{APP_VERSION} · {t.footer}
          {APP_COMMIT_SHA !== "local" ? (
            <span
              className="commit-sha"
              title={APP_COMMIT_SHA}
              aria-label={`${locale === "zh" ? "构建提交" : "Build commit"} ${APP_COMMIT_SHA}`}
            >
              {` · ${APP_COMMIT_SHA.slice(0, 7)}`}
            </span>
          ) : null}
        </p>
      </footer>
    </main>
  );
}
