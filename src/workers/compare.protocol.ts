import type { FactComparison } from "../lib/facts";

export interface CompareInput {
  source: string;
  revision: string;
  required: string;
}

export interface CompareWorkerRequest {
  type: "compare";
  requestId: number;
  input: CompareInput;
  /** Optional safety guard checked before the O(n³) pairing stage. */
  limits?: {
    maxFactsPerSide: number;
    maxRequiredItems: number;
  };
}

export type CompareWorkerResponse =
  | {
      type: "result";
      requestId: number;
      comparison: FactComparison;
    }
  | {
      type: "error";
      requestId: number;
      message: string;
    };
