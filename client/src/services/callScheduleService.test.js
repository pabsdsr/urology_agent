import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const acquireTokenMock = vi.fn();

vi.mock('./apiClient.js', () => ({
  default: {},
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
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('uploadSchedule includes bearer token and returns json', async () => {
    acquireTokenMock.mockResolvedValueOnce('jwt-token');
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });
    const out = await callScheduleService.uploadSchedule(
      new File(['csv'], 'x.csv', { type: 'text/csv' })
    );
    expect(out).toEqual({ success: true });
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8080/call-schedule/upload',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer jwt-token' }),
      })
    );
  });
});
