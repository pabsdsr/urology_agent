import apiClient from './apiClient.js';

export const scheduleService = {
  /**
   * Fetch practitioner schedule for a date range
   * @param {String} start - Start date (YYYY-MM-DD)
   * @param {String} end - End date (YYYY-MM-DD)
   * @returns {Promise<{ schedule: object, practitioner_names: object, location_names: object }>}
   */
  getPractitionerSchedule: async (start, end) => {
    const response = await apiClient.get(`/schedule?start=${start}&end=${end}`);
    return response.data;
  },
};
