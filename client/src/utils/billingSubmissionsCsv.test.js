import { describe, expect, it } from "vitest";
import { buildBillingSubmissionsCsv } from "./billingSubmissionsCsv.js";

describe("buildBillingSubmissionsCsv", () => {
  it("exports metadata only in readable Pacific time", () => {
    const csv = buildBillingSubmissionsCsv([
      {
        id: "sub-1",
        submitted_at: "2026-05-28T12:00:00+00:00",
        patient_name: "Jane Doe",
        patient_dob: "1990-01-01",
        provider_name: "Dr. Smith",
        location: "North Pod",
        date_of_service: "2026-05-10",
        cpt_code: "51798",
        icd10_code: "N40.1",
        processed: true,
        submitter_email: "billing@urologymedical.com",
        submitted_by: "wkim@urologymedical.com",
        billing_sheet_storage_key: "billing_sheets/sub-1.png",
      },
    ]);

    expect(csv).toContain("Last Updated");
    expect(csv).toContain("Processed");
    expect(csv).toContain("Yes");
    expect(csv).toMatch(/May 28, 2026/);
    expect(csv).toContain("billing@urologymedical.com");
    expect(csv).not.toContain("billing_sheets");
    expect(csv).not.toContain("Submitter Email");
  });

  it("joins multiple CPT lines with commas", () => {
    const csv = buildBillingSubmissionsCsv([
      {
        id: "sub-3",
        submitted_at: "2026-05-01T10:00:00+00:00",
        cpt_lines: [
          { code: "99222", modifiers: ["25"] },
          { code: "51703", modifiers: [] },
        ],
        icd10_code: "N33.9",
      },
    ]);
    expect(csv).toContain("99222-25, 51703");
    expect(csv).not.toContain("·");
  });

  it("escapes commas and quotes in cell values", () => {
    const csv = buildBillingSubmissionsCsv([
      {
        id: "sub-2",
        patient_name: 'Doe, "Jane"',
        submitted_at: "2026-05-01T10:00:00+00:00",
      },
    ]);
    expect(csv).toContain('"Doe, ""Jane"""');
  });
});
