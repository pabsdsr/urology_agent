import { describe, expect, it, vi } from 'vitest';

const postMock = vi.fn();
const getMock = vi.fn();
const deleteMock = vi.fn();
const patchMock = vi.fn();

vi.mock('./apiClient.js', () => ({
  default: {
    post: (...args) => postMock(...args),
    get: (...args) => getMock(...args),
    patch: (...args) => patchMock(...args),
    delete: (...args) => deleteMock(...args),
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
      billingSheetFile: file,
    });

    expect(response.status).toBe('submitted');
    expect(postMock).toHaveBeenCalledTimes(1);
    const [url, formData] = postMock.mock.calls[0];
    expect(url).toBe('/billing/submit');
    expect(formData.get('patient_name')).toBe('Jane Doe');
    expect(formData.get('patient_dob')).toBe('1990-01-01');
    expect(formData.get('location')).toBe('North Pod');
    expect(formData.get('date_of_service')).toBe('2026-05-20');
    expect(formData.get('provider_name')).toBe('Dr. U');
    expect(formData.get('cpt_code')).toBe('51798');
    expect(formData.get('icd10_code')).toBe('N40.1');
    expect(formData.get('billing_sheet')).toBe(file);
    expect(formData.get('patient_id')).toBeNull();
  });

  it('lists submissions with pagination params', async () => {
    getMock.mockResolvedValueOnce({ data: { submissions: [{ id: 'sub-1' }] } });
    const data = await billingService.listSubmissions(50, 10);
    expect(data.submissions).toHaveLength(1);
    expect(getMock).toHaveBeenCalledWith('/billing/submissions', {
      params: { limit: 50, offset: 10 },
    });
  });

  it('updates a submission with FormData fields', async () => {
    patchMock.mockResolvedValueOnce({
      data: { status: 'updated', submission: { id: 'sub-1', patient_name: 'Jane Updated' } },
    });

    const data = await billingService.updateSubmission('sub-1', {
      patientName: 'Jane Updated',
      patientDob: '1990-01-01',
      location: 'South Pod',
      dateOfService: '2026-05-20',
      providerName: 'Dr. U',
      cptCode: '51798',
      icd10Code: 'N40.1',
    });

    expect(data.status).toBe('updated');
    expect(patchMock).toHaveBeenCalledWith('/billing/submissions/sub-1', expect.any(FormData));
    const formData = patchMock.mock.calls[0][1];
    expect(formData.get('patient_name')).toBe('Jane Updated');
    expect(formData.get('billing_sheet')).toBeNull();
  });

  it('sets submission processed status', async () => {
    patchMock.mockResolvedValueOnce({
      data: { status: 'updated', submission: { id: 'sub-1', processed: true } },
    });
    const data = await billingService.setSubmissionProcessed('sub-1', true);
    expect(data.submission.processed).toBe(true);
    expect(patchMock).toHaveBeenCalledWith('/billing/submissions/sub-1/processed', {
      processed: true,
    });
  });

  it('deletes a submission by id', async () => {
    deleteMock.mockResolvedValueOnce({ data: { status: 'deleted', submission_id: 'sub-1' } });
    const data = await billingService.deleteSubmission('sub-1');
    expect(data.status).toBe('deleted');
    expect(deleteMock).toHaveBeenCalledWith('/billing/submissions/sub-1');
  });
});
