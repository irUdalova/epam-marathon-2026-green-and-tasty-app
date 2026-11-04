using APIHandler.Helpers;
using APIHandler.Models.Dishes;
using System.Text.Json;

namespace APIHandler.Tests.Models;

public class DishListResponseSerializationTests
{
    [Fact]
    public void CreateSuccessResponse_Dish_SendsFatsInCamelCaseLikeTheOtherFields()
    {
        var dish = new DishListResponse
        {
            Id = "dish-1",
            Name = "Fresh Avocado Toast",
            State = "Available",
            Weight = "200 g",
            DishType = "Appetizer",
            Description = "Smashed avocado on sourdough.",
            Calories = "320 kcal",
            Proteins = "8 g",
            Fats = "18 g",
            Carbohydrates = "30 g",
            Vitamins = "Vitamin C",
        };

        var response = ResponseBuilder.CreateSuccessResponse(new List<DishListResponse> { dish });

        using var json = JsonDocument.Parse(response.Body);
        var first = json.RootElement[0];
        Assert.Equal("18 g", first.GetProperty("fats").GetString());
        Assert.False(first.TryGetProperty("Fats", out _));
    }
}
