import { describe, expect, it } from "vitest";
import {
  canManageBillingSubmissions,
  lastUpdatedAt,
  submitterDisplay,
} from "./billingSubmissionUtils.js";

describe("billingSubmissionUtils", () => {
  it("canManageBillingSubmissions matches admin email", () => {
    expect(canManageBillingSubmissions({ username: "wkim@urologymedical.com" })).toBe(true);
    expect(canManageBillingSubmissions({ username: "other@test.com" })).toBe(false);
  });

  it("submitterDisplay prefers email over username", () => {
    expect(
      submitterDisplay({
        submitter_email: "billing@urologymedical.com",
        submitted_by: "wkim@urologymedical.com",
      })
    ).toBe("billing@urologymedical.com");
    expect(submitterDisplay({ submitted_by: "wkim@urologymedical.com" })).toBe(
      "wkim@urologymedical.com"
    );
  });

  it("lastUpdatedAt falls back to submitted_at", () => {
    expect(lastUpdatedAt({ submitted_at: "2026-05-01T10:00:00+00:00" })).toBe(
      "2026-05-01T10:00:00+00:00"
    );
    expect(
      lastUpdatedAt({
        submitted_at: "2026-05-01T10:00:00+00:00",
        updated_at: "2026-05-10T15:00:00+00:00",
      })
    ).toBe("2026-05-10T15:00:00+00:00");
  });
});
