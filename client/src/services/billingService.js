import apiClient from "./apiClient.js";

function buildBillingFormData(payload, { includeSheet = true } = {}) {
  const formData = new FormData();
  formData.append("patient_name", payload.patientName);
  formData.append("patient_dob", payload.patientDob);
  formData.append("location", payload.location);
  formData.append("date_of_service", payload.dateOfService || "");
  formData.append("provider_name", payload.providerName || "");
  formData.append("cpt_lines", payload.cptLinesJson || "[]");
  formData.append("icd10_code", payload.icd10Code);
  if (includeSheet && payload.billingSheetFile) {
    formData.append("billing_sheet", payload.billingSheetFile);
  }
  return formData;
}

export const billingService = {
  submitBilling: async (payload) => {
    const response = await apiClient.post(
      "/billing/submit",
      buildBillingFormData(payload, { includeSheet: Boolean(payload.billingSheetFile) })
    );
    return response.data;
  },

  listSubmissions: async (limit = 100, offset = 0) => {
    const response = await apiClient.get("/billing/submissions", {
      params: { limit, offset },
    });
    return response.data;
  },

  billingSheetUrl: (submissionId) => `/billing/submissions/${submissionId}/sheet`,

  updateSubmission: async (submissionId, payload) => {
    const response = await apiClient.patch(
      `/billing/submissions/${submissionId}`,
      buildBillingFormData(payload, { includeSheet: Boolean(payload.billingSheetFile) })
    );
    return response.data;
  },

  setSubmissionProcessed: async (submissionId, processed) => {
    const response = await apiClient.patch(`/billing/submissions/${submissionId}/processed`, {
      processed,
    });
    return response.data;
  },

  deleteSubmission: async (submissionId) => {
    const response = await apiClient.delete(`/billing/submissions/${submissionId}`);
    return response.data;
  },
};
