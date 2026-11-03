/** GET /reservations/{reservationId}/guest-session-id */
export interface OwnerSessionResponse {
  guestSessionId: string;
  /** Lets the owner reach the group endpoints; the guest invite refuses once the group is full. */
  groupReservationId: string;
}
