import { describe, expect, it } from 'vitest';
import { formatDayList, formatTimeOfDay, nextWeekSharingText } from './format';

describe('format helpers', () => {
  it('writes 24-hour lock times the way people say them', () => {
    expect(formatTimeOfDay('23:59')).toBe('11:59 pm');
    expect(formatTimeOfDay('00:05')).toBe('12:05 am');
    expect(formatTimeOfDay('12:00')).toBe('12:00 pm');
    expect(formatTimeOfDay('09:30')).toBe('9:30 am');
  });

  it('lists sharing days as a range or a list', () => {
    expect(formatDayList(['MON', 'TUE', 'WED', 'THU', 'FRI'])).toBe('Monday to Friday');
    expect(formatDayList(['MON', 'WED', 'FRI'])).toBe('Monday, Wednesday and Friday');
    expect(formatDayList(['SAT', 'SUN'])).toBe('Saturday and Sunday');
    expect(formatDayList(['TUE'])).toBe('Tuesday');
  });

  it('says when sharing opens after the weekly break', () => {
    expect(nextWeekSharingText(['MON', 'TUE'])).toBe('The next week starts Monday, and so does sharing.');
    expect(nextWeekSharingText(['WED'])).toBe('The next week starts Monday; sharing opens Wednesday.');
    expect(nextWeekSharingText(undefined)).toBe('Sharing opens when the next week starts.');
  });
});
