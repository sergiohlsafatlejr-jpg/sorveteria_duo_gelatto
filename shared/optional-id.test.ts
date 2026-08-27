import { describe, expect, it } from "vitest";
import { toOptionalPositiveId } from "./optional-id";

describe("toOptionalPositiveId", () => {
  it("converte identificadores válidos", () => {
    expect(toOptionalPositiveId("1")).toBe(1);
    expect(toOptionalPositiveId(27)).toBe(27);
  });

  it("remove valores vazios e sentinelas", () => {
    expect(toOptionalPositiveId(undefined)).toBeUndefined();
    expect(toOptionalPositiveId(null)).toBeUndefined();
    expect(toOptionalPositiveId("")).toBeUndefined();
    expect(toOptionalPositiveId("none")).toBeUndefined();
  });

  it("impede NaN e números que não representam IDs", () => {
    expect(toOptionalPositiveId(NaN)).toBeUndefined();
    expect(toOptionalPositiveId("NaN")).toBeUndefined();
    expect(toOptionalPositiveId("texto")).toBeUndefined();
    expect(toOptionalPositiveId(0)).toBeUndefined();
    expect(toOptionalPositiveId(-1)).toBeUndefined();
    expect(toOptionalPositiveId(1.5)).toBeUndefined();
  });
});
