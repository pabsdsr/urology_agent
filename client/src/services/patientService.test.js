import { describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
const postMock = vi.fn();

vi.mock('./apiClient.js', () => ({
  default: {
    get: (...args) => getMock(...args),
    post: (...args) => postMock(...args),
  },
}));

import { patientService } from './patientService.js';

describe('patientService.searchPatients', () => {
  it('returns empty array for blank input', async () => {
    await expect(patientService.searchPatients('   ')).resolves.toEqual([]);
    expect(getMock).not.toHaveBeenCalled();
  });

  it('merges one-term results by id', async () => {
    getMock
      .mockResolvedValueOnce({ data: [{ id: '1' }, { id: '2' }] })
      .mockResolvedValueOnce({ data: [{ id: '2' }, { id: '3' }] });

    const rows = await patientService.searchPatients('jane');
    expect(rows.map((r) => r.id)).toEqual(['1', '2', '3']);
    expect(getMock.mock.calls[0][0]).toContain('/patients?given=jane');
    expect(getMock.mock.calls[1][0]).toContain('/patients?family=jane');
  });

  it('encodes given+family params for multi-term input', async () => {
    getMock.mockResolvedValueOnce({ data: [{ id: '5' }] });
    const rows = await patientService.searchPatients('Jane Van Doe');
    expect(rows).toEqual([{ id: '5' }]);
    expect(getMock).toHaveBeenCalledWith('/patients?given=Jane%20Van&family=Doe');
  });
});

describe('patientService.runCrew', () => {
  it('posts to run_crew endpoint', async () => {
    postMock.mockResolvedValueOnce({ data: { output: 'ok' } });
    const payload = { query: 'q', id: 'p-1' };
    const out = await patientService.runCrew(payload);
    expect(postMock).toHaveBeenCalledWith('/run_crew', payload);
    expect(out).toEqual({ output: 'ok' });
  });
});
