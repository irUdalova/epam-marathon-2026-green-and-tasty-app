/** The backend refuses pre-order changes from 30 minutes before the booking starts. */
export const PRE_ORDER_CUTOFF_MINUTES = 30;

// True once the booking is within the cutoff or has already started. An unreadable time keeps the
// pre-order open, so a bad value never hides a booking; the backend still has the final say.
export function isPreOrderClosed(startTime: Date | string, now: Date = new Date()): boolean {
  const start = new Date(startTime).getTime();

  if (Number.isNaN(start)) {
    return false;
  }

  return now.getTime() >= start - PRE_ORDER_CUTOFF_MINUTES * 60_000;
}
