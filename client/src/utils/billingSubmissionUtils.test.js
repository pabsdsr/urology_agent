import { describe, expect, it } from "vitest";
import {
  formToSubmissionPayload,
  lastUpdatedAt,
  submissionToEditForm,
  submitterDisplay,
} from "./billingSubmissionUtils.js";

describe("billingSubmissionUtils", () => {
  it("normalizes billing dates to MM/DD/YYYY", () => {
    expect(
      submissionToEditForm({
        patient_name: "Jane",
        patient_dob: "1990-01-15",
        date_of_service: "2026-05-10",
        cpt_code: "51798",
        icd10_code: "N40.1",
      })
    ).toMatchObject({
      patientDob: "01/15/1990",
      dateOfService: "05/10/2026",
    });

    expect(
      formToSubmissionPayload({
        patientName: "Jane",
        patientDob: "1/15/1990",
        dateOfService: "5/10/2026",
        location: "North Pod",
        providerName: "Dr. U",
        cptLines: [{ code: "51798", modifiers: ["25"] }],
        icd10Codes: ["N40.1"],
      })
    ).toMatchObject({
      patientDob: "01/15/1990",
      dateOfService: "05/10/2026",
      cptLinesJson: '[{"code":"51798","modifiers":["25"]}]',
    });
  });

  it("maps legacy submissions to cptLines for editing", () => {
    expect(
      submissionToEditForm({
        cpt_code: "51798, 99213",
        cpt_modifiers: "25, 57",
      }).cptLines
    ).toEqual([
      { code: "51798", modifiers: ["25", "57"] },
      { code: "99213", modifiers: [] },
    ]);
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
