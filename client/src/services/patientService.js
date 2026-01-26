/**
 * Patient Service
 * Handles all patient-related API calls
 */

import apiClient from './apiClient.js';

export const patientService = {
  /**
   * Get all patients for the authenticated practice
   * @param {String} searchName - Optional patient name to search for
   * @returns {Promise} Array of patient objects
   */
  getAllPatients: async (searchName = null) => {
    if (searchName) {
      const response = await apiClient.get(`/all_patients?name=${encodeURIComponent(searchName)}`);
      return response.data;
    }
    const response = await apiClient.get('/all_patients');
    return response.data;
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

