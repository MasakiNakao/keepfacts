import { compareFacts } from "../lib/facts";
import {
  getKeepFactsInputLimitViolation,
  splitKeepFactsRequiredLines,
} from "../lib/input-limits";
import type {
  CompareWorkerRequest,
  CompareWorkerResponse,
} from "./compare.protocol";

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<CompareWorkerRequest>) => void) | null;
  postMessage: (message: CompareWorkerResponse) => void;
};

workerScope.onmessage = ({ data }) => {
  if (!data || data.type !== "compare") return;

  try {
    if (getKeepFactsInputLimitViolation(data.input)) {
      throw new RangeError("input-limit-exceeded");
    }
    if (data.limits) {
      if (
        !Number.isSafeInteger(data.limits.maxFactsPerSide) ||
        data.limits.maxFactsPerSide < 0 ||
        !Number.isSafeInteger(data.limits.maxRequiredItems) ||
        data.limits.maxRequiredItems < 0
      ) {
        throw new RangeError("comparison-limit-exceeded");
      }
      const requiredItems = splitKeepFactsRequiredLines(data.input.required)
        .map((item) => item.trim())
        .filter(Boolean);
      if (requiredItems.length > data.limits.maxRequiredItems) {
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
        { maxFactsPerSide: data.limits?.maxFactsPerSide },
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
