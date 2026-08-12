import { useEffect, useMemo, useRef, useState } from "react";
import {
  compareFacts,
  type ComparedFact,
  type Fact,
  type FactKind,
} from "./lib/facts";
import { buildMarkdownReport, formatLocalDate } from "./lib/report";
import { APP_VERSION } from "./version";

type Locale = "zh" | "en";
type Filter = "all" | "review" | "preserved" | "added";

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
    compareHint: "点击后生成一份固定结果；修改内容后请重新核对",
    resultsOutdated: "输入内容已更改，以下仍是上次核对结果。请重新核对后再导出报告。",
    resultTitle: "核对结果",
    resultIntro: "先看需要人工确认的项目，再决定是否接受这次改写。",
    copyReport: "复制报告",
    downloadReport: "下载 Markdown",
    copied: "报告已复制",
    copyFailed: "复制失败，请使用下载功能",
    downloaded: "报告已下载",
    scanned: "自动事实",
    preserved: "已保留",
    review: "需确认",
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
    emptyTitle: "还没有可核对的事实",
    emptyBody: "请在左右两侧粘贴文本，或载入示例查看效果。",
    preservedNote: "改写稿中找到等价事实",
    possibleChange: "可能改成了",
    missingNote: "改写稿中未找到对应事实",
    invalidNote: "日期格式可识别，但数值超出有效范围",
    notInSourceNote: "原文中未找到，无法作为必须保留项核对",
    notInSourceAddedNote: "原文中未找到；仅在改写稿出现，不算作已保留",
    addedNote: "只在改写稿中出现",
    sourceContext: "原文语境",
    revisionContext: "改写语境",
    disclaimer:
      "KeepFacts 当前只检查可精确比对的硬事实，不判断整段文字的语义是否正确。黄色项目需要你人工确认。",
    footerPrefix: "实验版",
    footer: "确定性规则 · 无追踪代码",
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
    compareHint: "Creates a fixed result. Recheck after editing either text.",
    resultsOutdated:
      "The inputs changed. These are still the previous results; recheck before exporting.",
    resultTitle: "Fact check",
    resultIntro: "Review flagged items before accepting the rewrite.",
    copyReport: "Copy report",
    downloadReport: "Download Markdown",
    copied: "Report copied",
    copyFailed: "Copy failed. Please download the report instead.",
    downloaded: "Report downloaded",
    scanned: "Automatic facts",
    preserved: "Preserved",
    review: "Review",
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
    emptyTitle: "No comparable facts yet",
    emptyBody: "Paste text into both fields, or load the example to see it work.",
    preservedNote: "Equivalent fact found in the rewrite",
    possibleChange: "Possibly changed to",
    missingNote: "No corresponding fact found in the rewrite",
    invalidNote: "Date-like value found, but it is outside the valid calendar range",
    notInSourceNote: "Not found in the source, so it cannot be checked",
    notInSourceAddedNote:
      "Not found in the source; appearing only in the rewrite is not preservation",
    addedNote: "Appears only in the rewrite",
    sourceContext: "Source context",
    revisionContext: "Rewrite context",
    disclaimer:
      "KeepFacts currently checks exact, extractable facts only. It does not judge whether the full meaning is correct. Yellow items need human review.",
    footerPrefix: "Experimental",
    footer: "Deterministic rules · No tracking",
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
}: {
  fact: Fact | ComparedFact;
  locale: Locale;
  added?: boolean;
}) {
  const t = copy[locale];
  const compared = fact as ComparedFact;
  const status = added ? "added" : compared.status;
  const notInSource = compared.reviewReason === "not-in-source";
  const contextLabel =
    added || (notInSource && compared.matched)
      ? t.revisionContext
      : t.sourceContext;
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
  const context = notInSource ? compared.matched?.context : fact.context;

  return (
    <article className={`result-card result-${status}`}>
      <div className="result-marker" aria-hidden="true">
        {status === "preserved" ? "✓" : status === "added" ? "+" : "!"}
      </div>
      <div className="result-content">
        <div className="result-heading">
          <span className="kind-label">{kindLabels[locale][fact.kind]}</span>
          <div className="fact-comparison">
            <code className="fact-value">{fact.raw}</code>
            {status === "review" &&
            compared.possibleMatch &&
            compared.reviewReason !== "invalid" ? (
              <>
                <span className="comparison-arrow" aria-hidden="true">
                  →
                </span>
                <code className="fact-value fact-value-candidate">
                  {compared.possibleMatch.raw}
                </code>
              </>
            ) : null}
          </div>
        </div>
        <p className="status-note">{statusText}</p>
        {context ? (
          <details className="context-details">
            <summary>{contextLabel}</summary>
            <p>{context}</p>
            {status === "review" && compared.possibleMatch ? (
              <>
                <strong>{t.revisionContext}</strong>
                <p>{compared.possibleMatch.context}</p>
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
  const [hasRun, setHasRun] = useState(true);
  const [filter, setFilter] = useState<Filter>("review");
  const [reportFeedback, setReportFeedback] = useState("");
  const reportFeedbackTimer = useRef<number | undefined>(undefined);
  const t = copy[locale];

  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  }, [locale]);

  useEffect(
    () => () => {
      if (reportFeedbackTimer.current !== undefined) {
        window.clearTimeout(reportFeedbackTimer.current);
      }
    },
    [],
  );

  const comparison = useMemo(
    () =>
      compareFacts(
        checkedInput.source,
        checkedInput.revision,
        checkedInput.required,
      ),
    [checkedInput],
  );
  const draftComparison = useMemo(
    () => compareFacts(source, revision, required),
    [source, revision, required],
  );
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

  const loadExample = () => {
    const example = examples[locale];
    setSource(example.source);
    setRevision(example.revision);
    setRequired(example.required);
    setCheckedInput(example);
    setHasRun(true);
    setFilter("review");
  };

  const clearAll = () => {
    setSource("");
    setRevision("");
    setRequired("");
    setCheckedInput({ source: "", revision: "", required: "" });
    setHasRun(false);
    setFilter("all");
  };

  const runComparison = () => {
    setCheckedInput({ source, revision, required });
    setHasRun(true);
    setFilter(draftComparison.reviewCount ? "review" : "all");
    window.requestAnimationFrame(() => {
      document
        .getElementById("results")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
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

  const reportMarkdown = () => buildMarkdownReport(comparison, locale);

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
    return fact.status === filter;
  });
  const showAdded = filter === "all" || filter === "added";
  const visibleCount =
    visibleSourceFacts.length + (showAdded ? comparison.addedFacts.length : 0);

  const filters: Array<{ key: Filter; label: string; count: number }> = [
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
        <a className="brand" href="#top" aria-label="KeepFacts home">
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
              onChange={(event) => setSource(event.target.value)}
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
              onChange={(event) => setRevision(event.target.value)}
              placeholder={t.placeholderRevision}
              spellCheck="false"
            />
          </article>
        </div>

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
              disabled={!source.trim() || !revision.trim()}
            >
              <span className="button-step">03</span>
              {t.compare}
              <span aria-hidden="true">→</span>
            </button>
            <span>{t.compareHint}</span>
          </div>
        </div>

        <details className="required-panel">
          <summary>
            <span>{t.required}</span>
            <small>{t.requiredHint}</small>
          </summary>
          <textarea
            aria-label={t.required}
            value={required}
            onChange={(event) => setRequired(event.target.value)}
            placeholder={t.requiredPlaceholder}
            spellCheck="false"
          />
          <p className="required-input-feedback" role="status" aria-live="polite">
            {draftComparison.requiredNotInSourceCount
              ? t.requiredInputWarning(
                  draftComparison.requiredNotInSourceCount,
                )
              : ""}
          </p>
        </details>
      </section>

      {hasRun ? (
        <section className="results-section" id="results">
          <div className="results-heading-row">
            <div>
              <p className="eyebrow">03 · {t.resultTitle}</p>
              <h2>{t.resultTitle}</h2>
              <p>{t.resultIntro}</p>
            </div>
            <div className="result-tools">
              <div className="report-actions" aria-label={t.resultTitle}>
                <button
                  type="button"
                  onClick={copyReport}
                  disabled={resultsOutdated}
                >
                  {t.copyReport}
                </button>
                <button
                  type="button"
                  onClick={downloadReport}
                  disabled={resultsOutdated}
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

          {comparison.requiredCount ? (
            <section className="required-results" aria-label={t.requiredResults}>
              <div className="required-results-heading">
                <div>
                  <p className="eyebrow">{t.requiredResults}</p>
                  <h3>{t.requiredResults}</h3>
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
                {comparison.requiredFacts.map((fact) => (
                  <ResultCard key={fact.id} fact={fact} locale={locale} />
                ))}
              </div>
            </section>
          ) : null}

          <div className="filter-tabs" role="tablist" aria-label={t.resultTitle}>
            {filters.map((item) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={filter === item.key}
                className={filter === item.key ? "active" : ""}
                onClick={() => setFilter(item.key)}
              >
                {item.label}
                <span>{item.count}</span>
              </button>
            ))}
          </div>

          <div className="result-list">
            {visibleSourceFacts.map((fact) => (
              <ResultCard key={fact.id} fact={fact} locale={locale} />
            ))}
            {showAdded
              ? comparison.addedFacts.map((fact) => (
                  <ResultCard
                    key={`added-${fact.id}`}
                    fact={fact}
                    locale={locale}
                    added
                  />
                ))
              : null}
            {visibleCount === 0 ? (
              <div className="empty-state">
                <span aria-hidden="true">◎</span>
                <h3>{t.emptyTitle}</h3>
                <p>{t.emptyBody}</p>
              </div>
            ) : null}
          </div>

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
        </p>
      </footer>
    </main>
  );
}
