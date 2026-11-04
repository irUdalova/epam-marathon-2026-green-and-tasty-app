import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { Order } from '@app/models/orders/order.model';
import { ReservationCustomer, ReservationStatusCustomer } from '@app/models/reservations/reservation.model';
import { ReservationDashboardComponent } from './reservation-dashboard.component';
import { API_BASE_URL } from '@app/shared/config/api-base-url.token';

const GROUP_BOOKING = {
  id: 'res-1',
  guestCount: 3,
  status: ReservationStatusCustomer.Reserved,
  hasSubmittedPreOrder: false,
  preOrder: { orderId: 'order-1', status: 0 } as Order,
} as ReservationCustomer;

describe('ReservationDashboardComponent', () => {
  let component: ReservationDashboardComponent;
  let fixture: ComponentFixture<ReservationDashboardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [
        { provide: API_BASE_URL, useValue: 'https://test.api' },
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
      imports: [ReservationDashboardComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ReservationDashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('after a submit in the Group Pre-Order window the booking counts as sent, without a reload', () => {
    component.reservations.set([GROUP_BOOKING, { ...GROUP_BOOKING, id: 'res-2' }]);

    component.markPreOrderSubmitted('res-1');

    const [sent, other] = component.reservations();
    expect(sent.hasSubmittedPreOrder).toBeTrue();
    expect(sent.preOrder?.status).toBe(3);
    expect(other.hasSubmittedPreOrder).toBeFalse();
  });
});
