import { compareFacts, extractFacts } from "../lib/facts";
import { getKeepFactsInputLimitViolation } from "../lib/input-limits";
import type {
  CompareWorkerRequest,
  CompareWorkerResponse,
} from "./compare.protocol";

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<CompareWorkerRequest>) => void) | null;
  postMessage: (message: CompareWorkerResponse) => void;
};

workerScope.onmessage = ({ data }) => {
  if (data.type !== "compare") return;

  try {
    if (getKeepFactsInputLimitViolation(data.input)) {
      throw new RangeError("input-limit-exceeded");
    }
    if (data.limits) {
      const requiredItems = data.input.required
        .split(/\r?\n/u)
        .map((item) => item.trim())
        .filter(Boolean);
      if (
        extractFacts(data.input.source).length > data.limits.maxFactsPerSide ||
        extractFacts(data.input.revision).length > data.limits.maxFactsPerSide ||
        requiredItems.length > data.limits.maxRequiredItems
      ) {
        throw new RangeError("comparison-limit-exceeded");
      }
    }
    workerScope.postMessage({
      type: "result",
      requestId: data.requestId,
      comparison: compareFacts(
        data.input.source,
        data.input.revision,
        data.input.required,
      ),
    });
  } catch (error) {
    workerScope.postMessage({
      type: "error",
      requestId: data.requestId,
      message: error instanceof Error ? error.message : "Comparison failed",
    });
  }
};
