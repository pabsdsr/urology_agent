import apiClient from "./apiClient.js";

const CODE_ENDPOINTS = {
  cpt: "/billing/codes/cpt",
  icd10: "/billing/codes/icd10",
  modifier: "/billing/codes/modifiers",
};

async function searchCodes(type, query = "", limit = 20) {
  const response = await apiClient.get(CODE_ENDPOINTS[type], {
    params: { q: query, limit },
  });
  return response.data.codes || [];
}

export const billingCodesService = {
  searchCpt: (query, limit) => searchCodes("cpt", query, limit),
  searchIcd10: (query, limit) => searchCodes("icd10", query, limit),
  searchModifiers: (query, limit) => searchCodes("modifier", query, limit),
};
