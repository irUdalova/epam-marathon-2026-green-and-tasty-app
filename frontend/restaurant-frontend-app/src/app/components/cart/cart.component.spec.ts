import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';

import { Order } from '@app/models/orders/order.model';
import { Reservation, ReservationStatus } from '@app/models/reservations/reservation.model';
import { PreOrdersService } from '@app/services/pre-orders/pre-orders.service';
import { ReservationService } from '@app/services/reservation/reservation.service';
import { formatBookingTime } from '@app/shared/helpers/pre-order-query-params';

import { CartComponent } from './cart.component';

describe('CartComponent', () => {
  let component: CartComponent;
  let fixture: ComponentFixture<CartComponent>;

  let preOrdersServiceMock: jasmine.SpyObj<PreOrdersService>;
  let routerMock: jasmine.SpyObj<Router>;
  let reservationServiceMock: jasmine.SpyObj<ReservationService>;

  beforeEach(async () => {
    preOrdersServiceMock =
      jasmine.createSpyObj<PreOrdersService>(
        'PreOrdersService',
        [
          'getPreOrders',
          'cancelPreOrderByReservationId',
          'unsubmitPreOrderByReservationId',
          'submitPreOrderByReservationId',
          'editPreOrderByReservationId',
        ],
      );

    routerMock = jasmine.createSpyObj<Router>(
      'Router',
      ['navigate'],
    );

    preOrdersServiceMock.getPreOrders.and.returnValue(of([]));

    reservationServiceMock = jasmine.createSpyObj<ReservationService>(
      'ReservationService',
      ['getReservationsForUser$'],
    );
    reservationServiceMock.getReservationsForUser$.and.returnValue(of([]));

    await TestBed.configureTestingModule({
      imports: [CartComponent],
      providers: [
        {
          provide: PreOrdersService,
          useValue: preOrdersServiceMock,
        },
        {
          provide: Router,
          useValue: routerMock,
        },
        {
          provide: ReservationService,
          useValue: reservationServiceMock,
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CartComponent);
    component = fixture.componentInstance;

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should emit closeCartEvent when closeCart is called', () => {
    spyOn(component.closeCartEvent, 'emit');

    component.closeCart();

    expect(
      component.closeCartEvent.emit,
    ).toHaveBeenCalled();
  });

  it('should return submitted orders with statuses 1 and 3', () => {
    component.orders.set([
      {
        orderId: 'order-1',
        status: 1,
      },
      {
        orderId: 'order-2',
        status: 2,
      },
      {
        orderId: 'order-3',
        status: 3,
      },
      {
        orderId: 'order-4',
        status: 0,
      },
    ] as Order[]);

    expect(
      component
        .submittedOrders()
        .map((order) => order.status),
    ).toEqual([1, 3]);
  });

  it('should return unsubmitted orders with status 0', () => {
    component.orders.set([
      {
        orderId: 'order-1',
        status: 0,
      },
      {
        orderId: 'order-2',
        status: 1,
      },
      {
        orderId: 'order-3',
        status: 3,
      },
    ] as Order[]);

    expect(
      component
        .unsubmittedOrders()
        .map((order) => order.status),
    ).toEqual([0]);
  });

  it('opens the menu in pre-order mode for the order when Add dish is clicked', () => {
    spyOn(component.closeCartEvent, 'emit');
    component.orders.set([
      {
        orderId: 'order-1',
        reservationId: 'res-1',
        reservationAddress: '9 Abashidze Street',
        reservationTime: 'Nov 01, 2026, 10:45 AM - 12:15 PM',
        orderItems: [],
        status: 0,
      },
    ]);

    component.addDishToOrder('order-1');

    expect(component.closeCartEvent.emit).toHaveBeenCalled();
    expect(routerMock.navigate).toHaveBeenCalledWith(['/menu'], {
      queryParams: {
        preOrder: 'true',
        reservationId: 'res-1',
        reservationLabel: '9 Abashidze Street, Nov 01, 2026, 10:45 AM - 12:15 PM',
      },
    });
  });

  describe('loading', () => {
    function text(): string {
      return (fixture.nativeElement as HTMLElement).textContent ?? '';
    }

    it('says it is loading, not that the cart is empty, until the orders arrive', () => {
      const orders$ = new Subject<Order[]>();
      preOrdersServiceMock.getPreOrders.and.returnValue(orders$);
      component.ngOnInit();
      fixture.detectChanges();

      expect(text()).toContain('Loading your pre-orders');
      expect(text()).not.toContain('Your cart is empty');

      orders$.next([]);
      orders$.complete();
      fixture.detectChanges();

      expect(text()).not.toContain('Loading your pre-orders');
      expect(text()).toContain('Your cart is empty');
    });

    it('says the cart is empty when loading fails', () => {
      preOrdersServiceMock.getPreOrders.and.returnValue(throwError(() => new Error('offline')));
      component.ngOnInit();
      fixture.detectChanges();

      expect(text()).not.toContain('Loading your pre-orders');
      expect(text()).toContain('Your cart is empty');
    });
  });

  describe('orders of bookings that can no longer change', () => {
    const hour = 60 * 60_000;

    function order(orderId: string, reservationId: string): Order {
      return {
        orderId,
        reservationId,
        reservationAddress: '9 Abashidze Street',
        reservationTime: '',
        orderItems: [],
        status: 0,
      };
    }

    function reservation(
      id: string,
      startsInMs: number,
      status = ReservationStatus.Reserved,
    ): Reservation {
      return {
        id,
        status,
        startTime: new Date(Date.now() + startsInMs),
        endTime: new Date(Date.now() + startsInMs + hour),
      } as Reservation;
    }

    function reload(): void {
      component.ngOnInit();
    }

    it('keeps only orders of Reserved bookings more than 30 minutes away', () => {
      preOrdersServiceMock.getPreOrders.and.returnValue(
        of([
          order('future', 'res-future'),
          order('soon', 'res-soon'),
          order('past', 'res-past'),
          order('cancelled', 'res-cancelled'),
          order('in-progress', 'res-in-progress'),
          order('no-booking', 'res-missing'),
        ]),
      );
      reservationServiceMock.getReservationsForUser$.and.returnValue(
        of([
          reservation('res-future', 24 * hour),
          reservation('res-soon', 20 * 60_000),
          reservation('res-past', -48 * hour),
          reservation('res-cancelled', 24 * hour, ReservationStatus.Cancelled),
          reservation('res-in-progress', 24 * hour, ReservationStatus.InProggress),
        ]),
      );

      reload();

      expect(component.orders().map((item) => item.orderId)).toEqual(['future']);
    });

    it('shows the booking\'s current time in local time instead of the order\'s saved UTC text', () => {
      const booking = reservation('res-future', 24 * hour);
      preOrdersServiceMock.getPreOrders.and.returnValue(
        of([{ ...order('future', 'res-future'), reservationTime: 'Nov 04, 2026, 10:00 AM - 11:30 AM' }]),
      );
      reservationServiceMock.getReservationsForUser$.and.returnValue(of([booking]));

      reload();

      expect(component.orders()[0].reservationTime).toBe(
        formatBookingTime(booking.startTime, booking.endTime),
      );
    });

    it('a group booking\'s order opens the Group Pre-Order window instead of being sent alone', () => {
      spyOn(component.closeCartEvent, 'emit');
      preOrdersServiceMock.getPreOrders.and.returnValue(of([order('group', 'res-group')]));
      reservationServiceMock.getReservationsForUser$.and.returnValue(
        of([{ ...reservation('res-group', 24 * hour), guestCount: 3 }]),
      );
      reload();

      component.submitOrder('group');

      expect(preOrdersServiceMock.submitPreOrderByReservationId).not.toHaveBeenCalled();
      expect(component.closeCartEvent.emit).toHaveBeenCalled();
      expect(routerMock.navigate).toHaveBeenCalledWith(['/reservations'], {
        queryParams: { groupOrder: 'res-group' },
      });
    });

    it('a one-guest booking\'s order is still sent from the basket', () => {
      preOrdersServiceMock.getPreOrders.and.returnValue(of([order('solo', 'res-solo')]));
      preOrdersServiceMock.submitPreOrderByReservationId.and.returnValue(of({}));
      reservationServiceMock.getReservationsForUser$.and.returnValue(
        of([{ ...reservation('res-solo', 24 * hour), guestCount: 1 }]),
      );
      reload();

      component.submitOrder('solo');

      expect(preOrdersServiceMock.submitPreOrderByReservationId).toHaveBeenCalledOnceWith('res-solo');
      expect(routerMock.navigate).not.toHaveBeenCalled();
    });

    it('shows every order when the bookings cannot be loaded', () => {
      preOrdersServiceMock.getPreOrders.and.returnValue(
        of([order('order-1', 'res-1')]),
      );
      reservationServiceMock.getReservationsForUser$.and.returnValue(
        throwError(() => new Error('offline')),
      );

      reload();

      expect(component.orders().map((item) => item.orderId)).toEqual(['order-1']);
    });
  });

  it('should navigate to reservations when goToReservations is called', () => {
    component.goToReservations();

    expect(routerMock.navigate).toHaveBeenCalledWith([
      '/reservations',
    ]);
  });
});
