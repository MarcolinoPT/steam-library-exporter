import { describe, expect, it, vi } from "vitest";
import { normalizeAppIds, parseAppId } from "../../src/domain/app-id.js";

describe("parseAppId", () => {
  it("parseAppId_PositiveSafeInteger_ReturnsCanonicalString", () => {
    expect(parseAppId(440)).toEqual({ success: true, value: "440" });
  });

  it("parseAppId_DigitOnlyString_ReturnsCanonicalString", () => {
    expect(parseAppId("570")).toEqual({ success: true, value: "570" });
  });

  it("parseAppId_LeadingZeroes_RemovesLeadingZeroes", () => {
    expect(parseAppId("000440")).toEqual({ success: true, value: "440" });
  });

  it("parseAppId_Zero_ReturnsOutOfRange", () => {
    expect(parseAppId("0")).toEqual({ success: false, reason: "out-of-range" });
    expect(parseAppId(0)).toEqual({ success: false, reason: "out-of-range" });
  });

  it("parseAppId_NegativeNumber_ReturnsOutOfRange", () => {
    expect(parseAppId(-1)).toEqual({ success: false, reason: "out-of-range" });
  });

  it("parseAppId_MaxSafeInteger_ReturnsCanonicalString", () => {
    expect(parseAppId(Number.MAX_SAFE_INTEGER)).toEqual({
      success: true,
      value: "9007199254740991",
    });
    expect(parseAppId("9007199254740991")).toEqual({
      success: true,
      value: "9007199254740991",
    });
  });

  it("parseAppId_UnsafeInteger_ReturnsOutOfRange", () => {
    expect(parseAppId(Number.MAX_SAFE_INTEGER + 1)).toEqual({
      success: false,
      reason: "out-of-range",
    });
    expect(parseAppId("9007199254740992")).toEqual({
      success: false,
      reason: "out-of-range",
    });
  });

  it("parseAppId_OverlongDigitString_ReturnsOutOfRangeBeforeBigIntConversion", () => {
    const originalBigInt = globalThis.BigInt;
    vi.stubGlobal(
      "BigInt",
      (() => {
        throw new Error("BigInt should not parse an overlong AppID");
      }) as unknown as typeof BigInt,
    );

    try {
      expect(parseAppId("10000000000000000")).toEqual({
        success: false,
        reason: "out-of-range",
      });
    } finally {
      vi.stubGlobal("BigInt", originalBigInt);
    }
  });

  it("parseAppId_NaNOrFraction_ReturnsOutOfRange", () => {
    for (const value of [NaN, 1.5]) {
      expect(parseAppId(value)).toEqual({ success: false, reason: "out-of-range" });
    }
  });

  it("parseAppId_NonDigitOrWhitespaceString_ReturnsInvalidFormat", () => {
    for (const value of ["", " 440", "440 ", "+440", "-440", "44.0", "abc", "1e3", "0x10", "４４０"]) {
      expect(parseAppId(value)).toEqual({ success: false, reason: "invalid-format" });
    }
  });

  it("parseAppId_UnsupportedInputShape_ReturnsInvalidType", () => {
    expect(parseAppId(null)).toEqual({ success: false, reason: "invalid-type" });
    expect(parseAppId({ appid: 440 })).toEqual({ success: false, reason: "invalid-type" });
    expect(parseAppId(["440"])).toEqual({ success: false, reason: "invalid-type" });
  });
});

describe("normalizeAppIds", () => {
  it("normalizeAppIds_DuplicateValues_KeepsFirstOccurrence", () => {
    expect(normalizeAppIds([440, "440", "00440", 570])).toEqual({
      appIds: ["440", "570"],
      invalid: [],
    });
  });

  it("normalizeAppIds_MixedValidAndInvalidValues_ReportsInvalidIndexes", () => {
    expect(normalizeAppIds([440, "bad", 0, "570"])).toEqual({
      appIds: ["440", "570"],
      invalid: [
        { index: 1, reason: "invalid-format" },
        { index: 2, reason: "out-of-range" },
      ],
    });
  });

  it("normalizeAppIds_InvalidValuesAfterDuplicates_ReportsOriginalIndexes", () => {
    expect(normalizeAppIds([440, "440", "x", 440, 0])).toEqual({
      appIds: ["440"],
      invalid: [
        { index: 2, reason: "invalid-format" },
        { index: 4, reason: "out-of-range" },
      ],
    });
  });

  it("normalizeAppIds_EmptyInput_ReturnsEmptyResult", () => {
    expect(normalizeAppIds([])).toEqual({ appIds: [], invalid: [] });
  });

  it("normalizeAppIds_SparseInput_ReportsMissingEntryAsInvalid", () => {
    expect(normalizeAppIds([440, , 570])).toEqual({
      appIds: ["440", "570"],
      invalid: [{ index: 1, reason: "invalid-type" }],
    });
  });
});
