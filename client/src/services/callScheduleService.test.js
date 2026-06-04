import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
const postMock = vi.fn();
const acquireTokenMock = vi.fn();

vi.mock('./apiClient.js', () => ({
  default: {
    get: (...args) => getMock(...args),
    post: (...args) => postMock(...args),
  },
  requireAuthToken: (...args) => acquireTokenMock(...args),
}));

vi.mock('./sessionLogout.js', () => ({
  throwExpiredSession: vi.fn(),
}));

vi.mock('../config/api.js', () => ({
  default: { BASE_URL: 'http://localhost:8080' },
}));

import { callScheduleService } from './callScheduleService.js';

describe('callScheduleService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('saveWeek normalizes and posts day map', async () => {
    postMock.mockResolvedValueOnce({ data: { success: true } });
    const days = [{ date: '2026-05-24', north: [{ location: 'A', practitioner: 'Dr X' }] }];
    const out = await callScheduleService.saveWeek('2026-05-24', days);
    expect(out).toEqual({ success: true });
    expect(postMock).toHaveBeenCalledWith('/call-schedule/week', {
      week_start: '2026-05-24',
      days: {
        '2026-05-24': {
          date: '2026-05-24',
          north: [{ location: 'A', practitioner: 'Dr X' }],
          central: [],
          south: [],
        },
      },
    });
  });

  it('getCallSchedule returns call_schedule object', async () => {
    getMock.mockResolvedValueOnce({ data: { call_schedule: { a: 1 } } });
    const out = await callScheduleService.getCallSchedule('2026-05-24', '2026-05-30');
    expect(out).toEqual({ a: 1 });
  });

  it('uploadSchedule includes bearer token and returns json', async () => {
    acquireTokenMock.mockResolvedValueOnce('jwt-token');
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });
    const out = await callScheduleService.uploadSchedule(new File(['csv'], 'x.csv', { type: 'text/csv' }));
    expect(out).toEqual({ success: true });
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8080/call-schedule/upload',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer jwt-token' }),
      })
    );
  });
});
