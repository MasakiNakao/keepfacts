import { useEffect, useRef, useState } from "react";
import {
  compareFacts,
  countRequiredNotInSource,
  type ComparedFact,
  type Fact,
  type FactKind,
} from "./lib/facts";
import { buildMarkdownReport, formatLocalDate } from "./lib/report";
import {
  reviewDecisionKey,
  summarizeReviews,
  type ReviewDecision,
  type ReviewDecisions,
  type ReviewScope,
} from "./lib/review";
import { APP_COMMIT_SHA, APP_VERSION } from "./version";
import type {
  CompareInput,
  CompareWorkerRequest,
  CompareWorkerResponse,
} from "./workers/compare.protocol";

type Locale = "zh" | "en";
type Filter = "all" | "actionable" | "review" | "preserved" | "added";
const RESULT_PAGE_SIZE = 50;

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

const copy = {
  zh: {
    privacy: "本地运行 · 文本不会上传",
    eyebrow: "AI 文本事实核对器",
    titleA: "措辞可以改变，",
    titleB: "事实不该走样。",
    intro:
      "对照原文和 AI 改写稿，找出被保留、疑似修改、遗漏或新增的数字、日期、金额和链接。",
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
    compare: "开始核对",
    comparing: "正在核对…",
    compareFailed: "核对未完成，请重试。上次结果已保留。",
    compareHint: "点击后生成一份固定结果；修改内容后请重新核对",
    resultsOutdated: "输入内容已更改，以下仍是上次核对结果。请重新核对后再导出报告。",
    resultTitle: "核对结果",
    resultIntro: "先看需要人工确认的项目，再决定是否接受这次改写。",
    resultReady: (automatic: number, review: number, added: number, required: number) =>
      `核对完成：自动事实 ${automatic} 项，需确认 ${review} 项，新增 ${added} 项，必须保留异常 ${required} 项。`,
    copyReport: "复制报告",
    downloadReport: "下载 Markdown",
    copied: "报告已复制",
    copyFailed: "复制失败，请使用下载功能",
    downloaded: "报告已下载",
    scanned: "自动事实",
    preserved: "已保留",
    review: "需确认",
    reviewItems: "人工审阅",
    added: "改写新增",
    score: "自动保留率",
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
      "人工结论不会改变自动统计，只保留在当前页面和本次导出的报告中。重新核对会重置。",
    manualTotal: "待审阅项目",
    manualPending: "待处理",
    manualConfirmed: "确认需处理",
    manualAccepted: "改写合理",
    manualIgnored: "已忽略",
    manualDecision: "人工结论",
    manualDecisionGroup: "选择人工结论",
    previousPage: "上一页",
    nextPage: "下一页",
    pageStatus: (page: number, pages: number, total: number) =>
      `第 ${page}/${pages} 页，共 ${total} 项`,
    emptyTitle: "还没有可核对的事实",
    emptyBody: "请在左右两侧粘贴文本，或载入示例查看效果。",
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
      "KeepFacts 当前只检查可精确比对的硬事实，不判断整段文字的语义是否正确。黄色项目需要你人工确认。",
    footerPrefix: "实验版",
    footer: "确定性规则 · 无追踪代码",
    homeLabel: "KeepFacts 首页",
    documentTitle: "KeepFacts — 措辞可以改变，事实不该走样",
    changeLanguage: "English",
  },
  en: {
    privacy: "Runs locally · Your text stays private",
    eyebrow: "AI rewrite fact checker",
    titleA: "Change the wording,",
    titleB: "not the facts.",
    intro:
      "Compare a source with an AI rewrite to catch preserved, changed, missing, or newly added numbers, dates, money, and links.",
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
    compare: "Check the facts",
    comparing: "Checking…",
    compareFailed:
      "The check did not finish. Try again; the previous result is unchanged.",
    compareHint: "Creates a fixed result. Recheck after editing either text.",
    resultsOutdated:
      "The inputs changed. These are still the previous results; recheck before exporting.",
    resultTitle: "Fact check",
    resultIntro: "Review flagged items before accepting the rewrite.",
    resultReady: (automatic: number, review: number, added: number, required: number) =>
      `Check complete: ${automatic} automatic facts, ${review} for review, ${added} new, and ${required} must-preserve issues.`,
    copyReport: "Copy report",
    downloadReport: "Download Markdown",
    copied: "Report copied",
    copyFailed: "Copy failed. Please download the report instead.",
    downloaded: "Report downloaded",
    scanned: "Automatic facts",
    preserved: "Preserved",
    review: "Review",
    reviewItems: "Human review",
    added: "New in rewrite",
    score: "Auto retention",
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
      "Human decisions do not change automatic metrics. They remain only on this page and in this exported report, and reset after a new check.",
    manualTotal: "Reviewable items",
    manualPending: "Pending",
    manualConfirmed: "Confirmed issue",
    manualAccepted: "Acceptable rewrite",
    manualIgnored: "Ignored",
    manualDecision: "Human decision",
    manualDecisionGroup: "Choose a human decision",
    previousPage: "Previous",
    nextPage: "Next",
    pageStatus: (page: number, pages: number, total: number) =>
      `Page ${page} of ${pages}, ${total} items`,
    emptyTitle: "No comparable facts yet",
    emptyBody: "Paste text into both fields, or load the example to see it work.",
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
      "KeepFacts currently checks exact, extractable facts only. It does not judge whether the full meaning is correct. Yellow items need human review.",
    footerPrefix: "Experimental",
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
  decision,
  onDecisionChange,
  reviewDisabled = false,
}: {
  fact: Fact | ComparedFact;
  locale: Locale;
  added?: boolean;
  reviewScope?: ReviewScope;
  decision?: ReviewDecision;
  onDecisionChange?: (decision?: ReviewDecision) => void;
  reviewDisabled?: boolean;
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
        {reviewable && reviewScope && onDecisionChange ? (
          <fieldset className="review-decision" disabled={reviewDisabled}>
            <legend className="sr-only">
              {`${t.manualDecisionGroup}: ${sourceFact?.raw ?? fact.raw}`}
            </legend>
            <div className="review-decision-heading">
              <span>{t.manualDecision}</span>
              <strong>
                {decision
                  ? decisionOptions.find((option) => option.value === decision)
                      ?.label
                  : t.manualPending}
              </strong>
            </div>
            <div className="review-decision-buttons">
              {decisionOptions.map((option) => (
                <label
                  key={option.key}
                  className={
                    decision === option.value
                      ? "review-decision-option selected"
                      : "review-decision-option"
                  }
                >
                  <input
                    type="radio"
                    name={reviewDecisionKey(reviewScope, fact)}
                    value={option.key}
                    checked={decision === option.value}
                    onChange={() => onDecisionChange(option.value)}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
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
  const [locale, setLocale] = useState<Locale>("zh");
  const [source, setSource] = useState(examples.zh.source);
  const [revision, setRevision] = useState(examples.zh.revision);
  const [required, setRequired] = useState(examples.zh.required);
  const [checkedInput, setCheckedInput] = useState({
    source: examples.zh.source,
    revision: examples.zh.revision,
    required: examples.zh.required,
  });
  const [comparison, setComparison] = useState(() =>
    compareFacts(examples.zh.source, examples.zh.revision, examples.zh.required),
  );
  const [hasRun, setHasRun] = useState(true);
  const [filter, setFilter] = useState<Filter>("actionable");
  const [reviewDecisions, setReviewDecisions] = useState<ReviewDecisions>({});
  const [resultPage, setResultPage] = useState(1);
  const [requiredPage, setRequiredPage] = useState(1);
  const [reportFeedback, setReportFeedback] = useState("");
  const [comparisonFeedback, setComparisonFeedback] = useState("");
  const [comparisonError, setComparisonError] = useState("");
  const [busy, setBusy] = useState(false);
  const [focusResultsAfterRun, setFocusResultsAfterRun] = useState(false);
  const [requiredNotInSourceCount, setRequiredNotInSourceCount] = useState(() =>
    countRequiredNotInSource(examples.zh.source, examples.zh.required),
  );
  const reportFeedbackTimer = useRef<number | undefined>(undefined);
  const resultsHeading = useRef<HTMLHeadingElement | null>(null);
  const automaticResultsHeading = useRef<HTMLHeadingElement | null>(null);
  const requiredResultsHeading = useRef<HTMLHeadingElement | null>(null);
  const localeRef = useRef(locale);
  const workerRef = useRef<Worker | null>(null);
  const requestSequence = useRef(0);
  const pendingRef = useRef<
    { requestId: number; input: CompareInput; worker: Worker } | undefined
  >(undefined);
  const t = copy[locale];
  localeRef.current = locale;

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
    workerRef.current?.terminate();
    workerRef.current = null;
    pendingRef.current = undefined;
    setBusy(false);
    setFocusResultsAfterRun(false);
    setComparisonFeedback("");
  };

  const updateInput = (
    setter: (value: string) => void,
    value: string,
  ) => {
    if (workerRef.current) cancelPendingComparison();
    setComparisonError("");
    setter(value);
  };

  const loadExample = () => {
    cancelPendingComparison();
    const example = examples[locale];
    setSource(example.source);
    setRevision(example.revision);
    setRequired(example.required);
    setCheckedInput(example);
    setComparison(
      compareFacts(example.source, example.revision, example.required),
    );
    setReviewDecisions({});
    setHasRun(true);
    setFilter("actionable");
    setResultPage(1);
    setRequiredPage(1);
    setComparisonError("");
    setComparisonFeedback("");
    setFocusResultsAfterRun(false);
  };

  const clearAll = () => {
    cancelPendingComparison();
    setSource("");
    setRevision("");
    setRequired("");
    setCheckedInput({ source: "", revision: "", required: "" });
    setComparison(compareFacts("", "", ""));
    setReviewDecisions({});
    setHasRun(false);
    setFilter("all");
    setResultPage(1);
    setRequiredPage(1);
    setComparisonError("");
    setComparisonFeedback("");
  };

  const runComparison = () => {
    if (busy || pendingRef.current) return;
    const input = { source, revision, required };
    const requestId = ++requestSequence.current;
    let worker: Worker;

    try {
      worker = new Worker(
        new URL("./workers/compare.worker.ts", import.meta.url),
        { type: "module", name: "keepfacts-compare" },
      );
    } catch {
      setComparisonError(copy[localeRef.current].compareFailed);
      setComparisonFeedback("");
      return;
    }

    const isCurrent = () =>
      workerRef.current === worker &&
      pendingRef.current?.worker === worker &&
      pendingRef.current.requestId === requestId;
    const finishError = () => {
      if (!isCurrent()) return;
      worker.terminate();
      workerRef.current = null;
      pendingRef.current = undefined;
      setBusy(false);
      setComparisonError(copy[localeRef.current].compareFailed);
      setComparisonFeedback("");
    };

    worker.onmessage = ({ data }: MessageEvent<CompareWorkerResponse>) => {
      if (!isCurrent() || data.requestId !== requestId) return;
      if (data.type === "error") {
        finishError();
        return;
      }

      worker.terminate();
      workerRef.current = null;
      pendingRef.current = undefined;
      setBusy(false);
      setComparison(data.comparison);
      setReviewDecisions({});
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
      const currentCopy = copy[localeRef.current];
      setComparisonFeedback(
        currentCopy.resultReady(
          data.comparison.sourceFacts.length,
          data.comparison.reviewCount,
          data.comparison.addedCount,
          data.comparison.requiredMissingCount +
          data.comparison.requiredNotInSourceCount,
        ),
      );
      setFocusResultsAfterRun(true);
    };
    worker.onerror = finishError;
    worker.onmessageerror = finishError;
    workerRef.current = worker;
    pendingRef.current = { requestId, input, worker };
    setBusy(true);
    setComparisonError("");
    setComparisonFeedback(t.comparing);
    const request: CompareWorkerRequest = { type: "compare", requestId, input };
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
    reportFeedbackTimer.current = window.setTimeout(() => {
      setReportFeedback("");
      reportFeedbackTimer.current = undefined;
    }, 2400);
  };

  const reportMarkdown = () =>
    buildMarkdownReport(comparison, locale, {
      appVersion: APP_VERSION,
      commitSha: APP_COMMIT_SHA,
      reviewDecisions,
    });

  const setFactDecision = (
    scope: ReviewScope,
    fact: Fact,
    decision?: ReviewDecision,
  ) => {
    const key = reviewDecisionKey(scope, fact);
    setReviewDecisions((current) => {
      if (decision) return { ...current, [key]: decision };
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const manualSummary = summarizeReviews(comparison, reviewDecisions);
  const focusPageHeading = (heading: HTMLHeadingElement | null) => {
    window.requestAnimationFrame(() => {
      heading?.focus({ preventScroll: true });
      heading?.scrollIntoView({ behavior: "auto", block: "start" });
    });
  };
  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(reportMarkdown());
      showReportFeedback(t.copied);
    } catch {
      showReportFeedback(t.copyFailed);
    }
  };

  const downloadReport = () => {
    const blob = new Blob([reportMarkdown()], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `keepfacts-report-${formatLocalDate(new Date())}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    showReportFeedback(t.downloaded);
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
      label: t.reviewItems,
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
    <main>
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
            onClick={() => setLocale(locale === "zh" ? "en" : "zh")}
          >
            {t.changeLanguage}
          </button>
        </div>
      </header>

      <section className="hero" id="top">
        <p className="eyebrow">{t.eyebrow}</p>
        <h1>
          {t.titleA}
          <br />
          <span>{t.titleB}</span>
        </h1>
        <p className="hero-copy">{t.intro}</p>
      </section>

      <section className="checker" aria-label={t.eyebrow}>
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
              aria-label={t.source}
              value={source}
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
            <button type="button" className="text-button" onClick={loadExample}>
              {t.loadExample}
            </button>
            <span aria-hidden="true">·</span>
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
              <p className="eyebrow">03 · {t.resultTitle}</p>
              <h2 ref={resultsHeading} tabIndex={-1}>{t.resultTitle}</h2>
              <p>{t.resultIntro}</p>
            </div>
            <div className="result-tools">
              <div className="report-actions" aria-label={t.resultTitle}>
                <button
                  type="button"
                  onClick={copyReport}
                  disabled={busy || resultsOutdated}
                >
                  {t.copyReport}
                </button>
                <button
                  type="button"
                  onClick={downloadReport}
                  disabled={busy || resultsOutdated}
                >
                  {t.downloadReport}
                </button>
              </div>
              <span className="report-feedback" role="status" aria-live="polite">
                {reportFeedback}
              </span>
              <div
                className="score-ring"
                aria-label={`${t.score} ${retentionLabel}`}
              >
                <span>{retentionLabel}</span>
                <small>{t.score}</small>
              </div>
            </div>
          </div>

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

          {manualSummary.total ? (
            <section
              className="manual-review-summary"
              aria-labelledby="manual-review-title"
            >
              <div className="manual-review-heading">
                <div>
                  <h3 id="manual-review-title">{t.manualReview}</h3>
                  <p>{t.manualReviewHint}</p>
                </div>
                <strong aria-live="polite" aria-atomic="true">
                  {manualSummary.total - manualSummary.pending}/{manualSummary.total}
                </strong>
              </div>
              <div className="manual-summary-grid">
                <div className="summary-card summary-neutral">
                  <span>{t.manualTotal}</span>
                  <strong>{manualSummary.total}</strong>
                </div>
                <div className="summary-card summary-warning">
                  <span>{t.manualPending}</span>
                  <strong>{manualSummary.pending}</strong>
                </div>
                <div className="summary-card summary-confirmed">
                  <span>{t.manualConfirmed}</span>
                  <strong>{manualSummary.confirmed}</strong>
                </div>
                <div className="summary-card summary-success">
                  <span>{t.manualAccepted}</span>
                  <strong>{manualSummary.accepted}</strong>
                </div>
                <div className="summary-card summary-ignored">
                  <span>{t.manualIgnored}</span>
                  <strong>{manualSummary.ignored}</strong>
                </div>
              </div>
            </section>
          ) : null}

          {comparison.requiredCount ? (
            <section className="required-results" aria-label={t.requiredResults}>
              <div className="required-results-heading">
                <div>
                  <p className="eyebrow">{t.requiredResults}</p>
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
              <div className="required-result-list">
                {pagedRequiredFacts.map((fact) => (
                  <ResultCard
                    key={fact.id}
                    fact={fact}
                    locale={locale}
                    reviewScope={fact.status === "review" ? "required" : undefined}
                    decision={reviewDecisions[reviewDecisionKey("required", fact)]}
                    onDecisionChange={
                      fact.status === "review"
                        ? (decision) => setFactDecision("required", fact, decision)
                        : undefined
                    }
                    reviewDisabled={busy || resultsOutdated}
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

            <div className="result-list">
            {pagedItems.map(({ fact, added }) =>
              added ? (
                  <ResultCard
                    key={`added-${fact.id}`}
                    fact={fact}
                    locale={locale}
                    added
                    reviewScope="added"
                    decision={reviewDecisions[reviewDecisionKey("added", fact)]}
                    onDecisionChange={(decision) =>
                      setFactDecision("added", fact, decision)
                    }
                    reviewDisabled={busy || resultsOutdated}
                  />
                ) : (
                  <ResultCard
                    key={fact.id}
                    fact={fact}
                    locale={locale}
                    reviewScope={fact.status === "review" ? "source" : undefined}
                    decision={reviewDecisions[reviewDecisionKey("source", fact)]}
                    onDecisionChange={
                      fact.status === "review"
                        ? (decision) => setFactDecision("source", fact, decision)
                        : undefined
                    }
                    reviewDisabled={busy || resultsOutdated}
                  />
                ),
            )}
            {visibleCount === 0 ? (
              <div className="empty-state">
                <span aria-hidden="true">◎</span>
                <h3>{t.emptyTitle}</h3>
                <p>{t.emptyBody}</p>
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
          {t.footerPrefix} v{APP_VERSION} · {t.footer}
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
