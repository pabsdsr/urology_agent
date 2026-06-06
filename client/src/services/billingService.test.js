import { describe, expect, it, vi } from 'vitest';

const postMock = vi.fn();
const patchMock = vi.fn();

vi.mock('./apiClient.js', () => ({
  default: {
    post: (...args) => postMock(...args),
    patch: (...args) => patchMock(...args),
  },
}));

import { billingService } from './billingService.js';

describe('billingService', () => {
  it('submits expected FormData fields to billing endpoint', async () => {
    postMock.mockResolvedValueOnce({ data: { status: 'submitted', submission_id: 'sub-1' } });
    const file = new File(['img'], 'sheet.png', { type: 'image/png' });

    const response = await billingService.submitBilling({
      patientName: 'Jane Doe',
      patientDob: '1990-01-01',
      location: 'North Pod',
      dateOfService: '2026-05-20',
      providerName: 'Dr. U',
      cptCode: '51798',
      icd10Code: 'N40.1',
      cptModifiers: '25, 57',
      billingSheetFile: file,
    });

    expect(response.status).toBe('submitted');
    const [url, formData] = postMock.mock.calls[0];
    expect(url).toBe('/billing/submit');
    expect(formData.get('patient_name')).toBe('Jane Doe');
    expect(formData.get('cpt_modifiers')).toBe('25, 57');
    expect(formData.get('billing_sheet')).toBe(file);
  });

  it('updates a submission without billing sheet when none provided', async () => {
    patchMock.mockResolvedValueOnce({
      data: { status: 'updated', submission: { id: 'sub-1' } },
    });

    await billingService.updateSubmission('sub-1', {
      patientName: 'Jane Updated',
      patientDob: '1990-01-01',
      location: 'South Pod',
      dateOfService: '2026-05-20',
      providerName: 'Dr. U',
      cptCode: '51798',
      icd10Code: 'N40.1',
    });

    const formData = patchMock.mock.calls[0][1];
    expect(formData.get('patient_name')).toBe('Jane Updated');
    expect(formData.get('billing_sheet')).toBeNull();
  });
});
