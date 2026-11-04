import { isPreOrderClosed } from './pre-order-window';

describe('isPreOrderClosed', () => {
  const START = '2026-11-04T11:00:00Z';

  const cases: { now: string; closed: boolean; label: string }[] = [
    { now: '2026-11-03T11:00:00Z', closed: false, label: 'a day before the start' },
    { now: '2026-11-04T10:29:59Z', closed: false, label: 'just over 30 minutes before' },
    { now: '2026-11-04T10:30:00Z', closed: true, label: 'exactly 30 minutes before' },
    { now: '2026-11-04T11:15:00Z', closed: true, label: 'after the start' },
    { now: '2026-11-05T09:00:00Z', closed: true, label: 'the next day' },
  ];

  for (const { now, closed, label } of cases) {
    it(`is ${closed ? 'closed' : 'open'} ${label}`, () => {
      expect(isPreOrderClosed(START, new Date(now))).toBe(closed);
    });
  }

  it('accepts a Date as the start time', () => {
    expect(isPreOrderClosed(new Date(START), new Date('2026-11-04T12:00:00Z'))).toBeTrue();
  });

  it('keeps the pre-order open when the start time cannot be read', () => {
    expect(isPreOrderClosed('not a date', new Date('2026-11-04T12:00:00Z'))).toBeFalse();
  });
});
