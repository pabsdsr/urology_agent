import {
  formatBillingCodeList,
  formatBillingDateUs,
  parseBillingCodeList,
} from "./billingFormValidation.js";
import {
  cptLinesFromSubmission,
  normalizeCptLines,
  serializeCptLinesForApi,
} from "./cptLines.js";

export function submitterDisplay(submission) {
  return submission?.submitter_email || submission?.submitted_by || "";
}

/** Last edit time, or submitted time if the record was never edited. */
export function lastUpdatedAt(submission) {
  return submission?.updated_at || submission?.submitted_at || "";
}

export function submissionToEditForm(submission) {
  return {
    patientName: submission.patient_name || "",
    patientDob: formatBillingDateUs(submission.patient_dob || ""),
    providerName: submission.provider_name || "",
    location: submission.location || "",
    dateOfService: formatBillingDateUs(submission.date_of_service || ""),
    cptLines: cptLinesFromSubmission(submission),
    icd10Codes: parseBillingCodeList(submission.icd10_code),
  };
}

/** Map billing form state to the API payload shape. */
export function formToSubmissionPayload(form, billingSheetFile = null) {
  const cptLines = normalizeCptLines(form.cptLines);
  return {
    patientName: form.patientName.trim(),
    patientDob: formatBillingDateUs(form.patientDob),
    location: form.location.trim(),
    dateOfService: formatBillingDateUs(form.dateOfService),
    providerName: form.providerName.trim(),
    cptLinesJson: serializeCptLinesForApi(cptLines),
    icd10Code: formatBillingCodeList(form.icd10Codes),
    billingSheetFile,
  };
}
