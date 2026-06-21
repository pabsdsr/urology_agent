import { beforeEach, describe, expect, it } from "vitest";
import {
  getRecentBillingCodes,
  recordBillingCodeUsage,
} from "./billingCodeUsage.js";

describe("billingCodeUsage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("ranks frequently used codes ahead of less-used codes", () => {
    recordBillingCodeUsage("cpt", "99213", "Office visit");
    recordBillingCodeUsage("cpt", "51798", "Ultrasound");
    recordBillingCodeUsage("cpt", "99213", "Office visit");
    recordBillingCodeUsage("cpt", "99213", "Office visit");

    expect(getRecentBillingCodes("cpt").map((item) => item.code)).toEqual([
      "99213",
      "51798",
    ]);
  });

  it("filters recent codes by the active query", () => {
    recordBillingCodeUsage("icd10", "N40.1", "BPH with LUTS");
    recordBillingCodeUsage("icd10", "N39.0", "UTI");

    expect(getRecentBillingCodes("icd10", { query: "N40" }).map((item) => item.code)).toEqual([
      "N40.1",
    ]);
  });
});
