import { Params } from '@angular/router';

export interface PreOrderReservation {
  id: string;
  locationAddress: string;
  startTime: Date | string;
  endTime: Date | string;
  tableName?: string;
}

// Newer ICU puts a narrow no-break space before AM/PM; a plain space keeps the label predictable.
function formatTime(date: Date): string {
  return date
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    .replace(/\u202f/g, ' ');
}

// "9 Abashidze Street, Sun, Nov 1, 2026, 11:45 AM – 1:15 PM". The table is left out when
// it has no name: a raw table id means nothing to the guest.
export function buildPreOrderLabel(reservation: PreOrderReservation): string {
  const start = new Date(reservation.startTime);
  const end = new Date(reservation.endTime);
  const date = start.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return [
    reservation.locationAddress,
    reservation.tableName,
    date,
    `${formatTime(start)} – ${formatTime(end)}`,
  ]
    .filter(Boolean)
    .join(', ');
}

// Query params that open /menu in pre-order mode (read by MenuPageComponent).
export function buildPreOrderQueryParams(reservation: PreOrderReservation): Params {
  return {
    preOrder: 'true',
    reservationId: reservation.id,
    reservationLabel: buildPreOrderLabel(reservation),
  };
}
