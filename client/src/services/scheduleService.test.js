import { describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();

vi.mock('./apiClient.js', () => ({
  default: {
    get: (...args) => getMock(...args),
  },
}));

import { scheduleService } from './scheduleService.js';

describe('scheduleService', () => {
  it('fetches practitioner schedule with range query', async () => {
    getMock.mockResolvedValueOnce({ data: { schedule: {} } });
    const out = await scheduleService.getPractitionerSchedule('2026-05-24', '2026-05-30');
    expect(getMock).toHaveBeenCalledWith('/schedule?start=2026-05-24&end=2026-05-30');
    expect(out).toEqual({ schedule: {} });
  });
});
