/**
 * A normalized Steam application identifier.
 *
 * AppIDs are positive safe integers represented as canonical decimal strings.
 */
export type AppId = string;

export type AppIdInput = number | string;

export type AppIdParseResult =
  | { readonly success: true; readonly value: AppId }
  | { readonly success: false; readonly reason: "invalid-type" | "invalid-format" | "out-of-range" };

/**
 * Parses a numeric or digit-only string AppID without lossy coercion.
 *
 * Leading zeroes are accepted and removed during normalization. Whitespace,
 * signs, decimal points, empty strings, zero, and unsafe integers are rejected.
 */
export function parseAppId(input: unknown): AppIdParseResult {
  if (typeof input === "number") {
    if (!Number.isSafeInteger(input) || input <= 0) {
      return { success: false, reason: "out-of-range" };
    }

    return { success: true, value: String(input) };
  }

  if (typeof input !== "string") {
    return { success: false, reason: "invalid-type" };
  }

  if (!/^\d+$/.test(input)) {
    return { success: false, reason: "invalid-format" };
  }

  const normalized = input.replace(/^0+(?=\d)/, "");
  if (normalized === "0") {
    return { success: false, reason: "out-of-range" };
  }

  // BigInt avoids precision loss while checking digit-string input.
  if (BigInt(normalized) > BigInt(Number.MAX_SAFE_INTEGER)) {
    return { success: false, reason: "out-of-range" };
  }

  return { success: true, value: normalized };
}

/**
 * Parses a collection of AppID inputs, preserving first-seen order and
 * removing duplicates after canonical normalization.
 *
 * Invalid values are returned separately so callers cannot mistake a partial
 * result for a fully valid collection.
 */
export function normalizeAppIds(
  inputs: readonly unknown[],
): { readonly appIds: readonly AppId[]; readonly invalid: readonly { index: number; reason: AppIdParseResult extends infer R ? R extends { success: false; reason: infer E } ? E : never : never }[] } {
  const appIds: AppId[] = [];
  const invalid: { index: number; reason: "invalid-type" | "invalid-format" | "out-of-range" }[] = [];
  const seen = new Set<AppId>();

  inputs.forEach((input, index) => {
    const result = parseAppId(input);
    if (!result.success) {
      invalid.push({ index, reason: result.reason });
      return;
    }

    if (!seen.has(result.value)) {
      seen.add(result.value);
      appIds.push(result.value);
    }
  });

  return { appIds, invalid };
}
