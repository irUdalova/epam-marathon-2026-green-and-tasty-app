import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { Order } from '@app/models/orders/order.model';
import { Reservation, ReservationStatus } from '@app/models/reservations/reservation.model';
import { PreOrdersService } from '@app/services/pre-orders/pre-orders.service';
import { ReservationService } from '@app/services/reservation/reservation.service';
import { CartSummaryService } from './cart-summary.service';

const DAY = 24 * 60 * 60_000;

function order(orderId: string, reservationId: string, status: number, quantities: number[]): Order {
  return {
    orderId,
    reservationId,
    reservationAddress: '9 Abashidze Street',
    reservationTime: '',
    status,
    orderItems: quantities.map((quantity, index) => ({
      dish: { id: `dish-${index}` },
      quantity,
      state: 0,
    })),
  } as unknown as Order;
}

function reservation(id: string, startsInMs: number, guestCount = 1): Reservation {
  return {
    id,
    guestCount,
    status: ReservationStatus.Reserved,
    startTime: new Date(Date.now() + startsInMs),
    endTime: new Date(Date.now() + startsInMs + 90 * 60_000),
  } as Reservation;
}

describe('CartSummaryService', () => {
  let service: CartSummaryService;
  let preOrders: jasmine.SpyObj<PreOrdersService>;
  let reservations: jasmine.SpyObj<ReservationService>;

  beforeEach(() => {
    preOrders = jasmine.createSpyObj<PreOrdersService>('PreOrdersService', ['getPreOrders']);
    reservations = jasmine.createSpyObj<ReservationService>('ReservationService', ['getReservationsForUser$']);
    TestBed.configureTestingModule({
      providers: [
        { provide: PreOrdersService, useValue: preOrders },
        { provide: ReservationService, useValue: reservations },
      ],
    });
    service = TestBed.inject(CartSummaryService);
  });

  it('counts dishes (by quantity) in not-submitted orders of open bookings only', () => {
    preOrders.getPreOrders.and.returnValue(
      of([
        order('open', 'res-open', 0, [2, 1]),
        order('submitted', 'res-submitted', 1, [4]),
        order('past', 'res-past', 0, [5]),
      ]),
    );
    reservations.getReservationsForUser$.and.returnValue(
      of([reservation('res-open', DAY), reservation('res-submitted', DAY), reservation('res-past', -DAY)]),
    );

    service.refresh();

    expect(service.unsubmittedItemCount()).toBe(3);
  });

  it('lists the group bookings, whose orders go through the Group Pre-Order window', () => {
    preOrders.getPreOrders.and.returnValue(of([]));
    reservations.getReservationsForUser$.and.returnValue(
      of([reservation('res-solo', DAY, 1), reservation('res-group', DAY, 3)]),
    );

    let groupIds: string[] = [];
    service.load$().subscribe(({ groupReservationIds }) => (groupIds = [...groupReservationIds]));

    expect(groupIds).toEqual(['res-group']);
  });

  it('keeps the last count when a refresh fails', () => {
    preOrders.getPreOrders.and.returnValue(of([order('open', 'res-open', 0, [2])]));
    reservations.getReservationsForUser$.and.returnValue(of([reservation('res-open', DAY)]));
    service.refresh();

    preOrders.getPreOrders.and.returnValue(throwError(() => new Error('offline')));
    service.refresh();

    expect(service.unsubmittedItemCount()).toBe(2);
  });

  it('clear() resets the count, for sign-out', () => {
    preOrders.getPreOrders.and.returnValue(of([order('open', 'res-open', 0, [2])]));
    reservations.getReservationsForUser$.and.returnValue(of([reservation('res-open', DAY)]));
    service.refresh();

    service.clear();

    expect(service.unsubmittedItemCount()).toBe(0);
  });
});
