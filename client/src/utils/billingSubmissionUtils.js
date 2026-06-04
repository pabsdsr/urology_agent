/** Admin email allowed to edit/delete billing submissions. */
export const BILLING_ADMIN_EMAIL = "wkim@urologymedical.com";

export function canManageBillingSubmissions(user) {
  const email = (user?.username || "").trim().toLowerCase();
  return email === BILLING_ADMIN_EMAIL.toLowerCase();
}

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
    cptCode: submission.cpt_code || "",
    icd10Code: submission.icd10_code || "",
  };
}
