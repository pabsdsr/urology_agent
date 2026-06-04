import { describe, expect, it } from 'vitest';

import {
  addDays,
  formatPacificDateTime,
  formatYMD,
  getDatesInRange,
  getSundayWeekRange,
  parseYMD,
  startOfWeekSundayUTC,
} from './calendarPacific.js';

describe('calendarPacific', () => {
  it('parses and formats YYYY-MM-DD', () => {
    const parsed = parseYMD('2026-05-28');
    expect(formatYMD(parsed)).toBe('2026-05-28');
  });

  it('adds days using UTC boundaries', () => {
    expect(addDays('2026-05-31', 1)).toBe('2026-06-01');
  });

  it('returns sunday-saturday week range', () => {
    expect(getSundayWeekRange('2026-05-28')).toEqual({
      start: '2026-05-24',
      end: '2026-05-30',
    });
    expect(startOfWeekSundayUTC('2026-05-28')).toBe('2026-05-24');
  });

  it('formats ISO timestamps in Pacific time', () => {
    const formatted = formatPacificDateTime('2026-05-28T19:30:00Z');
    expect(formatted).toContain('May 28, 2026');
    expect(formatted).toMatch(/12:30/);
    expect(formatted).toMatch(/PDT|PST/);
  });

  it('lists all dates in inclusive range', () => {
    expect(getDatesInRange('2026-05-24', '2026-05-26')).toEqual([
      '2026-05-24',
      '2026-05-25',
      '2026-05-26',
    ]);
  });
});
