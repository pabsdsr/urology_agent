import apiClient from './apiClient.js';

export const callScheduleService = {
  /**
   * Save or update on-call schedule for a single week.
   * @param {string} weekStart - start of the week (YYYY-MM-DD, aligned to Sunday)
   * @param {Array<{
   *   date: string,
   *   north: Array<{ location: string, practitioner: string }>,
   *   central: Array<{ location: string, practitioner: string }>,
   *   south: Array<{ location: string, practitioner: string }>
   * }>} days
   */
  saveWeek: async (weekStart, days) => {
    const dayMap = {};
    days.forEach((d) => {
      if (!d?.date) return;
      dayMap[d.date] = {
        date: d.date,
        north: Array.isArray(d.north) ? d.north : [],
        central: Array.isArray(d.central) ? d.central : [],
        south: Array.isArray(d.south) ? d.south : [],
      };
    });
    const response = await apiClient.post('/call-schedule/week', {
      week_start: weekStart,
      days: dayMap,
    });
    return response.data;
  },

  /**
   * Fetch call schedule for a date range.
   * @param {string} start - YYYY-MM-DD
   * @param {string} end - YYYY-MM-DD
   */
  getCallSchedule: async (start, end) => {
    const response = await apiClient.get(`/call-schedule?start=${start}&end=${end}`);
    return response.data.call_schedule || {};
  },
};

