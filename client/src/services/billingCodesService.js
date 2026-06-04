import apiClient from "./apiClient.js";

export const billingCodesService = {
  searchCpt: async (query = "", limit = 20) => {
    const response = await apiClient.get("/billing/codes/cpt", {
      params: { q: query, limit },
    });
    return response.data.codes || [];
  },

  searchIcd10: async (query = "", limit = 20) => {
    const response = await apiClient.get("/billing/codes/icd10", {
      params: { q: query, limit },
    });
    return response.data.codes || [];
  },
};
