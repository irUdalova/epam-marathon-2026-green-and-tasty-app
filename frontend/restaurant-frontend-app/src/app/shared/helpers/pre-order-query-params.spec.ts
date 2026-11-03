import {
  buildPreOrderLabel,
  buildPreOrderQueryParams,
  buildPreOrderQueryParamsFromOrder,
  formatBookingTime,
  PreOrderReservation,
} from './pre-order-query-params';

const RESERVATION: PreOrderReservation = {
  id: 'res-1',
  locationAddress: '9 Abashidze Street',
  startTime: new Date(2026, 10, 1, 11, 45),
  endTime: new Date(2026, 10, 1, 13, 15),
};

describe('pre-order-query-params', () => {
  describe('buildPreOrderLabel', () => {
    it('formats address, date and time range without a table id', () => {
      expect(buildPreOrderLabel(RESERVATION)).toBe(
        '9 Abashidze Street, Sun, Nov 1, 2026, 11:45 AM – 1:15 PM',
      );
    });

    it('includes the table name when there is one', () => {
      expect(buildPreOrderLabel({ ...RESERVATION, tableName: 'Table 3' })).toBe(
        '9 Abashidze Street, Table 3, Sun, Nov 1, 2026, 11:45 AM – 1:15 PM',
      );
    });

    it('accepts ISO strings for the times', () => {
      const label = buildPreOrderLabel({
        ...RESERVATION,
        startTime: new Date(2026, 10, 1, 11, 45).toISOString(),
        endTime: new Date(2026, 10, 1, 13, 15).toISOString(),
      });

      expect(label).toBe('9 Abashidze Street, Sun, Nov 1, 2026, 11:45 AM – 1:15 PM');
    });
  });

  describe('buildPreOrderQueryParams', () => {
    it('returns the params that open the menu in pre-order mode', () => {
      expect(buildPreOrderQueryParams(RESERVATION)).toEqual({
        preOrder: 'true',
        reservationId: 'res-1',
        reservationLabel: '9 Abashidze Street, Sun, Nov 1, 2026, 11:45 AM – 1:15 PM',
      });
    });
  });

  describe('formatBookingTime', () => {
    it('gives the weekday, date and time range without the address', () => {
      expect(formatBookingTime(RESERVATION.startTime, RESERVATION.endTime)).toBe(
        'Sun, Nov 1, 2026, 11:45 AM – 1:15 PM',
      );
    });
  });

  describe('buildPreOrderQueryParamsFromOrder', () => {
    it('uses the order address and booking time as the label', () => {
      expect(
        buildPreOrderQueryParamsFromOrder({
          reservationId: 'res-1',
          reservationAddress: '9 Abashidze Street',
          reservationTime: 'Nov 01, 2026, 10:45 AM - 12:15 PM',
        }),
      ).toEqual({
        preOrder: 'true',
        reservationId: 'res-1',
        reservationLabel: '9 Abashidze Street, Nov 01, 2026, 10:45 AM - 12:15 PM',
      });
    });

    it('leaves out a missing address', () => {
      expect(
        buildPreOrderQueryParamsFromOrder({ reservationId: 'res-1', reservationAddress: '', reservationTime: 'Nov 01' })
          ['reservationLabel'],
      ).toBe('Nov 01');
    });
  });
});
