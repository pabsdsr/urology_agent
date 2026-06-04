import apiClient from "./apiClient.js";

export const billingService = {
  submitBilling: async (payload) => {
    const formData = new FormData();
    formData.append("patient_name", payload.patientName);
    formData.append("patient_dob", payload.patientDob);
    formData.append("location", payload.location);
    formData.append("date_of_service", payload.dateOfService || "");
    formData.append("provider_name", payload.providerName || "");
    formData.append("cpt_code", payload.cptCode);
    formData.append("icd10_code", payload.icd10Code);
    formData.append("billing_sheet", payload.billingSheetFile);

    const response = await apiClient.post("/billing/submit", formData);
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
    const formData = new FormData();
    formData.append("patient_name", payload.patientName);
    formData.append("patient_dob", payload.patientDob);
    formData.append("location", payload.location);
    formData.append("date_of_service", payload.dateOfService || "");
    formData.append("provider_name", payload.providerName || "");
    formData.append("cpt_code", payload.cptCode);
    formData.append("icd10_code", payload.icd10Code);
    if (payload.billingSheetFile) {
      formData.append("billing_sheet", payload.billingSheetFile);
    }

    const response = await apiClient.patch(`/billing/submissions/${submissionId}`, formData);
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
