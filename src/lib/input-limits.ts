export const KEEPFACTS_MAX_TEXT_LENGTH = 250_000;
export const KEEPFACTS_MAX_REQUIRED_LENGTH = 100_000;
export const KEEPFACTS_MAX_REQUIRED_ITEMS = 1_000;
export const KEEPFACTS_MAX_REQUIRED_ITEM_LENGTH = 500;

export interface KeepFactsInput {
  source: string;
  revision: string;
  required: string;
}

export type KeepFactsInputLimitReason =
  | "text-length"
  | "required-length"
  | "required-items"
  | "required-item-length";

export interface KeepFactsInputLimitViolation {
  code: "input-limit-exceeded";
  field: keyof KeepFactsInput;
  reason: KeepFactsInputLimitReason;
  actual: number;
  maximum: number;
  /** Zero-based index in the unfiltered required-text line list. */
  itemIndex?: number;
}

export function getKeepFactsInputLimitViolation(
  input: KeepFactsInput,
): KeepFactsInputLimitViolation | undefined {
  if (input.source.length > KEEPFACTS_MAX_TEXT_LENGTH) {
    return {
      code: "input-limit-exceeded",
      field: "source",
      reason: "text-length",
      actual: input.source.length,
      maximum: KEEPFACTS_MAX_TEXT_LENGTH,
    };
  }
  if (input.revision.length > KEEPFACTS_MAX_TEXT_LENGTH) {
    return {
      code: "input-limit-exceeded",
      field: "revision",
      reason: "text-length",
      actual: input.revision.length,
      maximum: KEEPFACTS_MAX_TEXT_LENGTH,
    };
  }
  if (input.required.length > KEEPFACTS_MAX_REQUIRED_LENGTH) {
    return {
      code: "input-limit-exceeded",
      field: "required",
      reason: "required-length",
      actual: input.required.length,
      maximum: KEEPFACTS_MAX_REQUIRED_LENGTH,
    };
  }

  const requiredItems = input.required
    .split(/\r?\n/u)
    .map((item, itemIndex) => ({ item: item.trim(), itemIndex }))
    .filter(({ item }) => Boolean(item));
  if (requiredItems.length > KEEPFACTS_MAX_REQUIRED_ITEMS) {
    return {
      code: "input-limit-exceeded",
      field: "required",
      reason: "required-items",
      actual: requiredItems.length,
      maximum: KEEPFACTS_MAX_REQUIRED_ITEMS,
    };
  }

  const oversizedItem = requiredItems.find(
    ({ item }) => item.length > KEEPFACTS_MAX_REQUIRED_ITEM_LENGTH,
  );
  if (oversizedItem) {
    return {
      code: "input-limit-exceeded",
      field: "required",
      reason: "required-item-length",
      actual: oversizedItem.item.length,
      maximum: KEEPFACTS_MAX_REQUIRED_ITEM_LENGTH,
      itemIndex: oversizedItem.itemIndex,
    };
  }

  return undefined;
}
