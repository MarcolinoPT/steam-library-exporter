import { describe, expect, it } from "vitest";
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

  it("parseAppId_NonDigitOrWhitespaceString_ReturnsInvalidFormat", () => {
    for (const value of ["", " 440", "440 ", "+440", "-440", "44.0", "abc"]) {
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

  it("normalizeAppIds_EmptyInput_ReturnsEmptyResult", () => {
    expect(normalizeAppIds([])).toEqual({ appIds: [], invalid: [] });
  });
});
