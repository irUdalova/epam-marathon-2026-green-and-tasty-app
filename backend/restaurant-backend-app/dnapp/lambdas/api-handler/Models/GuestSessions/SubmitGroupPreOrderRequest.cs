using System.Text.Json.Serialization;

namespace APIHandler.Models.GuestSessions;

public class SubmitGroupPreOrderRequest
{
    [JsonPropertyName("reservationId")]
    public string ReservationId { get; set; } = string.Empty;
}
