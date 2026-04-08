import apiClient, { getAuthHeaders } from './apiClient.js';
import API_CONFIG from '../config/api.js';

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

  /**
   * Admin-only: newest-first change log entries for call schedule edits.
   * @param {number} [limit=100]
   * @param {number} [offset=0]
   */
  getChangelog: async (limit = 100, offset = 0) => {
    const response = await apiClient.get('/call-schedule/changelog', {
      params: { limit, offset },
    });
    return response.data;
  },

  /**
   * Upload a call schedule spreadsheet (CSV/XLSX) and import it.
   * @param {File} file
   */
  uploadSchedule: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const { Authorization } = await getAuthHeaders();

    const baseUrl = (API_CONFIG.BASE_URL || '').replace(/\/+$/, '');
    const uploadUrl = `${baseUrl}/call-schedule/upload`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 65000);

    let response;
    try {
      response = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          ...(Authorization ? { Authorization } : {}),
        },
        body: formData,
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeoutId);
      if (err?.name === 'AbortError') {
        throw new Error('Upload timed out. Try a smaller file or check your connection');
      }
      throw err;
    }

    clearTimeout(timeoutId);

    if (!response.ok) {
      let detail = 'Failed to upload schedule';
      try {
        const data = await response.json();
        if (data?.detail) {
          detail = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
        }
      } catch {
        // ignore JSON parse errors
      }
      if (response.status === 404) {
        detail = `Upload endpoint not found (404). If this works locally, check that production API URL is correct (e.g. base URL or path prefix).`;
      } else {
        detail = `${detail} (${response.status} ${response.statusText || ''})`.trim();
      }
      const err = new Error(detail);
      err.response = { status: response.status, data: { detail } };
      throw err;
    }

    return response.json();
  },
};

