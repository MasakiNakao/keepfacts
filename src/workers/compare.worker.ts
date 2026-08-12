import { compareFacts } from "../lib/facts";
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
