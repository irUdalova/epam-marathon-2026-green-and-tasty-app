using Amazon.CognitoIdentityProvider.Model;
using APIHandler.Constants.Dishes;
using APIHandler.Constants.Orders;
using APIHandler.Entities;
using APIHandler.Exceptions;
using APIHandler.Models.GuestSessions;
using APIHandler.Repositories.Auth;
using APIHandler.Repositories.Dishes;
using APIHandler.Repositories.GroupReservations;
using APIHandler.Repositories.GuestSessions;
using APIHandler.Repositories.Orders;
using APIHandler.Repositories.Reservations;
using APIHandler.Repositories.Tables;
using APIHandler.Services.GuestSessions;
using AutoFixture.Xunit2;
using Moq;
using NPOI.POIFS.Storage;
using System.Security.Cryptography;
using System.Text;

namespace APIHandler.Tests.Services;

public class GuestSessionServiceTests
{
    private readonly Mock<IGuestSessionRepository> _mockGuestSessionRepository = new();
    private readonly Mock<IGroupReservationRepository> _mockGroupReservationRepository = new();
    private readonly Mock<IDishRepository> _mockDishRepository = new();
    private readonly Mock<IReservationRepository> _mockReservationRepository = new();
    private readonly Mock<IUserRepository> _mockUserRepository = new();
    private readonly Mock<ITableRepository> _mockTableRepository = new();
    private readonly Mock<IOrderRepository> _mockOrderRepository = new();
    private readonly GuestSessionService _guestSessionService;

    public GuestSessionServiceTests()
    {
        _guestSessionService = new GuestSessionService(
            _mockGroupReservationRepository.Object,
            _mockGuestSessionRepository.Object,
            _mockDishRepository.Object,
            _mockReservationRepository.Object,
            _mockUserRepository.Object,
            _mockTableRepository.Object,
            _mockOrderRepository.Object);
    }
    [Theory]
    [InlineAutoData(0)]
    [InlineAutoData(3)]
    public async Task CreateGuestSessionAsync_CorrectData_ReturnsSessionToken(
        int guestCount,
        CreateGuestSessionRequest request,
        GroupReservation groupReservation,
        Reservation parentReservation)
    {
        groupReservation.GroupReservationId = request.GroupReservationId;
        groupReservation.Status = GroupReservationStatus.Open;
        groupReservation.ReservationId = parentReservation.Id;

        parentReservation.GuestCount = 5;

        _mockGroupReservationRepository
            .Setup(r => r.GetGroupReservationByIdAsync(groupReservation.GroupReservationId))
            .ReturnsAsync(groupReservation);

        _mockReservationRepository
            .Setup(r => r.GetReservationByIdAsync(parentReservation.Id))
            .ReturnsAsync(parentReservation);

        _mockGuestSessionRepository
            .Setup(r => r.GetAllByGroupReservationIdAsync(groupReservation.GroupReservationId))
            .ReturnsAsync([]);

        GuestSession? session = null;
        _mockGuestSessionRepository
            .Setup(r => r.SaveAsync(It.IsAny<GuestSession>()))
            .Callback<GuestSession>(s => session = s);

        _mockGuestSessionRepository
            .Setup(r => r.CountByGroupReservationId(groupReservation.GroupReservationId))
            .ReturnsAsync(guestCount);

        var response = await _guestSessionService.CreateGuestSessionAsync(request);

        Assert.NotEmpty(response.SessionId);
        Assert.NotEmpty(response.SessionToken);
        Assert.NotNull(session);
        Assert.Equal(groupReservation.GroupReservationId, session.GroupReservationId);
        Assert.Equal(request.GuestName, session.GuestName);
        Assert.NotNull(session.SessionTokenHash);
        Assert.NotEmpty(session.SessionTokenHash);
    }

    [Theory]
    [AutoData]
    public async Task CreateGuestSessionAsync_InvalidGroupReservationId_ThrowsGroupReservationNotFoundException(CreateGuestSessionRequest request)
    {
        _mockGroupReservationRepository
            .Setup(r => r.GetGroupReservationByIdAsync(request.GroupReservationId))
            .ReturnsAsync((GroupReservation?)null);

        await Assert.ThrowsAsync<GroupReservationNotFoundException>(() => _guestSessionService.CreateGuestSessionAsync(request));
    }

    [Theory]
    [AutoData]
    public async Task CreateGuestSessionAsync_GroupReservationExpired_ThrowsGroupReservationExpiredException(CreateGuestSessionRequest request, GroupReservation groupReservation)
    {
        groupReservation.GroupReservationId = request.GroupReservationId;
        groupReservation.Status = GroupReservationStatus.Open;

        _mockGroupReservationRepository
            .Setup(r => r.GetGroupReservationByIdAsync(request.GroupReservationId))
            .ReturnsAsync(groupReservation);

        await Assert.ThrowsAsync<GroupReservationExpiredException>(() => _guestSessionService.CreateGuestSessionAsync(request));
    }

    [Theory]
    [AutoData]
    public async Task AddDishAsync_ShouldAddNewDish_WhenDishDoesNotExistInSession(GuestSession guestSession, GroupReservation groupReservation, Reservation parentReservation, Table table, Dish dish)
    {
        guestSession.Dishes = [];
        guestSession.GroupReservationId = groupReservation.GroupReservationId;
        groupReservation.Status = GroupReservationStatus.Open;

        groupReservation.ReservationId = parentReservation.Id;
        parentReservation.TableId = table.Id;
        dish.State = DishState.Available;
        int quantityToAdd = 2;

        _mockGuestSessionRepository.Setup(r => r.GetByGuestSessionId(guestSession.Id)).ReturnsAsync(guestSession);
        _mockGroupReservationRepository.Setup(r => r.GetGroupReservationByIdAsync(groupReservation.GroupReservationId)).ReturnsAsync(groupReservation);
        _mockReservationRepository.Setup(r => r.GetReservationByIdAsync(parentReservation.Id)).ReturnsAsync(parentReservation);
        _mockTableRepository.Setup(r => r.GetTableAsync(table.Id)).ReturnsAsync(table);
        _mockDishRepository.Setup(r => r.GetDishesByLocationIdAsync(table.LocationId)).ReturnsAsync([dish]);

        await _guestSessionService.AddDishAsync(guestSession.Id, dish.Id, quantityToAdd);

        Assert.Single(guestSession.Dishes);
        Assert.Equal(dish.Id, guestSession.Dishes[0].DishId);
        Assert.Equal(quantityToAdd, guestSession.Dishes[0].Quantity);
        Assert.Equal(OrderItemState.Pending, guestSession.Dishes[0].State);

        _mockGuestSessionRepository.Verify(r => r.SaveAsync(guestSession), Times.Once);
    }

    [Theory]
    [AutoData]
    public async Task AddDishAsync_ShouldIncreaseQuantity_WhenDishAlreadyExists(GuestSession guestSession, GroupReservation groupReservation, Reservation parentReservation, Table table, Dish dish)
    {
        int initialQuantity = 3;
        int quantityToAdd = 2;
        guestSession.Dishes = [new OrderItem { DishId = dish.Id, Quantity = initialQuantity, State = OrderItemState.Pending }];
        guestSession.GroupReservationId = groupReservation.GroupReservationId;
        groupReservation.Status = GroupReservationStatus.Open;

        groupReservation.ReservationId = parentReservation.Id;
        parentReservation.TableId = table.Id;
        dish.State = DishState.Available;

        _mockGuestSessionRepository.Setup(r => r.GetByGuestSessionId(guestSession.Id)).ReturnsAsync(guestSession);
        _mockGroupReservationRepository.Setup(r => r.GetGroupReservationByIdAsync(groupReservation.GroupReservationId)).ReturnsAsync(groupReservation);
        _mockReservationRepository.Setup(r => r.GetReservationByIdAsync(parentReservation.Id)).ReturnsAsync(parentReservation);
        _mockTableRepository.Setup(r => r.GetTableAsync(table.Id)).ReturnsAsync(table);
        _mockDishRepository.Setup(r => r.GetDishesByLocationIdAsync(table.LocationId)).ReturnsAsync([dish]);

        await _guestSessionService.AddDishAsync(guestSession.Id, dish.Id, quantityToAdd);

        Assert.Single(guestSession.Dishes);
        Assert.Equal(initialQuantity + quantityToAdd, guestSession.Dishes[0].Quantity);

        _mockGuestSessionRepository.Verify(r => r.SaveAsync(guestSession), Times.Once);
    }

    [Theory]
    [InlineAutoData(0)]
    [InlineAutoData(-1)]
    public async Task AddDishAsync_ShouldThrowValidationException_WhenQuantityIsZeroOrLess(int quantity, string guestSessionId, Dish dish)
    {
        dish.State = DishState.Available;

        _mockDishRepository
            .Setup(r => r.GetDishByIdAsync(dish.Id))
            .ReturnsAsync(dish);

        await Assert.ThrowsAsync<ValidationException>(() =>
            _guestSessionService.AddDishAsync(guestSessionId, dish.Id, quantity));
    }

    [Theory]
    [AutoData]
    public async Task AddDishAsync_ShouldThrowGuestSessionNotFoundException_WhenSessionNotFound(string guestSessionId, Dish dish)
    {
        dish.State = DishState.Available;

        _mockGuestSessionRepository
            .Setup(r => r.GetByGuestSessionId(guestSessionId))
            .ReturnsAsync((GuestSession?)null);

        _mockDishRepository
            .Setup(r => r.GetDishByIdAsync(dish.Id))
            .ReturnsAsync(dish);

        var exception = await Assert.ThrowsAsync<GuestSessionNotFoundException>(() =>
            _guestSessionService.AddDishAsync(guestSessionId, dish.Id, 2));
    }

    [Theory]
    [AutoData]
    public async Task AddDishAsync_ShouldThrowDishNotFound_WhenDishNotFound(GuestSession guestSession, GroupReservation groupReservation, Reservation parentReservation, Table table, string dishId)
    {
        guestSession.GroupReservationId = groupReservation.GroupReservationId;
        groupReservation.Status = GroupReservationStatus.Open;
        groupReservation.ReservationId = parentReservation.Id;
        parentReservation.TableId = table.Id;

        _mockGuestSessionRepository.Setup(r => r.GetByGuestSessionId(guestSession.Id)).ReturnsAsync(guestSession);
        _mockGroupReservationRepository.Setup(r => r.GetGroupReservationByIdAsync(groupReservation.GroupReservationId)).ReturnsAsync(groupReservation);
        _mockReservationRepository.Setup(r => r.GetReservationByIdAsync(parentReservation.Id)).ReturnsAsync(parentReservation);
        _mockTableRepository.Setup(r => r.GetTableAsync(table.Id)).ReturnsAsync(table);

        _mockDishRepository.Setup(r => r.GetDishesByLocationIdAsync(table.LocationId)).ReturnsAsync([]);

        var exception = await Assert.ThrowsAsync<ValidationException>(() =>
            _guestSessionService.AddDishAsync(guestSession.Id, dishId, quantity: 2));
    }

    [Theory]
    [AutoData]
    public async Task AddDishAsync_ShouldThrowDishNotAvailable_WhenDishIsNotAvailable(GuestSession guestSession, GroupReservation groupReservation, Reservation parentReservation, Table table, Dish dish)
    {
        dish.State = DishState.OutOfStock;
        guestSession.GroupReservationId = groupReservation.GroupReservationId;
        groupReservation.Status = GroupReservationStatus.Open;
        groupReservation.ReservationId = parentReservation.Id;
        parentReservation.TableId = table.Id;

        _mockGuestSessionRepository.Setup(r => r.GetByGuestSessionId(guestSession.Id)).ReturnsAsync(guestSession);
        _mockGroupReservationRepository.Setup(r => r.GetGroupReservationByIdAsync(groupReservation.GroupReservationId)).ReturnsAsync(groupReservation);
        _mockReservationRepository.Setup(r => r.GetReservationByIdAsync(parentReservation.Id)).ReturnsAsync(parentReservation);
        _mockTableRepository.Setup(r => r.GetTableAsync(table.Id)).ReturnsAsync(table);
        _mockDishRepository.Setup(r => r.GetDishesByLocationIdAsync(table.LocationId)).ReturnsAsync([dish]);

        var exception = await Assert.ThrowsAsync<DishIsNotAvailableException>(() =>
            _guestSessionService.AddDishAsync(guestSession.Id, dish.Id, quantity: 2));
    }

    [Theory]
    [InlineAutoData(GroupReservationStatus.Submitted, typeof(GroupReservationSubmittedException))]
    [InlineAutoData(GroupReservationStatus.Closed, typeof(GroupReservationExpiredException))]
    public async Task AddDishAsync_ShouldThrowGroupReservationExpired_WhenGroupStatusIsNotOpen(GroupReservationStatus status, Type exceptionType, GuestSession guestSession, GroupReservation groupReservation, Dish dish)
    {
        dish.State = DishState.Available;
        guestSession.GroupReservationId = groupReservation.GroupReservationId;
        groupReservation.Status = status;

        _mockGuestSessionRepository
            .Setup(r => r.GetByGuestSessionId(guestSession.Id))
            .ReturnsAsync(guestSession);

        _mockDishRepository
            .Setup(r => r.GetDishByIdAsync(dish.Id))
            .ReturnsAsync(dish);

        _mockGroupReservationRepository
            .Setup(r => r.GetGroupReservationByIdAsync(groupReservation.GroupReservationId))
            .ReturnsAsync(groupReservation);

        var exception = await Assert.ThrowsAsync(exceptionType, () =>
            _guestSessionService.AddDishAsync(guestSession.Id, dish.Id, quantity: 2));
    }

    [Theory]
    [AutoData]
    public async Task RemoveDishAsync_ShouldDecreaseQuantity_WhenQuantityIsGreaterThanAmountToRemove(GuestSession guestSession, GroupReservation groupReservation, string dishId)
    {
        int initialQuantity = 5;
        int quantityToRemove = 2;
        guestSession.Dishes =
        [
            new OrderItem { DishId = dishId, Quantity = initialQuantity, State = OrderItemState.Pending }
        ];
        guestSession.GroupReservationId = groupReservation.GroupReservationId;
        groupReservation.Status = GroupReservationStatus.Open;

        _mockGuestSessionRepository
            .Setup(r => r.GetByGuestSessionId(guestSession.Id))
            .ReturnsAsync(guestSession);


        _mockGroupReservationRepository
            .Setup(r => r.GetGroupReservationByIdAsync(groupReservation.GroupReservationId))
            .ReturnsAsync(groupReservation);

        await _guestSessionService.RemoveDishAsync(guestSession.Id, dishId, quantityToRemove);

        Assert.Single(guestSession.Dishes);
        Assert.Equal(initialQuantity - quantityToRemove, guestSession.Dishes[0].Quantity);

        _mockGuestSessionRepository.Verify(r => r.SaveAsync(guestSession), Times.Once);
    }

    [Theory]
    [AutoData]
    public async Task RemoveDishAsync_ShouldRemoveDishFromList_WhenQuantityToRemoveIsEqualOrGreater(GuestSession guestSession, GroupReservation groupReservation, string dishId)
    {
        int initialQuantity = 2;
        int quantityToRemove = 3;
        guestSession.Dishes =
        [
            new OrderItem { DishId = dishId, Quantity = initialQuantity, State = OrderItemState.Pending }
        ];
        guestSession.GroupReservationId = groupReservation.GroupReservationId;
        groupReservation.Status = GroupReservationStatus.Open;

        _mockGuestSessionRepository
            .Setup(r => r.GetByGuestSessionId(guestSession.Id))
            .ReturnsAsync(guestSession);

        _mockGroupReservationRepository
            .Setup(r => r.GetGroupReservationByIdAsync(groupReservation.GroupReservationId))
            .ReturnsAsync(groupReservation);

        await _guestSessionService.RemoveDishAsync(guestSession.Id, dishId, quantityToRemove);

        Assert.Empty(guestSession.Dishes);
        _mockGuestSessionRepository.Verify(r => r.SaveAsync(guestSession), Times.Once);
    }

    [Theory]
    [AutoData]
    public async Task RemoveDishAsync_ShouldThrowDishNotFoundException_WhenDishDoesNotExistInSession(GuestSession guestSession, GroupReservation groupReservation, string dishId)
    {
        guestSession.Dishes = [];
        guestSession.GroupReservationId = groupReservation.GroupReservationId;
        groupReservation.Status = GroupReservationStatus.Open;

        _mockGuestSessionRepository
            .Setup(r => r.GetByGuestSessionId(guestSession.Id))
            .ReturnsAsync(guestSession);

        _mockGroupReservationRepository
           .Setup(r => r.GetGroupReservationByIdAsync(groupReservation.GroupReservationId))
           .ReturnsAsync(groupReservation);

        var exception = await Assert.ThrowsAsync<DishNotFoundException>(() =>
            _guestSessionService.RemoveDishAsync(guestSession.Id, dishId, 2));

        Assert.Contains("not found in guest session", exception.Message);
    }

    [Theory]
    [AutoData]
    public async Task RemoveDishAsync_ShouldThrowValidationException_WhenQuantityIsZeroOrLess(string guestSessionId, string dishId)
    {
        await Assert.ThrowsAsync<ValidationException>(() =>
            _guestSessionService.RemoveDishAsync(guestSessionId, dishId, 0));

        await Assert.ThrowsAsync<ValidationException>(() =>
            _guestSessionService.RemoveDishAsync(guestSessionId, dishId, -5));
    }

    [Theory]
    [AutoData]
    public async Task RemoveDishAsync_ShouldThrowGuestSessionNotFoundException_WhenSessionNotFound(string guestSessionId, string dishId)
    {
        _mockGuestSessionRepository
            .Setup(r => r.GetByGuestSessionId(guestSessionId))
            .ReturnsAsync((GuestSession?)null);

        var exception = await Assert.ThrowsAsync<GuestSessionNotFoundException>(() =>
            _guestSessionService.RemoveDishAsync(guestSessionId, dishId, 2));
    }
    [Theory]
    [InlineAutoData(1, 0)]
    [InlineAutoData(1, 1)]
    [InlineAutoData(2, 1)]
    [InlineAutoData(2, 2)]
    public async Task CreateGuestSessionAsync_WhenCapacityReached_ThrowsGuestLimitExceededException(
        int reservationCapacity,
        int guestCount,
        CreateGuestSessionRequest request,
        GroupReservation groupReservation,
        Reservation parentReservation)
    {
        groupReservation.Status = GroupReservationStatus.Open;
        groupReservation.GroupReservationId = request.GroupReservationId;
        groupReservation.ReservationId = parentReservation.Id;

        parentReservation.GuestCount = reservationCapacity;

        _mockGroupReservationRepository
            .Setup(r => r.GetGroupReservationByIdAsync(groupReservation.GroupReservationId))
            .ReturnsAsync(groupReservation);

        _mockReservationRepository
            .Setup(r => r.GetReservationByIdAsync(parentReservation.Id))
            .ReturnsAsync(parentReservation);

        _mockGuestSessionRepository
            .Setup(r => r.CountByGroupReservationId(groupReservation.GroupReservationId))
            .ReturnsAsync(guestCount);

        var exception = await Assert.ThrowsAsync<GuestLimitExceededException>(() => _guestSessionService.CreateGuestSessionAsync(request));

        _mockGuestSessionRepository.Verify(r => r.SaveAsync(It.IsAny<GuestSession>()), Times.Never);
    }

    [Theory]
    [AutoData]
    public async Task CreateGuestSessionAsync_MissingParentReservation_ThrowsGroupReservationExpiredException(
        CreateGuestSessionRequest request,
        GroupReservation groupReservation)
    {
        groupReservation.GroupReservationId = request.GroupReservationId;
        groupReservation.Status = GroupReservationStatus.Open;

        _mockGroupReservationRepository
            .Setup(r => r.GetGroupReservationByIdAsync(groupReservation.GroupReservationId))
            .ReturnsAsync(groupReservation);

        _mockReservationRepository
            .Setup(r => r.GetReservationByIdAsync(groupReservation.ReservationId))
            .ReturnsAsync((Reservation?)null);

        var exception = await Assert.ThrowsAsync<GroupReservationExpiredException>(() => _guestSessionService.CreateGuestSessionAsync(request));
    }

    [Theory]
    [AutoData]
    public async Task IsAuthorizedAsync_ValidTokenAndId_ReturnsTrue(GuestSession guestSession, byte[] tokenBytes)
    {
        string tokenString = Convert.ToBase64String(tokenBytes);
        var hashString = Convert.ToBase64String(SHA256.HashData(tokenBytes));
        guestSession.SessionTokenHash = hashString;

        _mockGuestSessionRepository
            .Setup(r => r.GetByTokenHash(hashString))
            .ReturnsAsync(guestSession);

        bool result = await _guestSessionService.IsAuthorizedAsync(tokenString, guestSession.Id);

        Assert.True(result);
    }

    [Theory]
    [AutoData]
    public async Task IsAuthorizedAsync_InvalidToken_ReturnsFalse(byte[] tokenBytes, string guestSessionId)
    {
        string tokenString = Convert.ToBase64String(tokenBytes);
        var hashString = Convert.ToBase64String(SHA256.HashData(tokenBytes));

        _mockGuestSessionRepository
            .Setup(r => r.GetByTokenHash(hashString))
            .ReturnsAsync((GuestSession?)null);

        bool result = await _guestSessionService.IsAuthorizedAsync(tokenString, guestSessionId);

        Assert.False(result);
    }

    [Theory]
    [AutoData]
    public async Task IsAuthorizedAsync_InvalidGuestSessionId_ReturnsFalse(GuestSession guestSession, byte[] tokenBytes, string guestSessionId)
    {
        string tokenString = Convert.ToBase64String(tokenBytes);
        var hashString = Convert.ToBase64String(SHA256.HashData(tokenBytes));
        guestSession.SessionTokenHash = hashString;

        _mockGuestSessionRepository
            .Setup(r => r.GetByTokenHash(hashString))
            .ReturnsAsync(guestSession);

        bool result = await _guestSessionService.IsAuthorizedAsync(tokenString, guestSessionId);

        Assert.False(result);
    }
    [Theory]
    [AutoData]
    public async Task SubmitCartAsync_Valid_SubmitsSuccessfuilly(GuestSession guestSession, GroupReservation groupReservation, Dish[] dishes)
    {
        foreach (var dish in dishes)
            dish.State = DishState.Available;

        guestSession.IsSubmitted = false;
        guestSession.GroupReservationId = groupReservation.GroupReservationId;

        _mockGuestSessionRepository
            .Setup(r => r.GetByGuestSessionId(guestSession.Id))
            .ReturnsAsync(guestSession);

        _mockGroupReservationRepository
           .Setup(r => r.GetGroupReservationByIdAsync(guestSession.GroupReservationId))
           .ReturnsAsync(groupReservation);

        _mockDishRepository
            .Setup(d => d.GetDishesByIdsAsync(It.IsAny<IEnumerable<string>>()))
            .ReturnsAsync(dishes);

        GuestSession? session = null;
        _mockGuestSessionRepository
            .Setup(r => r.SaveAsync(It.IsAny<GuestSession>()))
            .Callback<GuestSession>(s => session = s);

        await _guestSessionService.SubmitCartAsync(guestSession.Id);

        Assert.NotNull(session);
        Assert.True(session.IsSubmitted);
    }

    [Theory]
    [AutoData]
    public async Task SubmitCartAsync_SessionNotFound_ThrowsGuestSessionNotFound(string guestSessionId)
    {
        _mockGuestSessionRepository
            .Setup(r => r.GetByGuestSessionId(guestSessionId))
            .ReturnsAsync((GuestSession?)null);

        await Assert.ThrowsAsync<GuestSessionNotFoundException>(() => _guestSessionService.SubmitCartAsync(guestSessionId));
    }

    [Theory]
    [InlineAutoData(GroupReservationStatus.Submitted, typeof(GroupReservationSubmittedException))]
    [InlineAutoData(GroupReservationStatus.Closed, typeof(GroupReservationExpiredException))]
    public async Task SubmitCartAsync_GroupReservationNotOpen_ThrowsException(GroupReservationStatus status, Type exceptionType, GuestSession guestSession, GroupReservation groupReservation)
    {
        guestSession.GroupReservationId = groupReservation.GroupReservationId;
        groupReservation.Status = status;

        _mockGuestSessionRepository
            .Setup(r => r.GetByGuestSessionId(guestSession.Id))
            .ReturnsAsync(guestSession);

        _mockGroupReservationRepository
            .Setup(r => r.GetGroupReservationByIdAsync(guestSession.GroupReservationId))
            .ReturnsAsync(groupReservation);

        await Assert.ThrowsAsync(exceptionType, () => _guestSessionService.SubmitCartAsync(guestSession.Id));
    }

    [Theory]
    [AutoData]
    public async Task SubmitCartAsync_GuestSessionHasNoDishes_ThrowsCartIsEmptyException(GuestSession guestSession, GroupReservation groupReservation)
    {
        guestSession.Dishes = [];
        guestSession.GroupReservationId = groupReservation.GroupReservationId;
        groupReservation.Status = GroupReservationStatus.Open;

        _mockGuestSessionRepository
            .Setup(r => r.GetByGuestSessionId(guestSession.Id))
            .ReturnsAsync(guestSession);

        _mockGroupReservationRepository
            .Setup(r => r.GetGroupReservationByIdAsync(guestSession.GroupReservationId))
            .ReturnsAsync(groupReservation);

        await Assert.ThrowsAsync<CartIsEmptyException>(() => _guestSessionService.SubmitCartAsync(guestSession.Id));
    }

    [Theory]
    [AutoData]
    public async Task SubmitCartAsync_GuestSessionSubmitted_ThrowsAlreadySubmited(GuestSession guestSession, GroupReservation groupReservation)
    {
        guestSession.IsSubmitted = true;
        guestSession.GroupReservationId = groupReservation.GroupReservationId;
        groupReservation.Status = GroupReservationStatus.Open;

        _mockGuestSessionRepository
            .Setup(r => r.GetByGuestSessionId(guestSession.Id))
            .ReturnsAsync(guestSession);

        _mockGroupReservationRepository
            .Setup(r => r.GetGroupReservationByIdAsync(guestSession.GroupReservationId))
            .ReturnsAsync(groupReservation);

        await Assert.ThrowsAsync<GuestSessionSubmittedException>(() => _guestSessionService.SubmitCartAsync(guestSession.Id));
    }

    [Theory]
    [InlineAutoData(DishState.OutOfStock)]
    [InlineAutoData(DishState.OnStop)]
    public async Task SubmitCartAsync_DishNotAvailable_ThrowsDishNotAvailable(DishState state, Dish dish, GuestSession guestSession, GroupReservation groupReservation)
    {
        dish.State = state;
        guestSession.IsSubmitted = false;
        guestSession.GroupReservationId = groupReservation.GroupReservationId;
        guestSession.Dishes = 
        [
            new OrderItem()
            {
                DishId = dish.Id,
                Quantity = 1,
            }
        ];

        _mockDishRepository
            .Setup(d => d.GetDishesByIdsAsync(It.IsAny<IEnumerable<string>>()))
            .ReturnsAsync([dish]);

        _mockGuestSessionRepository
            .Setup(r => r.GetByGuestSessionId(guestSession.Id))
            .ReturnsAsync(guestSession);

        _mockGroupReservationRepository
           .Setup(r => r.GetGroupReservationByIdAsync(guestSession.GroupReservationId))
           .ReturnsAsync(groupReservation);

        await Assert.ThrowsAsync<DishIsNotAvailableException>(() => _guestSessionService.SubmitCartAsync(guestSession.Id));
    }
    [Theory]
    [MemberAutoData(nameof(PepareDishesForGuestSession))]
    public async Task GetGuestSessionInfoAsync_Guest_ReturnsAsync(
        IEnumerable<string> dishIds,
        IEnumerable<Dish> dishes,
        List<OrderItem> orderItems,
        decimal expectedTotal,
        GuestSession session)
    {
        session.Dishes = orderItems;
        session.IsOwnerSession = false;

        _mockDishRepository
            .Setup(r => r.GetDishesByIdsAsync(dishIds))
            .ReturnsAsync(dishes);

        _mockGuestSessionRepository
            .Setup(r => r.GetByGuestSessionId(session.Id))
            .ReturnsAsync(session);

        GetGuestSessionResponse result = await _guestSessionService.GetGuestSessionInfoAsync(session.Id);

        Assert.Equal(session.GuestName, result.Name);
        Assert.Equal(dishes.Count(), result.Items.Count());
        Assert.Equal(expectedTotal, result.Total);
    }

    [Theory]
    [MemberAutoData(nameof(PepareDishesForGuestSession))]
    public async Task GetGuestSessionInfoAsync_GroupOwner_ReturnsAsync(
        IEnumerable<string> dishIds,
        IEnumerable<Dish> dishes,
        List<OrderItem> orderItems,
        decimal expectedTotal,
        GuestSession session,
        GroupReservation groupReservation,
        Reservation reservation,
        string customerId,
        string ownerName,
        UserType userType)
    {
        session.Dishes = orderItems;
        session.IsOwnerSession = true;
        session.GroupReservationId = groupReservation.GroupReservationId;
        groupReservation.ReservationId = reservation.Id;
        reservation.CustomerId = customerId;
        userType.Attributes.Add(new AttributeType()
        {
            Name = "given_name",
            Value = ownerName,
        });

        _mockDishRepository
            .Setup(r => r.GetDishesByIdsAsync(dishIds))
            .ReturnsAsync(dishes);

        _mockGuestSessionRepository
            .Setup(r => r.GetByGuestSessionId(session.Id))
            .ReturnsAsync(session);

        _mockGroupReservationRepository
            .Setup(r => r.GetGroupReservationByIdAsync(groupReservation.GroupReservationId))
            .ReturnsAsync(groupReservation);

        _mockReservationRepository
            .Setup(r => r.GetReservationByIdAsync(reservation.Id))
            .ReturnsAsync(reservation);

        _mockUserRepository
            .Setup(r => r.GetUserByIdAsync(customerId))
            .ReturnsAsync(userType);

        GetGuestSessionResponse result = await _guestSessionService.GetGuestSessionInfoAsync(session.Id);

        Assert.Equal(ownerName, result.Name);
        Assert.Equal(dishes.Count(), result.Items.Count());
        Assert.Equal(expectedTotal, result.Total);
    }

    public static TheoryData<IEnumerable<string>, IEnumerable<Dish>, List<OrderItem>, decimal> PepareDishesForGuestSession()
    {
        var dishMap = new Dictionary<string, Dish>()
        {
            ["1"] = new()
            {
                Id = "1",
                Price = 1
            },
            ["2"] = new()
            {
                Id = "2",
                Price = 2
            },
            ["3"] = new()
            {
                Id = "3",
                Price = 3
            }
        };

        var orderItems = new List<OrderItem>
        {
            new OrderItem()
                    {
                        DishId = "1",
                        Quantity = 2
                    },
                    new OrderItem()
                    {
                        DishId = "2",
                        Quantity = 3
                    },
                    new OrderItem()
                    {
                        DishId = "3",
                        Quantity = 1
                    }
        };

        var expectedTotal = orderItems.Sum(o => dishMap[o.DishId].Price * o.Quantity);

        return new()
        {
            { dishMap.Keys, dishMap.Values, orderItems, expectedTotal }
        };
    }

    [Theory, AutoData]
    public async Task GetGroupSessionsAsync_Owner_ReturnsOwnerOrderFirstAndGuestsWithTotals(
        GroupReservation groupReservation, Reservation reservation, string ownerId, UserType ownerUser)
    {
        SetupOwnedGroup(groupReservation, reservation, ownerId);
        groupReservation.Status = GroupReservationStatus.Open;
        ownerUser.Attributes.Add(new AttributeType { Name = "given_name", Value = "Iryna" });
        _mockUserRepository.Setup(r => r.GetUserByIdAsync(ownerId)).ReturnsAsync(ownerUser);

        var andrii = BuildSession("session1", "Andrii", groupReservation.GroupReservationId, isSubmitted: true, ("dish1", 2));
        var olena = BuildSession("session2", "Olena", groupReservation.GroupReservationId, isSubmitted: false, ("dish2", 1));
        var ownerSession = BuildOwnerSession(groupReservation.GroupReservationId, ownerId);

        _mockGuestSessionRepository
            .Setup(r => r.GetAllByGroupReservationIdAsync(groupReservation.GroupReservationId))
            .ReturnsAsync([andrii, olena, ownerSession]);
        _mockOrderRepository
            .Setup(r => r.GetOrderByReservationIdAsync(reservation.Id))
            .ReturnsAsync(BuildOrder(reservation.Id, ownerId, ("dish1", 1)));
        SetupDishes(new Dish { Id = "dish1", Name = "Caesar Salad", Price = 180 }, new Dish { Id = "dish2", Name = "Tom Yum", Price = 220 });

        var result = await _guestSessionService.GetGroupSessionsAsync(ownerId, groupReservation.GroupReservationId);

        var participants = result.Participants.ToList();
        Assert.Equal(3, participants.Count);

        Assert.Equal(ParticipantType.Owner, participants[0].Type);
        Assert.Equal(ownerSession.Id, participants[0].Id);
        Assert.Equal("Iryna", participants[0].Name);
        Assert.Equal("Caesar Salad", Assert.Single(participants[0].Items).Dish.Name);
        Assert.Equal(180, participants[0].Total);
        Assert.False(participants[0].IsSubmitted);

        Assert.Equal(ParticipantType.Guest, participants[1].Type);
        Assert.Equal("Andrii", participants[1].Name);
        Assert.Equal(360, participants[1].Total);
        Assert.True(participants[1].IsSubmitted);

        Assert.Equal("Olena", participants[2].Name);
        Assert.Equal(220, participants[2].Total);
        Assert.False(participants[2].IsSubmitted);

        Assert.Equal(760, result.Total);
    }

    [Theory, AutoData]
    public async Task GetGroupSessionsAsync_NoSessionsAndNoOrder_ReturnsEmptyOwnerRow(
        GroupReservation groupReservation, Reservation reservation, string ownerId)
    {
        SetupOwnedGroup(groupReservation, reservation, ownerId);
        groupReservation.Status = GroupReservationStatus.Open;
        _mockGuestSessionRepository
            .Setup(r => r.GetAllByGroupReservationIdAsync(groupReservation.GroupReservationId))
            .ReturnsAsync([]);
        SetupDishes();

        var result = await _guestSessionService.GetGroupSessionsAsync(ownerId, groupReservation.GroupReservationId);

        var owner = Assert.Single(result.Participants);
        Assert.Equal(ParticipantType.Owner, owner.Type);
        Assert.Null(owner.Id);
        Assert.Equal("Owner", owner.Name);
        Assert.Empty(owner.Items);
        Assert.Equal(0, result.Total);
    }

    [Theory, AutoData]
    public async Task GetGroupSessionsAsync_DishDeletedFromMenu_SkipsItAndExcludesFromTotals(
        GroupReservation groupReservation, Reservation reservation, string ownerId)
    {
        SetupOwnedGroup(groupReservation, reservation, ownerId);
        groupReservation.Status = GroupReservationStatus.Open;
        var guest = BuildSession("session1", "Andrii", groupReservation.GroupReservationId, isSubmitted: true, ("dish1", 2), ("deleted-dish", 5));
        _mockGuestSessionRepository
            .Setup(r => r.GetAllByGroupReservationIdAsync(groupReservation.GroupReservationId))
            .ReturnsAsync([guest]);
        _mockOrderRepository
            .Setup(r => r.GetOrderByReservationIdAsync(reservation.Id))
            .ReturnsAsync(BuildOrder(reservation.Id, ownerId, ("deleted-dish", 1)));
        SetupDishes(new Dish { Id = "dish1", Name = "Caesar Salad", Price = 180 });

        var result = await _guestSessionService.GetGroupSessionsAsync(ownerId, groupReservation.GroupReservationId);

        var participants = result.Participants.ToList();
        Assert.Empty(participants[0].Items);
        Assert.Equal(0, participants[0].Total);
        Assert.Equal("dish1", Assert.Single(participants[1].Items).Dish.Id);
        Assert.Equal(360, participants[1].Total);
        Assert.Equal(360, result.Total);
    }

    [Theory, AutoData]
    public async Task GetGroupSessionsAsync_GroupSubmitted_OwnerRowExcludesMergedGuestDishes(
        GroupReservation groupReservation, Reservation reservation, string ownerId)
    {
        SetupOwnedGroup(groupReservation, reservation, ownerId);
        groupReservation.Status = GroupReservationStatus.Submitted;
        var andrii = BuildSession("session1", "Andrii", groupReservation.GroupReservationId, isSubmitted: true, ("dish1", 2), ("dish2", 1));
        var olena = BuildSession("session2", "Olena", groupReservation.GroupReservationId, isSubmitted: true, ("dish1", 1));
        var taras = BuildSession("session3", "Taras", groupReservation.GroupReservationId, isSubmitted: false, ("dish1", 5));
        _mockGuestSessionRepository
            .Setup(r => r.GetAllByGroupReservationIdAsync(groupReservation.GroupReservationId))
            .ReturnsAsync([andrii, olena, taras]);

        // Owner ordered dish1 x1 and dish3 x1; the submit merged Andrii's and Olena's dishes in (not Taras').
        var order = BuildOrder(reservation.Id, ownerId, ("dish1", 4), ("dish2", 1), ("dish3", 1));
        order.Status = OrderStatus.SubmittedByCustomer;
        _mockOrderRepository.Setup(r => r.GetOrderByReservationIdAsync(reservation.Id)).ReturnsAsync(order);
        SetupDishes(
            new Dish { Id = "dish1", Price = 10 },
            new Dish { Id = "dish2", Price = 20 },
            new Dish { Id = "dish3", Price = 30 });

        var result = await _guestSessionService.GetGroupSessionsAsync(ownerId, groupReservation.GroupReservationId);

        var owner = result.Participants.First();
        Assert.Equal(ParticipantType.Owner, owner.Type);
        Assert.True(owner.IsSubmitted);
        Assert.Equal(
            [("dish1", 1), ("dish3", 1)],
            owner.Items.Select(i => (i.Dish.Id, i.Quantity)).OrderBy(i => i.Id).ToArray());
        Assert.Equal(40, owner.Total);

        // Owner 40 + Andrii 40 + Olena 10 + Taras 50: the merged dishes are counted once.
        Assert.Equal(140, result.Total);
    }

    [Theory, AutoData]
    public async Task GetGroupSessionsAsync_OrderItemCanceledByWaiter_SkippedInOwnerRow(
        GroupReservation groupReservation, Reservation reservation, string ownerId)
    {
        SetupOwnedGroup(groupReservation, reservation, ownerId);
        groupReservation.Status = GroupReservationStatus.Open;
        _mockGuestSessionRepository
            .Setup(r => r.GetAllByGroupReservationIdAsync(groupReservation.GroupReservationId))
            .ReturnsAsync([]);
        var order = BuildOrder(reservation.Id, ownerId, ("dish1", 1), ("dish2", 2));
        order.Dishes.Single(d => d.DishId == "dish2").State = OrderItemState.Canceled;
        _mockOrderRepository.Setup(r => r.GetOrderByReservationIdAsync(reservation.Id)).ReturnsAsync(order);
        SetupDishes(new Dish { Id = "dish1", Price = 10 }, new Dish { Id = "dish2", Price = 20 });

        var result = await _guestSessionService.GetGroupSessionsAsync(ownerId, groupReservation.GroupReservationId);

        var owner = Assert.Single(result.Participants);
        Assert.Equal("dish1", Assert.Single(owner.Items).Dish.Id);
        Assert.Equal(10, result.Total);
    }

    [Theory, AutoData]
    public async Task GetGroupSessionsAsync_CallerIsNotOwner_ThrowsActionForbidden(
        GroupReservation groupReservation, Reservation reservation, string ownerId, string otherUserId)
    {
        SetupOwnedGroup(groupReservation, reservation, ownerId);

        await Assert.ThrowsAsync<ActionForbiddenException>(
            () => _guestSessionService.GetGroupSessionsAsync(otherUserId, groupReservation.GroupReservationId));
        _mockGuestSessionRepository.Verify(r => r.GetAllByGroupReservationIdAsync(It.IsAny<string>()), Times.Never);
    }

    [Theory, AutoData]
    public async Task GetGroupSessionsAsync_GroupNotFound_ThrowsGroupReservationNotFound(string groupReservationId, string userId)
    {
        _mockGroupReservationRepository
            .Setup(r => r.GetGroupReservationByIdAsync(groupReservationId))
            .ReturnsAsync((GroupReservation?)null);

        await Assert.ThrowsAsync<GroupReservationNotFoundException>(
            () => _guestSessionService.GetGroupSessionsAsync(userId, groupReservationId));
    }

    [Theory, AutoData]
    public async Task GetGroupSessionsAsync_ReservationNotFound_ThrowsReservationNotFound(GroupReservation groupReservation, string userId)
    {
        _mockGroupReservationRepository
            .Setup(r => r.GetGroupReservationByIdAsync(groupReservation.GroupReservationId))
            .ReturnsAsync(groupReservation);
        _mockReservationRepository
            .Setup(r => r.GetReservationByIdAsync(groupReservation.ReservationId))
            .ReturnsAsync((Reservation?)null);

        await Assert.ThrowsAsync<ReservationNotFoundException>(
            () => _guestSessionService.GetGroupSessionsAsync(userId, groupReservation.GroupReservationId));
    }

    [Theory, AutoData]
    public async Task DeleteGuestSessionAsync_Owner_DeletesAndReturnsRemainingParticipants(
        GroupReservation groupReservation, Reservation reservation, string ownerId)
    {
        SetupOwnedGroup(groupReservation, reservation, ownerId);
        groupReservation.Status = GroupReservationStatus.Open;
        var andrii = BuildSession("session1", "Andrii", groupReservation.GroupReservationId, isSubmitted: true, ("dish1", 2));
        var olena = BuildSession("session2", "Olena", groupReservation.GroupReservationId, isSubmitted: false, ("dish2", 1));

        _mockGuestSessionRepository.Setup(r => r.GetByGuestSessionId(andrii.Id)).ReturnsAsync(andrii);
        _mockGuestSessionRepository
            .Setup(r => r.GetAllByGroupReservationIdAsync(groupReservation.GroupReservationId))
            .ReturnsAsync([olena]);
        SetupDishes(new Dish { Id = "dish2", Name = "Tom Yum", Price = 220 });

        var result = await _guestSessionService.DeleteGuestSessionAsync(ownerId, groupReservation.GroupReservationId, andrii.Id);

        _mockGuestSessionRepository.Verify(r => r.DeleteAsync(andrii), Times.Once);
        var participants = result.Participants.ToList();
        Assert.Equal(2, participants.Count);
        Assert.Equal(ParticipantType.Owner, participants[0].Type);
        Assert.Equal("Olena", participants[1].Name);
        Assert.Equal(220, result.Total);
    }

    [Theory, AutoData]
    public async Task DeleteGuestSessionAsync_SessionNotFound_ThrowsGuestSessionNotFound(
        GroupReservation groupReservation, Reservation reservation, string ownerId, string guestSessionId)
    {
        SetupOwnedGroup(groupReservation, reservation, ownerId);
        groupReservation.Status = GroupReservationStatus.Open;
        _mockGuestSessionRepository.Setup(r => r.GetByGuestSessionId(guestSessionId)).ReturnsAsync((GuestSession?)null);

        await Assert.ThrowsAsync<GuestSessionNotFoundException>(
            () => _guestSessionService.DeleteGuestSessionAsync(ownerId, groupReservation.GroupReservationId, guestSessionId));
        VerifyNothingDeleted();
    }

    [Theory, AutoData]
    public async Task DeleteGuestSessionAsync_SessionFromAnotherGroup_ThrowsValidation(
        GroupReservation groupReservation, Reservation reservation, string ownerId, string otherGroupId)
    {
        SetupOwnedGroup(groupReservation, reservation, ownerId);
        groupReservation.Status = GroupReservationStatus.Open;
        var foreign = BuildSession("session1", "Andrii", otherGroupId, isSubmitted: true, ("dish1", 2));
        _mockGuestSessionRepository.Setup(r => r.GetByGuestSessionId(foreign.Id)).ReturnsAsync(foreign);

        await Assert.ThrowsAsync<ValidationException>(
            () => _guestSessionService.DeleteGuestSessionAsync(ownerId, groupReservation.GroupReservationId, foreign.Id));
        VerifyNothingDeleted();
    }

    [Theory, AutoData]
    public async Task DeleteGuestSessionAsync_CallerIsNotOwner_ThrowsActionForbidden(
        GroupReservation groupReservation, Reservation reservation, string ownerId, string otherUserId)
    {
        SetupOwnedGroup(groupReservation, reservation, ownerId);
        groupReservation.Status = GroupReservationStatus.Open;

        await Assert.ThrowsAsync<ActionForbiddenException>(
            () => _guestSessionService.DeleteGuestSessionAsync(otherUserId, groupReservation.GroupReservationId, "session1"));
        _mockGuestSessionRepository.Verify(r => r.GetByGuestSessionId(It.IsAny<string>()), Times.Never);
        VerifyNothingDeleted();
    }

    [Theory, AutoData]
    public async Task DeleteGuestSessionAsync_GroupNotFound_ThrowsGroupReservationNotFound(
        string groupReservationId, string userId, string guestSessionId)
    {
        _mockGroupReservationRepository
            .Setup(r => r.GetGroupReservationByIdAsync(groupReservationId))
            .ReturnsAsync((GroupReservation?)null);

        await Assert.ThrowsAsync<GroupReservationNotFoundException>(
            () => _guestSessionService.DeleteGuestSessionAsync(userId, groupReservationId, guestSessionId));
        VerifyNothingDeleted();
    }

    [Theory, AutoData]
    public async Task DeleteGuestSessionAsync_OwnerSession_ThrowsValidation(
        GroupReservation groupReservation, Reservation reservation, string ownerId)
    {
        SetupOwnedGroup(groupReservation, reservation, ownerId);
        groupReservation.Status = GroupReservationStatus.Open;
        var owner = BuildOwnerSession(groupReservation.GroupReservationId, ownerId);
        _mockGuestSessionRepository.Setup(r => r.GetByGuestSessionId(owner.Id)).ReturnsAsync(owner);

        await Assert.ThrowsAsync<ValidationException>(
            () => _guestSessionService.DeleteGuestSessionAsync(ownerId, groupReservation.GroupReservationId, owner.Id));
        VerifyNothingDeleted();
    }

    [Theory]
    [InlineAutoData(GroupReservationStatus.Submitted, typeof(GroupReservationSubmittedException))]
    [InlineAutoData(GroupReservationStatus.Closed, typeof(GroupReservationExpiredException))]
    public async Task DeleteGuestSessionAsync_GroupNotOpen_Throws(
        GroupReservationStatus status, Type exceptionType, GroupReservation groupReservation, Reservation reservation, string ownerId)
    {
        SetupOwnedGroup(groupReservation, reservation, ownerId);
        groupReservation.Status = status;
        var guest = BuildSession("session1", "Andrii", groupReservation.GroupReservationId, isSubmitted: true, ("dish1", 2));
        _mockGuestSessionRepository.Setup(r => r.GetByGuestSessionId(guest.Id)).ReturnsAsync(guest);

        await Assert.ThrowsAsync(exceptionType,
            () => _guestSessionService.DeleteGuestSessionAsync(ownerId, groupReservation.GroupReservationId, guest.Id));
        VerifyNothingDeleted();
    }

    private void VerifyNothingDeleted()
        => _mockGuestSessionRepository.Verify(r => r.DeleteAsync(It.IsAny<GuestSession>()), Times.Never);

    [Theory, AutoData]
    public async Task GetGroupReservationStatusAsync_OwnerSessionExists_DoesNotCountOwnerTwice(
        GroupReservation groupReservation, Reservation reservation, string ownerId)
    {
        SetupOwnedGroup(groupReservation, reservation, ownerId);
        var guest = BuildSession("session1", "Andrii", groupReservation.GroupReservationId, isSubmitted: true);
        var owner = BuildOwnerSession(groupReservation.GroupReservationId, ownerId);
        _mockGuestSessionRepository
            .Setup(r => r.GetAllByGroupReservationIdAsync(groupReservation.GroupReservationId))
            .ReturnsAsync([guest, owner]);

        var result = await _guestSessionService.GetGroupReservationStatusAsync(groupReservation.GroupReservationId);

        Assert.Equal(2, result.CurrentParticipants);
    }

    [Theory, AutoData]
    public async Task GetOwnerGuestSessionIdAsync_OwnerSessionExists_ReturnsItWithoutCreating(
        GroupReservation groupReservation, Reservation reservation, string ownerId)
    {
        SetupOwnedGroupByReservation(groupReservation, reservation, ownerId);
        var owner = BuildOwnerSession(groupReservation.GroupReservationId, ownerId);
        var guest = BuildSession("session1", "Andrii", groupReservation.GroupReservationId, isSubmitted: true);
        _mockGuestSessionRepository
            .Setup(r => r.GetAllByGroupReservationIdAsync(groupReservation.GroupReservationId))
            .ReturnsAsync([guest, owner]);

        var result = await _guestSessionService.GetOwnerGuestSessionIdAsync(ownerId, reservation.Id);

        Assert.Equal(owner.Id, result.GuestSessionId);
        Assert.Equal(groupReservation.GroupReservationId, result.GroupReservationId);
        _mockGuestSessionRepository.Verify(r => r.SaveAsync(It.IsAny<GuestSession>()), Times.Never);
    }

    [Theory, AutoData]
    public async Task GetOwnerGuestSessionIdAsync_FirstRequest_CreatesOwnerSession(
        GroupReservation groupReservation, Reservation reservation, string ownerId)
    {
        SetupOwnedGroupByReservation(groupReservation, reservation, ownerId);
        _mockGuestSessionRepository
            .Setup(r => r.GetAllByGroupReservationIdAsync(groupReservation.GroupReservationId))
            .ReturnsAsync([]);
        GuestSession? saved = null;
        _mockGuestSessionRepository
            .Setup(r => r.SaveAsync(It.IsAny<GuestSession>()))
            .Callback<GuestSession>(s => saved = s);

        var result = await _guestSessionService.GetOwnerGuestSessionIdAsync(ownerId, reservation.Id);

        Assert.NotNull(saved);
        Assert.Equal(saved.Id, result.GuestSessionId);
        Assert.Equal(groupReservation.GroupReservationId, result.GroupReservationId);
        Assert.True(saved.IsOwnerSession);
        Assert.Equal(ownerId, saved.OwnerUserId);
        Assert.Equal(groupReservation.GroupReservationId, saved.GroupReservationId);
        Assert.Empty(saved.Dishes);
    }

    [Theory, AutoData]
    public async Task GetOwnerGuestSessionIdAsync_CallerIsNotOwner_ThrowsActionForbidden(
        GroupReservation groupReservation, Reservation reservation, string ownerId, string otherUserId)
    {
        SetupOwnedGroupByReservation(groupReservation, reservation, ownerId);

        await Assert.ThrowsAsync<ActionForbiddenException>(
            () => _guestSessionService.GetOwnerGuestSessionIdAsync(otherUserId, reservation.Id));
        _mockGuestSessionRepository.Verify(r => r.SaveAsync(It.IsAny<GuestSession>()), Times.Never);
    }

    [Theory, AutoData]
    public async Task GetOwnerGuestSessionIdAsync_ReservationNotFound_ThrowsReservationNotFound(string reservationId, string userId)
    {
        _mockReservationRepository
            .Setup(r => r.GetReservationByIdAsync(reservationId))
            .ReturnsAsync((Reservation?)null);

        await Assert.ThrowsAsync<ReservationNotFoundException>(
            () => _guestSessionService.GetOwnerGuestSessionIdAsync(userId, reservationId));
    }

    [Theory, AutoData]
    public async Task GetOwnerGuestSessionIdAsync_GroupNotFound_ThrowsGroupReservationNotFound(Reservation reservation, string ownerId)
    {
        reservation.CustomerId = ownerId;
        _mockReservationRepository
            .Setup(r => r.GetReservationByIdAsync(reservation.Id))
            .ReturnsAsync(reservation);
        _mockGroupReservationRepository
            .Setup(r => r.GetByReservationIdAsync(reservation.Id))
            .ReturnsAsync((GroupReservation?)null);

        await Assert.ThrowsAsync<GroupReservationNotFoundException>(
            () => _guestSessionService.GetOwnerGuestSessionIdAsync(ownerId, reservation.Id));
    }

    [Theory, AutoData]
    public async Task SubmitGroupPreOrderAsync_Owner_MergesSubmittedDishesIntoOrderAndSubmitsGroup(
        GroupReservation groupReservation, Reservation reservation, string ownerId)
    {
        SetupOwnedGroup(groupReservation, reservation, ownerId);
        groupReservation.Status = GroupReservationStatus.Open;
        var andrii = BuildSession("session1", "Andrii", groupReservation.GroupReservationId, isSubmitted: true, ("dish1", 2), ("dish2", 1));
        var olena = BuildSession("session2", "Olena", groupReservation.GroupReservationId, isSubmitted: true, ("dish1", 1));
        var notSubmitted = BuildSession("session3", "Taras", groupReservation.GroupReservationId, isSubmitted: false, ("dish3", 4));
        _mockGuestSessionRepository
            .Setup(r => r.GetAllByGroupReservationIdAsync(groupReservation.GroupReservationId))
            .ReturnsAsync([andrii, olena, notSubmitted]);
        SetupDishes(new Dish { Id = "dish1" }, new Dish { Id = "dish2" }, new Dish { Id = "dish3" });
        var order = BuildOrder(reservation.Id, ownerId, ("dish1", 1));
        _mockOrderRepository.Setup(r => r.GetOrderByReservationIdAsync(reservation.Id)).ReturnsAsync(order);

        var result = await _guestSessionService.SubmitGroupPreOrderAsync(ownerId, groupReservation.GroupReservationId, reservation.Id);

        Assert.Equal([new ConsolidatedDishResponse("dish1", 3), new ConsolidatedDishResponse("dish2", 1)], result);

        Assert.Equal(OrderStatus.SubmittedByCustomer, order.Status);
        Assert.Equal(2, order.Dishes.Count);
        Assert.Equal(4, order.Dishes.Single(d => d.DishId == "dish1").Quantity);
        var added = order.Dishes.Single(d => d.DishId == "dish2");
        Assert.Equal(1, added.Quantity);
        Assert.Equal(OrderItemState.Pending, added.State);
        _mockOrderRepository.Verify(r => r.SaveOrderAsync(order), Times.Once);

        Assert.Equal(GroupReservationStatus.Submitted, groupReservation.Status);
        _mockGroupReservationRepository.Verify(r => r.SaveGroupReservationAsync(groupReservation), Times.Once);
    }

    [Theory, AutoData]
    public async Task SubmitGroupPreOrderAsync_DishDeletedFromMenu_SkipsIt(
        GroupReservation groupReservation, Reservation reservation, string ownerId)
    {
        SetupOwnedGroup(groupReservation, reservation, ownerId);
        groupReservation.Status = GroupReservationStatus.Open;
        var guest = BuildSession("session1", "Andrii", groupReservation.GroupReservationId, isSubmitted: true, ("dish1", 2), ("deleted-dish", 5));
        _mockGuestSessionRepository
            .Setup(r => r.GetAllByGroupReservationIdAsync(groupReservation.GroupReservationId))
            .ReturnsAsync([guest]);
        SetupDishes(new Dish { Id = "dish1" });
        var order = BuildOrder(reservation.Id, ownerId);
        _mockOrderRepository.Setup(r => r.GetOrderByReservationIdAsync(reservation.Id)).ReturnsAsync(order);

        var result = await _guestSessionService.SubmitGroupPreOrderAsync(ownerId, groupReservation.GroupReservationId, reservation.Id);

        Assert.Equal(new ConsolidatedDishResponse("dish1", 2), Assert.Single(result));
        Assert.Equal("dish1", Assert.Single(order.Dishes).DishId);
    }

    [Theory, AutoData]
    public async Task SubmitGroupPreOrderAsync_NoSubmittedSessions_ThrowsValidationAndSavesNothing(
        GroupReservation groupReservation, Reservation reservation, string ownerId)
    {
        SetupOwnedGroup(groupReservation, reservation, ownerId);
        groupReservation.Status = GroupReservationStatus.Open;
        var guest = BuildSession("session1", "Andrii", groupReservation.GroupReservationId, isSubmitted: false, ("dish1", 2));
        _mockGuestSessionRepository
            .Setup(r => r.GetAllByGroupReservationIdAsync(groupReservation.GroupReservationId))
            .ReturnsAsync([guest]);

        await Assert.ThrowsAsync<ValidationException>(
            () => _guestSessionService.SubmitGroupPreOrderAsync(ownerId, groupReservation.GroupReservationId, reservation.Id));
        VerifyNothingSubmitted();
    }

    [Theory, AutoData]
    public async Task SubmitGroupPreOrderAsync_SubmittedSessionsHaveNoDishes_ThrowsValidationAndSavesNothing(
        GroupReservation groupReservation, Reservation reservation, string ownerId)
    {
        SetupOwnedGroup(groupReservation, reservation, ownerId);
        groupReservation.Status = GroupReservationStatus.Open;
        var guest = BuildSession("session1", "Andrii", groupReservation.GroupReservationId, isSubmitted: true);
        _mockGuestSessionRepository
            .Setup(r => r.GetAllByGroupReservationIdAsync(groupReservation.GroupReservationId))
            .ReturnsAsync([guest]);
        SetupDishes();

        await Assert.ThrowsAsync<ValidationException>(
            () => _guestSessionService.SubmitGroupPreOrderAsync(ownerId, groupReservation.GroupReservationId, reservation.Id));
        VerifyNothingSubmitted();
    }

    [Theory, AutoData]
    public async Task SubmitGroupPreOrderAsync_OrderNotFound_ThrowsValidationAndSavesNothing(
        GroupReservation groupReservation, Reservation reservation, string ownerId)
    {
        SetupOwnedGroup(groupReservation, reservation, ownerId);
        groupReservation.Status = GroupReservationStatus.Open;
        var guest = BuildSession("session1", "Andrii", groupReservation.GroupReservationId, isSubmitted: true, ("dish1", 2));
        _mockGuestSessionRepository
            .Setup(r => r.GetAllByGroupReservationIdAsync(groupReservation.GroupReservationId))
            .ReturnsAsync([guest]);
        SetupDishes(new Dish { Id = "dish1" });
        _mockOrderRepository.Setup(r => r.GetOrderByReservationIdAsync(reservation.Id)).ReturnsAsync((Order?)null);

        await Assert.ThrowsAsync<ValidationException>(
            () => _guestSessionService.SubmitGroupPreOrderAsync(ownerId, groupReservation.GroupReservationId, reservation.Id));
        VerifyNothingSubmitted();
    }

    [Theory, AutoData]
    public async Task SubmitGroupPreOrderAsync_CallerIsNotOwner_ThrowsActionForbidden(
        GroupReservation groupReservation, Reservation reservation, string ownerId, string otherUserId)
    {
        SetupOwnedGroup(groupReservation, reservation, ownerId);

        await Assert.ThrowsAsync<ActionForbiddenException>(
            () => _guestSessionService.SubmitGroupPreOrderAsync(otherUserId, groupReservation.GroupReservationId, reservation.Id));
        VerifyNothingSubmitted();
    }

    [Theory, AutoData]
    public async Task SubmitGroupPreOrderAsync_ReservationIdDoesNotMatchGroup_ThrowsValidation(
        GroupReservation groupReservation, Reservation reservation, string ownerId, string otherReservationId)
    {
        SetupOwnedGroup(groupReservation, reservation, ownerId);

        await Assert.ThrowsAsync<ValidationException>(
            () => _guestSessionService.SubmitGroupPreOrderAsync(ownerId, groupReservation.GroupReservationId, otherReservationId));
        VerifyNothingSubmitted();
    }

    [Theory]
    [InlineAutoData(GroupReservationStatus.Submitted, typeof(GroupReservationSubmittedException))]
    [InlineAutoData(GroupReservationStatus.Closed, typeof(GroupReservationExpiredException))]
    public async Task SubmitGroupPreOrderAsync_GroupNotOpen_Throws(
        GroupReservationStatus status, Type exceptionType, GroupReservation groupReservation, Reservation reservation, string ownerId)
    {
        SetupOwnedGroup(groupReservation, reservation, ownerId);
        groupReservation.Status = status;

        await Assert.ThrowsAsync(exceptionType,
            () => _guestSessionService.SubmitGroupPreOrderAsync(ownerId, groupReservation.GroupReservationId, reservation.Id));
        VerifyNothingSubmitted();
    }

    [Theory, AutoData]
    public async Task SubmitGroupPreOrderAsync_GroupNotFound_ThrowsGroupReservationNotFound(string groupReservationId, string reservationId, string userId)
    {
        _mockGroupReservationRepository
            .Setup(r => r.GetGroupReservationByIdAsync(groupReservationId))
            .ReturnsAsync((GroupReservation?)null);

        await Assert.ThrowsAsync<GroupReservationNotFoundException>(
            () => _guestSessionService.SubmitGroupPreOrderAsync(userId, groupReservationId, reservationId));
    }

    private void VerifyNothingSubmitted()
    {
        _mockOrderRepository.Verify(r => r.SaveOrderAsync(It.IsAny<Order>()), Times.Never);
        _mockGroupReservationRepository.Verify(r => r.SaveGroupReservationAsync(It.IsAny<GroupReservation>()), Times.Never);
    }

    private void SetupOwnedGroupByReservation(GroupReservation groupReservation, Reservation reservation, string ownerId)
    {
        SetupOwnedGroup(groupReservation, reservation, ownerId);
        _mockGroupReservationRepository
            .Setup(r => r.GetByReservationIdAsync(reservation.Id))
            .ReturnsAsync(groupReservation);
    }

    private static GuestSession BuildOwnerSession(string groupReservationId, string ownerId)
    {
        var owner = BuildSession("owner-session", "Owner", groupReservationId, isSubmitted: false);
        owner.IsOwnerSession = true;
        owner.OwnerUserId = ownerId;
        return owner;
    }

    private static Order BuildOrder(string reservationId, string customerId, params (string DishId, int Quantity)[] dishes)
    {
        return new Order
        {
            OrderId = "order1",
            CustomerId = customerId,
            ReservationId = reservationId,
            ReservationAddress = "Main street 1, Table 1",
            ReservationTime = "Nov 1, 2026, 9:00 a.m. - 10:30 a.m.",
            Dishes = dishes.Select(d => new OrderItem { DishId = d.DishId, Quantity = d.Quantity, State = OrderItemState.Pending }).ToList(),
            Status = OrderStatus.Created,
        };
    }

    private void SetupOwnedGroup(GroupReservation groupReservation, Reservation reservation, string ownerId)
    {
        groupReservation.ReservationId = reservation.Id;
        reservation.CustomerId = ownerId;

        _mockGroupReservationRepository
            .Setup(r => r.GetGroupReservationByIdAsync(groupReservation.GroupReservationId))
            .ReturnsAsync(groupReservation);
        _mockReservationRepository
            .Setup(r => r.GetReservationByIdAsync(reservation.Id))
            .ReturnsAsync(reservation);
    }

    private void SetupDishes(params Dish[] dishes)
    {
        _mockDishRepository
            .Setup(r => r.GetDishesByIdsAsync(It.IsAny<IEnumerable<string>>()))
            .ReturnsAsync(dishes);
    }

    private static GuestSession BuildSession(string id, string name, string groupReservationId, bool isSubmitted, params (string DishId, int Quantity)[] dishes)
    {
        return new GuestSession
        {
            Id = id,
            GuestName = name,
            GroupReservationId = groupReservationId,
            IsSubmitted = isSubmitted,
            Dishes = dishes.Select(d => new OrderItem { DishId = d.DishId, Quantity = d.Quantity }).ToList(),
        };
    }
}





