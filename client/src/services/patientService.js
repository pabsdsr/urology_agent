/**
 * Patient Service
 * Handles all patient-related API calls
 */

import apiClient from './apiClient.js';


export const patientService = {
  /**
   * Search patients for typeahead/autocomplete
   * @param {String} input - User input (can be first, last, or both names)
   * @returns {Promise} Array of patient objects
   */
  searchPatients: async (input) => {
    if (!input || input.trim() === "") return [];
    const parts = input.trim().split(/\s+/);
    let params = "";
    if (parts.length === 1) {
      // Try as given and as family, merge results client-side
      const [single] = parts;
      const [givenRes, familyRes] = await Promise.all([
        apiClient.get(`/patients?given=${encodeURIComponent(single)}`),
        apiClient.get(`/patients?family=${encodeURIComponent(single)}`),
      ]);
      // Merge by id
      const seen = new Set();
      const merged = [...givenRes.data, ...familyRes.data].filter((p) => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });
      return merged;
    } else {
      // Assume first is given, last is family
      const given = parts.slice(0, -1).join(" ");
      const family = parts[parts.length - 1];
      params = `given=${encodeURIComponent(given)}&family=${encodeURIComponent(family)}`;
      const response = await apiClient.get(`/patients?${params}`);
      return response.data;
    }
  },

  /**
   * Run AI crew analysis for a specific patient
   * @param {Object} data - { query, id }
   * @returns {Promise} AI crew response
   */
  runCrew: async (data) => {
    const response = await apiClient.post('/run_crew', data);
    return response.data;
  },
};

