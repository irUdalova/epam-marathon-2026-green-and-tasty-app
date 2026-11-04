using APIHandler.Models.Orders;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace APIHandler.Models.GuestSessions;

// The handlers serialize with ResponseBuilder.CreateSuccessResponse (no naming policy), so the names are
// set here to match the documented camelCase contract (docs/ApiRoutes.md).
public record GetAllSessionsResponse(
    [property: JsonPropertyName("participants")] IEnumerable<Participant> Participants,
    [property: JsonPropertyName("total")] decimal Total);

public record Participant(
    [property: JsonPropertyName("id")] string? Id,
    [property: JsonPropertyName("type"), JsonConverter(typeof(JsonStringEnumConverter<ParticipantType>))] ParticipantType Type,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("items")] IEnumerable<OrderItemResponse> Items,
    [property: JsonPropertyName("total")] decimal Total,
    [property: JsonPropertyName("isSubmitted")] bool IsSubmitted);

public enum ParticipantType
{
    Owner,
    Guest
}
