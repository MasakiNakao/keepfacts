import type { ComparedFact, Fact, FactComparison } from "./facts";

export type ReviewDecision = "confirmed" | "accepted" | "ignored";
export type ReviewScope = "source" | "required" | "added";
export type ReviewDecisions = Partial<Record<string, ReviewDecision>>;

export interface ReviewItem {
  key: string;
  scope: ReviewScope;
  fact: Fact | ComparedFact;
}

export interface ReviewSummary {
  total: number;
  pending: number;
  confirmed: number;
  accepted: number;
  ignored: number;
}

export function reviewDecisionKey(scope: ReviewScope, fact: Fact) {
  return `${scope}:${fact.id}`;
}

export function getReviewItems(comparison: FactComparison): ReviewItem[] {
  return [
    ...comparison.sourceFacts
      .filter((fact) => fact.status === "review")
      .map((fact) => ({
        key: reviewDecisionKey("source", fact),
        scope: "source" as const,
        fact,
      })),
    ...comparison.requiredFacts
      .filter((fact) => fact.status === "review")
      .map((fact) => ({
        key: reviewDecisionKey("required", fact),
        scope: "required" as const,
        fact,
      })),
    ...comparison.addedFacts.map((fact) => ({
      key: reviewDecisionKey("added", fact),
      scope: "added" as const,
      fact,
    })),
  ];
}

export function summarizeReviews(
  comparison: FactComparison,
  decisions: ReviewDecisions,
): ReviewSummary {
  const items = getReviewItems(comparison);
  const summary: ReviewSummary = {
    total: items.length,
    pending: 0,
    confirmed: 0,
    accepted: 0,
    ignored: 0,
  };

  for (const item of items) {
    const decision = decisions[item.key];
    if (decision) summary[decision] += 1;
    else summary.pending += 1;
  }

  return summary;
}
