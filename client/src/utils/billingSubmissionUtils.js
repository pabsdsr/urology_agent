import {
  formatBillingCodeList,
  formatBillingModifierList,
  parseBillingCodeList,
  parseBillingModifierList,
} from "./billingFormValidation.js";

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
    patientDob: submission.patient_dob || "",
    providerName: submission.provider_name || "",
    location: submission.location || "",
    dateOfService: submission.date_of_service || "",
    cptCodes: parseBillingCodeList(submission.cpt_code),
    icd10Codes: parseBillingCodeList(submission.icd10_code),
    cptModifiers: parseBillingModifierList(submission.cpt_modifiers),
  };
}

/** Map billing form state to the API payload shape. */
export function formToSubmissionPayload(form, billingSheetFile = null) {
  return {
    patientName: form.patientName.trim(),
    patientDob: form.patientDob.trim(),
    location: form.location.trim(),
    dateOfService: form.dateOfService,
    providerName: form.providerName.trim(),
    cptCode: formatBillingCodeList(form.cptCodes),
    icd10Code: formatBillingCodeList(form.icd10Codes),
    cptModifiers: formatBillingModifierList(form.cptModifiers),
    billingSheetFile,
  };
}
