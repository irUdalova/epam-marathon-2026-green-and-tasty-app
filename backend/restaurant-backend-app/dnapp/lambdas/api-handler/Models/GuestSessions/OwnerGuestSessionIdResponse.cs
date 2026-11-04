namespace APIHandler.Models.GuestSessions;

/// <summary>GroupReservationId lets the reservation owner reach the group endpoints without the guest invite.</summary>
public record OwnerGuestSessionIdResponse(string GuestSessionId, string GroupReservationId);
