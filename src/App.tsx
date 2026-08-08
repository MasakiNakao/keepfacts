import { useMemo, useState } from "react";
import {
  compareFacts,
  type ComparedFact,
  type Fact,
  type FactKind,
} from "./lib/facts";

type Locale = "zh" | "en";
type Filter = "all" | "review" | "preserved" | "added";

const examples = {
  zh: {
    source:
      "星河工作室将在2026年9月15日发布 v1.2.0。首批预算为 ¥30,000，计划邀请100名测试用户，目标转化率为12.5%。问题请发送至 hello@example.com，项目说明见 https://example.com/launch。",
    revision:
      "星河工作室计划在2026年9月18日发布 v1.2.0。首批预算为3万元，计划邀请80名测试用户，目标转化率为12.5%。如有问题，请发送邮件至 hello@example.com。",
  },
  en: {
    source:
      "Northstar Studio will release v1.2.0 on September 15, 2026. The initial budget is $30,000, with 100 test users and a 12.5% conversion target. Contact hello@example.com or visit https://example.com/launch.",
    revision:
      "Northstar Studio plans to release v1.2.0 on September 18, 2026. The initial budget is $30,000, with 80 test users and a 12.5% conversion target. Questions can be sent to hello@example.com.",
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
    chars: "字符",
    placeholderSource: "在这里粘贴原文……",
    placeholderRevision: "在这里粘贴改写稿……",
    loadExample: "载入示例",
    clear: "清空",
    compare: "开始核对",
    compareHint: "无需模型或 API Key，结果可解释",
    resultTitle: "核对结果",
    resultIntro: "先看需要人工确认的项目，再决定是否接受这次改写。",
    scanned: "原文硬事实",
    preserved: "已保留",
    review: "需确认",
    added: "改写新增",
    score: "保留率",
    all: "全部",
    emptyTitle: "还没有可核对的事实",
    emptyBody: "请在左右两侧粘贴文本，或载入示例查看效果。",
    preservedNote: "改写稿中找到等价事实",
    possibleChange: "可能改成了",
    missingNote: "改写稿中未找到对应事实",
    addedNote: "只在改写稿中出现",
    sourceContext: "原文语境",
    revisionContext: "改写语境",
    disclaimer:
      "KeepFacts 当前只检查可精确比对的硬事实，不判断整段文字的语义是否正确。黄色项目需要你人工确认。",
    footer: "实验版 v0.1 · 确定性规则 · 无追踪代码",
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
    chars: "characters",
    placeholderSource: "Paste the source text here…",
    placeholderRevision: "Paste the rewritten text here…",
    loadExample: "Load example",
    clear: "Clear",
    compare: "Check the facts",
    compareHint: "No model or API key. Every result is explainable.",
    resultTitle: "Fact check",
    resultIntro: "Review flagged items before accepting the rewrite.",
    scanned: "Source facts",
    preserved: "Preserved",
    review: "Review",
    added: "New in rewrite",
    score: "Retention",
    all: "All",
    emptyTitle: "No comparable facts yet",
    emptyBody: "Paste text into both fields, or load the example to see it work.",
    preservedNote: "Equivalent fact found in the rewrite",
    possibleChange: "Possibly changed to",
    missingNote: "No corresponding fact found in the rewrite",
    addedNote: "Appears only in the rewrite",
    sourceContext: "Source context",
    revisionContext: "Rewrite context",
    disclaimer:
      "KeepFacts currently checks exact, extractable facts only. It does not judge whether the full meaning is correct. Yellow items need human review.",
    footer: "Experimental v0.1 · Deterministic rules · No tracking",
    changeLanguage: "中文",
  },
};

const kindLabels: Record<Locale, Record<FactKind, string>> = {
  zh: {
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
  const contextLabel = added ? t.revisionContext : t.sourceContext;
  const statusText =
    status === "preserved"
      ? t.preservedNote
      : status === "added"
        ? t.addedNote
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
            <code className="fact-value">{fact.raw}</code>
            {status === "review" && compared.possibleMatch ? (
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
        <details className="context-details">
          <summary>{contextLabel}</summary>
          <p>{fact.context}</p>
          {status === "review" && compared.possibleMatch ? (
            <>
              <strong>{t.revisionContext}</strong>
              <p>{compared.possibleMatch.context}</p>
            </>
          ) : null}
        </details>
      </div>
    </article>
  );
}

export default function Home() {
  const [locale, setLocale] = useState<Locale>("zh");
  const [source, setSource] = useState(examples.zh.source);
  const [revision, setRevision] = useState(examples.zh.revision);
  const [hasRun, setHasRun] = useState(true);
  const [filter, setFilter] = useState<Filter>("review");
  const t = copy[locale];

  const comparison = useMemo(
    () => compareFacts(source, revision),
    [source, revision],
  );
  const total = comparison.sourceFacts.length;
  const retention = total
    ? Math.round((comparison.preservedCount / total) * 100)
    : 0;

  const loadExample = () => {
    setSource(examples[locale].source);
    setRevision(examples[locale].revision);
    setHasRun(true);
    setFilter("review");
  };

  const clearAll = () => {
    setSource("");
    setRevision("");
    setHasRun(false);
    setFilter("all");
  };

  const runComparison = () => {
    setHasRun(true);
    setFilter(comparison.reviewCount ? "review" : "all");
    window.requestAnimationFrame(() => {
      document
        .getElementById("results")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
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
          <span className="version-tag">v0.1</span>
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
      </section>

      {hasRun ? (
        <section className="results-section" id="results">
          <div className="results-heading-row">
            <div>
              <p className="eyebrow">03 · {t.resultTitle}</p>
              <h2>{t.resultTitle}</h2>
              <p>{t.resultIntro}</p>
            </div>
            <div className="score-ring" aria-label={`${t.score} ${retention}%`}>
              <span>{retention}%</span>
              <small>{t.score}</small>
            </div>
          </div>

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
        <p>{t.footer}</p>
      </footer>
    </main>
  );
}
