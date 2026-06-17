import { formatPacificDateTime } from "./calendarPacific.js";
import { lastUpdatedAt, submitterDisplay } from "./billingSubmissionUtils.js";
import { formatBillingDateUs } from "./billingFormValidation.js";
import { formatCptLinesDisplay } from "./cptLines.js";

const CSV_COLUMNS = [
  { key: "id", header: "Submission ID" },
  { key: "submitted_at", header: "Submitted At" },
  { key: "last_updated_at", header: "Last Updated" },
  { key: "patient_name", header: "Patient Name" },
  { key: "patient_dob", header: "Patient DOB" },
  { key: "provider_name", header: "Provider" },
  { key: "attending_name", header: "Attending" },
  { key: "incident_to", header: "Incident To" },
  { key: "location", header: "Location" },
  { key: "date_of_service", header: "Date of Service" },
  { key: "cpt_lines", header: "CPT Codes" },
  { key: "icd10_code", header: "ICD-10 Code" },
  { key: "processed", header: "Processed" },
  { key: "submitted_by", header: "Submitted By" },
];

function escapeCsvCell(value) {
  const text = value == null ? "" : String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function submissionToCsvRow(submission) {
  return {
    id: submission.id ?? "",
    submitted_at: formatPacificDateTime(submission.submitted_at),
    last_updated_at: formatPacificDateTime(lastUpdatedAt(submission)),
    patient_name: submission.patient_name ?? "",
    patient_dob: formatBillingDateUs(submission.patient_dob ?? ""),
    provider_name: submission.provider_name ?? "",
    attending_name: submission.attending_name ?? "",
    incident_to: submission.incident_to ? "Yes" : "No",
    location: submission.location ?? "",
    date_of_service: formatBillingDateUs(submission.date_of_service ?? ""),
    cpt_lines: formatCptLinesDisplay(submission),
    icd10_code: submission.icd10_code ?? "",
    processed: submission.processed ? "Yes" : "No",
    submitted_by: submitterDisplay(submission),
  };
}

export function buildBillingSubmissionsCsv(submissions) {
  const rows = Array.isArray(submissions) ? submissions : [];
  const header = CSV_COLUMNS.map(({ header }) => escapeCsvCell(header)).join(",");
  const body = rows.map((submission) =>
    CSV_COLUMNS.map(({ key }) => escapeCsvCell(submissionToCsvRow(submission)[key])).join(",")
  );
  return [header, ...body].join("\r\n");
}

export function downloadBillingSubmissionsCsv(submissions, filename) {
  const blob = new Blob([buildBillingSubmissionsCsv(submissions)], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download =
    filename || `billing-submissions-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
