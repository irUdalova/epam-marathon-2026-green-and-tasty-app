using APIHandler.Helpers;
using APIHandler.Models.GuestSessions;
using APIHandler.Models.Orders;
using System.Text.Json;

namespace APIHandler.Tests.Models;

public class GetAllSessionsResponseSerializationTests
{
    [Fact]
    public void CreateSuccessResponse_GroupSnapshot_UsesCamelCaseNames()
    {
        var snapshot = new GetAllSessionsResponse(
            [new Participant("session-1", ParticipantType.Guest, "Maria", new List<OrderItemResponse>(), 12.5m, true)],
            12.5m);

        var response = ResponseBuilder.CreateSuccessResponse(snapshot);

        using var json = JsonDocument.Parse(response.Body);
        var participant = json.RootElement.GetProperty("participants")[0];
        Assert.Equal(12.5m, json.RootElement.GetProperty("total").GetDecimal());
        Assert.Equal("session-1", participant.GetProperty("id").GetString());
        Assert.Equal("Guest", participant.GetProperty("type").GetString());
        Assert.Equal("Maria", participant.GetProperty("name").GetString());
        Assert.Equal(0, participant.GetProperty("items").GetArrayLength());
        Assert.True(participant.GetProperty("isSubmitted").GetBoolean());
    }
}
