import {
  formatBillingCodeList,
  formatBillingDateUs,
  parseBillingCodeList,
} from "./billingFormValidation.js";
import {
  cptLinesFromSubmission,
  formatCptLinesDisplay,
  normalizeCptLines,
  serializeCptLinesForApi,
} from "./cptLines.js";

function parseSortableDate(value) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function compareText(a, b) {
  return String(a || "").localeCompare(String(b || ""), undefined, { sensitivity: "base" });
}

function sortValue(submission, column) {
  switch (column) {
    case "submitted_at":
      return parseSortableDate(submission.submitted_at);
    case "patient_name":
      return submission.patient_name;
    case "patient_dob":
      return parseSortableDate(submission.patient_dob);
    case "provider_name":
      return submission.provider_name;
    case "attending_name":
      return submission.attending_name;
    case "location":
      return submission.location;
    case "date_of_service":
      return parseSortableDate(submission.date_of_service);
    case "cpt_lines":
      return formatCptLinesDisplay(submission);
    case "icd10_code":
      return submission.icd10_code;
    case "processed":
      return Boolean(submission.processed);
    case "submitted_by":
      return submitterDisplay(submission);
    default:
      return "";
  }
}

export function compareBillingSubmissions(a, b, column, direction = "asc") {
  const aVal = sortValue(a, column);
  const bVal = sortValue(b, column);
  let cmp = 0;
  if (column === "processed") {
    cmp = Number(aVal) - Number(bVal);
  } else if (typeof aVal === "number" && typeof bVal === "number") {
    cmp = aVal - bVal;
  } else {
    cmp = compareText(aVal, bVal);
  }
  return direction === "desc" ? -cmp : cmp;
}

export function submitterDisplay(submission) {
  return submission?.submitter_email || submission?.submitted_by || "";
}

/** Display the date of service as a single date or "start – end" range. */
export function formatDateOfService(submission) {
  const start = formatBillingDateUs(submission?.date_of_service || "");
  const end = formatBillingDateUs(submission?.date_of_service_end || "");
  if (end && end !== start) {
    return `${start} – ${end}`;
  }
  return start;
}

/** Last edit time, or submitted time if the record was never edited. */
export function lastUpdatedAt(submission) {
  return submission?.updated_at || submission?.submitted_at || "";
}

export function submissionToEditForm(submission) {
  const incidentTo = Boolean(submission.incident_to);
  return {
    patientName: submission.patient_name || "",
    patientDob: formatBillingDateUs(submission.patient_dob || ""),
    providerName: submission.provider_name || "",
    incidentTo,
    attendingName: incidentTo ? submission.attending_name || "" : "",
    location: submission.location || "",
    dateOfService: formatBillingDateUs(submission.date_of_service || ""),
    dateOfServiceEnd: formatBillingDateUs(submission.date_of_service_end || ""),
    cptLines: cptLinesFromSubmission(submission),
    icd10Codes: parseBillingCodeList(submission.icd10_code),
  };
}

/** Map billing form state to the API payload shape. */
export function formToSubmissionPayload(form, billingSheetFile = null) {
  const cptLines = normalizeCptLines(form.cptLines);
  const incidentTo = Boolean(form.incidentTo);
  return {
    patientName: form.patientName.trim(),
    patientDob: formatBillingDateUs(form.patientDob),
    location: form.location.trim(),
    dateOfService: formatBillingDateUs(form.dateOfService),
    dateOfServiceEnd: form.dateOfServiceEnd ? formatBillingDateUs(form.dateOfServiceEnd) : "",
    providerName: form.providerName.trim(),
    incidentTo,
    attendingName: incidentTo ? form.attendingName.trim() : "",
    cptLinesJson: serializeCptLinesForApi(cptLines),
    icd10Code: formatBillingCodeList(form.icd10Codes),
    billingSheetFile,
  };
}
