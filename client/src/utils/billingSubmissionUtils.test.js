import { describe, expect, it } from "vitest";
import {
  compareBillingSubmissions,
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

  it("sorts by date of service ascending", () => {
    const earlier = { date_of_service: "2026-05-01" };
    const later = { date_of_service: "2026-06-01" };
    expect(compareBillingSubmissions(earlier, later, "date_of_service", "asc")).toBeLessThan(0);
    expect(compareBillingSubmissions(later, earlier, "date_of_service", "desc")).toBeLessThan(0);
  });

  it("sorts by provider name", () => {
    const a = { provider_name: "Adams" };
    const b = { provider_name: "Zimmer" };
    expect(compareBillingSubmissions(a, b, "provider_name", "asc")).toBeLessThan(0);
  });

  it("maps incident to fields for edit and submit", () => {
    expect(
      submissionToEditForm({
        patient_name: "Jane",
        provider_name: "Dr. NP",
        incident_to: true,
        attending_name: "Dr. Attending",
      })
    ).toMatchObject({
      providerName: "Dr. NP",
      incidentTo: true,
      attendingName: "Dr. Attending",
    });

    expect(
      formToSubmissionPayload({
        patientName: "Jane",
        patientDob: "1/15/1990",
        dateOfService: "5/10/2026",
        location: "North Pod",
        providerName: "Dr. NP",
        incidentTo: true,
        attendingName: "Dr. Attending",
        cptLines: [{ code: "51798", modifiers: [] }],
        icd10Codes: ["N40.1"],
      })
    ).toMatchObject({
      incidentTo: true,
      attendingName: "Dr. Attending",
    });

    expect(
      formToSubmissionPayload({
        patientName: "Jane",
        patientDob: "1/15/1990",
        dateOfService: "5/10/2026",
        location: "North Pod",
        providerName: "Dr. NP",
        incidentTo: false,
        attendingName: "ignored",
        cptLines: [{ code: "51798", modifiers: [] }],
        icd10Codes: ["N40.1"],
      }).attendingName
    ).toBe("");
  });

  it("sorts by patient name and processed status", () => {
    expect(
      compareBillingSubmissions(
        { patient_name: "Adams" },
        { patient_name: "Zimmer" },
        "patient_name",
        "asc"
      )
    ).toBeLessThan(0);
    expect(
      compareBillingSubmissions({ processed: false }, { processed: true }, "processed", "asc")
    ).toBeLessThan(0);
  });
});
