import { computed, inject, Injectable, signal } from '@angular/core';
import { catchError, forkJoin, map, Observable, of, tap } from 'rxjs';
import { Order } from '@app/models/orders/order.model';
import { Reservation, ReservationStatus } from '@app/models/reservations/reservation.model';
import { PreOrdersService } from '@app/services/pre-orders/pre-orders.service';
import { ReservationService } from '@app/services/reservation/reservation.service';
import { formatBookingTime } from '@app/shared/helpers/pre-order-query-params';
import { isPreOrderClosed } from '@app/shared/helpers/pre-order-window';

export interface CartContents {
  orders: Order[];
  /** Bookings for 2 or more guests: their order goes through the Group Pre-Order window. */
  groupReservationIds: ReadonlySet<string>;
}

/**
 * What the basket shows, and the number of dishes still waiting to be submitted, which the header
 * shows on the basket icon. Anything that changes the customer's pre-orders calls refresh().
 */
@Injectable({
  providedIn: 'root',
})
export class CartSummaryService {
  private readonly preOrdersService = inject(PreOrdersService);
  private readonly reservationService = inject(ReservationService);

  private readonly orders = signal<Order[]>([]);

  readonly unsubmittedItemCount = computed(() =>
    this.orders()
      .filter((order) => order.status === 0)
      .reduce(
        (count, order) => count + order.orderItems.reduce((sum, item) => sum + item.quantity, 0),
        0,
      ),
  );

  load$(): Observable<CartContents> {
    return forkJoin({
      orders: this.preOrdersService.getPreOrders(),
      // Without the bookings the basket still opens, just without the filter.
      reservations: this.reservationService.getReservationsForUser$().pipe(catchError(() => of(null))),
    }).pipe(
      map(({ orders, reservations }) => ({
        orders: reservations ? openOrders(orders, reservations) : orders,
        groupReservationIds: new Set(
          (reservations ?? [])
            .filter((reservation) => reservation.guestCount >= 2)
            .map((reservation) => reservation.id),
        ),
      })),
      tap(({ orders }) => this.orders.set(orders)),
    );
  }

  // Background update for the badge; a failure keeps the last count.
  refresh(): void {
    this.load$().subscribe({ error: () => undefined });
  }

  clear(): void {
    this.orders.set([]);
  }
}

// GET /orders also returns orders of cancelled bookings and of bookings that have started or
// passed (their status can stay Reserved). None of them can change any more, so the basket
// keeps only orders whose booking is Reserved and more than 30 minutes away.
// The order's own reservationTime is UTC text saved when the order was created, so it is
// replaced with the booking's current time in local time, as My Bookings shows it.
function openOrders(orders: Order[], reservations: Reservation[]): Order[] {
  const openReservations = new Map(
    reservations
      .filter(
        (reservation) =>
          reservation.status === ReservationStatus.Reserved && !isPreOrderClosed(reservation.startTime),
      )
      .map((reservation) => [reservation.id, reservation]),
  );

  return orders.flatMap((order) => {
    const reservation = openReservations.get(order.reservationId);

    return reservation
      ? [{ ...order, reservationTime: formatBookingTime(reservation.startTime, reservation.endTime) }]
      : [];
  });
}
