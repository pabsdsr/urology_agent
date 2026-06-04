import { describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();

vi.mock('./apiClient.js', () => ({
  default: {
    get: (...args) => getMock(...args),
  },
}));

import { billingCodesService } from './billingCodesService.js';

describe('billingCodesService', () => {
  it('searches CPT codes', async () => {
    getMock.mockResolvedValueOnce({ data: { codes: [{ code: '51798', description: 'PVR' }] } });
    const codes = await billingCodesService.searchCpt('517', 10);
    expect(codes).toHaveLength(1);
    expect(getMock).toHaveBeenCalledWith('/billing/codes/cpt', {
      params: { q: '517', limit: 10 },
    });
  });

  it('searches ICD-10 codes', async () => {
    getMock.mockResolvedValueOnce({ data: { codes: [{ code: 'N40.1', description: 'BPH' }] } });
    const codes = await billingCodesService.searchIcd10('N40', 15);
    expect(codes[0].code).toBe('N40.1');
    expect(getMock).toHaveBeenCalledWith('/billing/codes/icd10', {
      params: { q: 'N40', limit: 15 },
    });
  });
});
