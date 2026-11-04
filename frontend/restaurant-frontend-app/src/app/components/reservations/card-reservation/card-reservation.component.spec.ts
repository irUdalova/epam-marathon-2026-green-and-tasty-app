import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CardReservationComponent } from './card-reservation.component';
import { API_BASE_URL } from '@app/shared/config/api-base-url.token';
import { ReservationCustomer, ReservationStatusCustomer } from '@app/models/reservations/reservation.model';

// Far in the future, so the 30-minute pre-order cutoff does not apply unless a test sets it.
const RESERVATION: ReservationCustomer = {
  id: 'res-1',
  tableId: 'table-1',
  startTime: new Date('2099-10-21T16:00:00Z'),
  endTime: new Date('2099-10-21T17:30:00Z'),
  guestCount: 2,
  status: ReservationStatusCustomer.Reserved,
  restaurantName: 'Green & Tasty',
  locationAddress: 'Rustaveli Avenue 48',
  waiterId: 'waiter-1',
};

describe('CardReservationComponent', () => {
  let component: CardReservationComponent;
  let fixture: ComponentFixture<CardReservationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [{ provide: API_BASE_URL, useValue: 'https://test.api' }, provideRouter([])],
      imports: [CardReservationComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(CardReservationComponent);
    component = fixture.componentInstance;
    // r — обов'язковий input: без нього компонент падає з NG0950
    fixture.componentRef.setInput('r', RESERVATION);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  function buttonTexts(): string[] {
    return [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].map((b) => b.textContent?.trim() ?? '');
  }

  function buttonByText(text: string): HTMLButtonElement {
    return [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === text,
    ) as HTMLButtonElement;
  }

  function show(reservation: ReservationCustomer): void {
    fixture.componentRef.setInput('r', reservation);
    fixture.detectChanges();
  }

  it('customer sees "My Pre-Order" instead of "Pre-order"', () => {
    expect(buttonTexts()).toContain('My Pre-Order');
    expect(buttonTexts()).not.toContain('Pre-order');
  });

  it('a group booking shows Group Pre-Order and Invite Guests', () => {
    expect(buttonTexts()).toEqual(jasmine.arrayContaining(['Group Pre-Order', 'Invite Guests']));
  });

  it('Group Pre-Order emits the reservation id; Invite Guests emits the reservation', () => {
    const groupIds: string[] = [];
    const invited: ReservationCustomer[] = [];
    component.groupPreOrder.subscribe((id) => groupIds.push(id));
    component.inviteGuests.subscribe((reservation) => invited.push(reservation));

    buttonByText('Group Pre-Order').click();
    buttonByText('Invite Guests').click();

    expect(groupIds).toEqual(['res-1']);
    expect(invited).toEqual([RESERVATION]);
  });

  it('a booking for one guest has no group buttons', () => {
    show({ ...RESERVATION, guestCount: 1 });
    expect(buttonTexts()).not.toContain('Group Pre-Order');
    expect(buttonTexts()).not.toContain('Invite Guests');
  });

  it('a booking that is not Reserved has no group buttons', () => {
    show({ ...RESERVATION, status: ReservationStatusCustomer.Finished });
    expect(buttonTexts()).not.toContain('Group Pre-Order');
    expect(buttonTexts()).not.toContain('Invite Guests');
  });

  describe('a group booking whose order has been sent', () => {
    const sent = { ...RESERVATION, guestCount: 3, hasSubmittedPreOrder: true };

    it('has no My Pre-Order or Invite Guests, which the backend would refuse', () => {
      show(sent);
      expect(buttonTexts()).not.toContain('My Pre-Order');
      expect(buttonTexts()).not.toContain('Invite Guests');
    });

    it('keeps Group Pre-Order to view the order', () => {
      show(sent);
      expect(buttonTexts()).toContain('Group Pre-Order');
    });

    it('a sent one-guest order keeps My Pre-Order', () => {
      show({ ...RESERVATION, guestCount: 1, hasSubmittedPreOrder: true });
      expect(buttonTexts()).toContain('My Pre-Order');
    });
  });

  describe('within 30 minutes of the start, or after it', () => {
    const started: ReservationCustomer = {
      ...RESERVATION,
      startTime: new Date(Date.now() - 60 * 60_000),
      endTime: new Date(Date.now() + 30 * 60_000),
    };

    it('hides My Pre-Order and Invite Guests', () => {
      show(started);
      expect(buttonTexts()).not.toContain('My Pre-Order');
      expect(buttonTexts()).not.toContain('Invite Guests');
    });

    it('keeps Group Pre-Order so the owner can see what was ordered', () => {
      show(started);
      expect(buttonTexts()).toContain('Group Pre-Order');
    });

    it('hides Cancel and Edit, which the backend would refuse', () => {
      show(started);
      expect(buttonTexts()).not.toContain('Cancel');
      expect(buttonTexts()).not.toContain('Edit');
    });

    it('greys out Group Pre-Order but keeps it clickable', () => {
      const groupIds: string[] = [];
      component.groupPreOrder.subscribe((id) => groupIds.push(id));
      show(started);

      const button = buttonByText('Group Pre-Order');
      expect(button.classList).toContain('view-only');
      expect(button.disabled).toBeFalse();
      button.click();
      expect(groupIds).toEqual(['res-1']);
    });

    it('says Expired once the booking has ended', () => {
      show({ ...started, endTime: new Date(Date.now() - 10 * 60_000) });
      expect((fixture.nativeElement as HTMLElement).querySelector('.status-badge')?.textContent?.trim()).toBe('Expired');
    });

    it('still says Reserved while the booking is under way', () => {
      fixture.componentRef.setInput('statusEnum', { [ReservationStatusCustomer.Reserved]: { class: 'reserved', label: 'Reserved' } });
      show(started);
      expect((fixture.nativeElement as HTMLElement).querySelector('.status-badge')?.textContent?.trim()).toBe('Reserved');
    });

    it('a one-guest booking with a pre-order shows a grey My Pre-Order that opens the view', () => {
      const viewed: ReservationCustomer[] = [];
      component.viewPreOrder.subscribe((reservation) => viewed.push(reservation));
      const solo = {
        ...started,
        guestCount: 1,
        preOrder: { orderItems: [{ dish: { id: 'dish-1' }, quantity: 1, state: 0 }] },
      } as unknown as ReservationCustomer;
      show(solo);

      const button = buttonByText('My Pre-Order');
      expect(button.classList).toContain('view-only');
      button.click();
      expect(viewed).toEqual([solo]);
    });

    it('a one-guest booking without a pre-order has nothing to view', () => {
      show({ ...started, guestCount: 1 });
      expect(buttonTexts()).not.toContain('My Pre-Order');
    });

    it('a waiter still sees Cancel', () => {
      fixture.componentRef.setInput('role', 'Waiter');
      show(started);
      expect(buttonTexts()).toContain('Cancel');
    });

    it('closes 30 minutes before the start, not only after it', () => {
      show({ ...RESERVATION, startTime: new Date(Date.now() + 20 * 60_000) });
      expect(buttonTexts()).not.toContain('My Pre-Order');
    });

    it('stays open more than 30 minutes before the start', () => {
      show({ ...RESERVATION, startTime: new Date(Date.now() + 45 * 60_000) });
      expect(buttonTexts()).toContain('My Pre-Order');
    });
  });
});
