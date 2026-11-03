import { TestBed } from '@angular/core/testing';
import { ReservationCustomer, ReservationStatusCustomer } from '@app/models/reservations/reservation.model';
import { PreOrderViewModalComponent } from './pre-order-view-modal.component';

const RESERVATION = {
  id: 'res-1',
  locationAddress: '9 Abashidze Street',
  guestCount: 1,
  status: ReservationStatusCustomer.Reserved,
  startTime: '2026-11-01T10:45:00Z',
  endTime: '2026-11-01T12:15:00Z',
  preOrder: {
    orderId: 'order-1',
    reservationId: 'res-1',
    reservationAddress: '9 Abashidze Street',
    reservationTime: '',
    status: 0,
    orderItems: [
      { dish: { id: 'dish-1', name: 'Truffle Mushroom Risotto', price: 22.5 }, quantity: 2, state: 0 },
      { dish: { id: 'dish-2', name: 'Fresh Avocado Toast', price: 12 }, quantity: 1, state: 0 },
    ],
  },
} as unknown as ReservationCustomer;

describe('PreOrderViewModalComponent', () => {
  function create() {
    TestBed.configureTestingModule({ imports: [PreOrderViewModalComponent] });
    const fixture = TestBed.createComponent(PreOrderViewModalComponent);
    fixture.componentRef.setInput('reservation', RESERVATION);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  it('lists each dish with its quantity and price, and the total', () => {
    const { element } = create();
    expect(element.textContent).toContain('Truffle Mushroom Risotto');
    expect(element.textContent).toContain('× 2');
    expect(element.textContent).toContain('$45.00');
    expect(element.querySelector('.total .amount')?.textContent?.trim()).toBe('$57.00');
  });

  it('is read-only: the card has no edit or delete buttons', () => {
    const { element } = create();
    expect(element.querySelector('app-participant-card button')).toBeNull();
  });

  it('× closes the window', () => {
    const { fixture, element } = create();
    let closed = 0;
    fixture.componentInstance.closed.subscribe(() => closed++);
    element.querySelector<HTMLButtonElement>('[aria-label="Close"]')!.click();
    expect(closed).toBe(1);
  });
});
