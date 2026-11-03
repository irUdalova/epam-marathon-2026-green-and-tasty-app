// Рівень 2 · сторінка на даних з API. Сервіс підмінено шпигуном — у мережу тест не ходить.
// Adapted: the screen is a modal over My Bookings, so the booking is an input instead of a route param,
// and the group id comes from the owner endpoint (getGroupReservationId$) instead of the guest invite.
// Запуск: npm run test:hw
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject, of, throwError } from 'rxjs';
import { GroupOrdersService } from '@app/services/group-orders/group-orders.service';
import { CartSummaryService } from '@app/services/cart/cart-summary.service';
import { ToastService } from '@app/services/toast/toast.service';
import { GroupSessionsResponse } from '@app/models/group-orders/group-sessions-response.model';
import { ReservationCustomer } from '@app/models/reservations/reservation.model';
import { GroupPreOrderModalComponent } from './group-pre-order-modal.component';

const caesar = { id: 'dish1', name: 'Caesar Salad', price: 180 };
const tomYum = { id: 'dish2', name: 'Tom Yum', price: 220 };

const SESSIONS: GroupSessionsResponse = {
  participants: [
    { id: 'owner', type: 'Owner', name: 'Yevhenii', isSubmitted: true, total: 180, items: [{ dish: caesar, quantity: 1 }] },
    { id: 'andrii', type: 'Guest', name: 'Andrii', isSubmitted: true, total: 360, items: [{ dish: caesar, quantity: 2 }] },
    { id: 'olena', type: 'Guest', name: 'Olena', isSubmitted: false, total: 220, items: [{ dish: tomYum, quantity: 1 }] },
  ],
  total: 760,
};
// Far in the future, so the 30-minute pre-order cutoff does not lock the window.
const RESERVATION = {
  id: 'res-1',
  locationAddress: 'Rustaveli Avenue 48',
  guestCount: 5,
  startTime: '2099-10-21T16:00:00Z',
  endTime: '2099-10-21T17:30:00Z',
} as unknown as ReservationCustomer;

function buttonByText(root: ParentNode, text: string): HTMLButtonElement | undefined {
  return [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as HTMLButtonElement | undefined;
}

describe('Рівень 2 · сторінка Owner Review', () => {
  let service: jasmine.SpyObj<GroupOrdersService>;

  function create() {
    TestBed.configureTestingModule({
      imports: [GroupPreOrderModalComponent],
      providers: [
        { provide: GroupOrdersService, useValue: service },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['success', 'error', 'info']) },
        { provide: CartSummaryService, useValue: jasmine.createSpyObj('CartSummaryService', ['refresh']) },
      ],
    });
    const fixture = TestBed.createComponent(GroupPreOrderModalComponent);
    fixture.componentRef.setInput('reservation', RESERVATION);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  beforeEach(() => {
    service = jasmine.createSpyObj<GroupOrdersService>('GroupOrdersService', [
      'getGroupReservationId$', 'getSessions$', 'getOwnerSessionId$', 'getStatus$', 'submit$', 'updateOwnerOrder$',
    ]);
    service.getGroupReservationId$.and.returnValue(of('grp-1'));
    service.getSessions$.and.returnValue(of(structuredClone(SESSIONS)));
    service.getOwnerSessionId$.and.returnValue(of('owner'));
    service.getStatus$.and.returnValue(of({ currentParticipants: 3, maxCapacity: 5, status: 'Open' as const }));
  });

  describe('дані', () => {
    it('бере reservationId з адреси і вантажить групу за GroupReservationId', () => {
      create();
      expect(service.getGroupReservationId$).toHaveBeenCalledWith('res-1');
      expect(service.getSessions$.calls.mostRecent().args[0]).toBe('grp-1');
    });

    it('показує всіх учасників; власна картка — «My Pre-Order»', () => {
      const { element } = create();
      expect(element.querySelectorAll('app-participant-card').length).toBe(3);
      expect(element.textContent).toContain('My Pre-Order');
      expect(element.textContent).toContain('Guest: Andrii');
    });

    it('бейдж статусу: «Collecting pre-orders»', () => {
      expect(create().element.textContent).toContain('Collecting pre-orders');
    });
  });

  describe('консолідоване замовлення — головна пастка', () => {
    it('Grand Total рахує лише підтверджені кошики: $540, а не $760 з API', () => {
      const text = create().element.textContent ?? '';
      expect(text).toContain('$540.00');
      expect(text).not.toContain('$760.00');
    });

    it('жовта плашка: «1 participant hasn’t submitted…»', () => {
      expect(create().element.textContent).toMatch(/1 participant hasn.t submitted/);
    });
  });

  describe('стани екрана', () => {
    it('порожньо: «Participants haven’t added any dishes yet»', () => {
      const empty = structuredClone(SESSIONS);
      empty.participants.forEach((p) => (p.items = []));
      service.getSessions$.and.returnValue(of(empty));
      expect(create().element.textContent).toMatch(/Participants haven.t added any dishes yet/);
    });

    it('404: «Group reservation not found»', () => {
      service.getGroupReservationId$.and.returnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
      expect(create().element.textContent).toContain('Group reservation not found');
    });

    describe('404 on a booking with an unsent order of the owner', () => {
      const withOwnOrder = {
        ...RESERVATION,
        preOrder: { status: 0, orderItems: [{ dish: { id: 'dish1' }, quantity: 1, state: 0 }] },
      };

      function createNotFound(reservation: object) {
        service.getGroupReservationId$.and.returnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
        const created = create();
        created.fixture.componentRef.setInput('reservation', reservation);
        created.fixture.detectChanges();
        return created;
      }

      it('«Submit my Pre-Order» sends only the owner\'s order and closes the window', () => {
        service.submitOwnerOrder$ = jasmine.createSpy('submitOwnerOrder$').and.returnValue(of({}));
        const { fixture, element } = createNotFound(withOwnOrder);
        let closed = 0;
        fixture.componentInstance.closed.subscribe(() => closed++);

        buttonByText(element, 'Submit my Pre-Order')!.click();

        expect(service.submitOwnerOrder$).toHaveBeenCalledOnceWith('res-1');
        expect(closed).toBe(1);
      });

      it('no button when the owner has no order, or it was already sent', () => {
        expect(buttonByText(createNotFound(RESERVATION).element, 'Submit my Pre-Order')).toBeUndefined();
        TestBed.resetTestingModule();
        const sent = { ...withOwnOrder, preOrder: { ...withOwnOrder.preOrder, status: 1 } };
        expect(buttonByText(createNotFound(sent).element, 'Submit my Pre-Order')).toBeUndefined();
      });
    });

    it('інша помилка: кнопка «Try again» вантажить ще раз', () => {
      service.getGroupReservationId$.and.returnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
      const { fixture, element } = create();
      buttonByText(element, 'Try again')?.click();
      fixture.detectChanges();
      expect(service.getGroupReservationId$).toHaveBeenCalledTimes(2);
    });
  });

  describe('Submit Pre-Order', () => {
    // Changed from the homework test: the owner's dishes are the reservation's own order and always count
    // (backend marks the owner row isSubmitted only after the restaurant order is sent), so Submit is
    // disabled only when the consolidated order is empty.
    it('кнопка неактивна, якщо в замовленні немає страв', () => {
      const nobody = structuredClone(SESSIONS);
      nobody.participants.forEach((p) => (p.isSubmitted = false));
      nobody.participants[0].items = [];
      service.getSessions$.and.returnValue(of(nobody));
      expect(buttonByText(create().element, 'Submit Pre-Order')?.disabled).toBeTrue();
    });

    it('страви Owner рахуються, навіть якщо бекенд ще не позначив його кошик', () => {
      const ownerPending = structuredClone(SESSIONS);
      ownerPending.participants[0].isSubmitted = false;
      service.getSessions$.and.returnValue(of(ownerPending));
      expect(create().element.textContent).toContain('$540.00');
    });

    it('жоден гість не підтвердив: Submit надсилає лише замовлення Owner через /orders/{id}/submit', () => {
      const noGuests = structuredClone(SESSIONS);
      noGuests.participants.forEach((p) => (p.isSubmitted = false));
      service.getSessions$.and.returnValue(of(noGuests));
      service.submitOwnerOrder$ = jasmine.createSpy('submitOwnerOrder$').and.returnValue(of({}));
      const { fixture, element } = create();

      buttonByText(element, 'Submit Pre-Order')?.click();
      fixture.detectChanges();
      buttonByText(element.querySelector('[role="dialog"]')!, 'Submit')?.click();
      fixture.detectChanges();

      expect(service.submitOwnerOrder$).toHaveBeenCalledOnceWith('res-1');
      expect(service.submit$).not.toHaveBeenCalled();
      expect(element.textContent).toContain('Sent to Restaurant');
    });

    it('«Submit Pre-Order» → діалог → «Submit»: запит іде один раз навіть при подвійному кліку', () => {
      const response$ = new Subject<{ dishId: string; quantity: number }[]>();
      service.submit$.and.returnValue(response$);
      const { fixture, element } = create();

      buttonByText(element, 'Submit Pre-Order')?.click();
      fixture.detectChanges();
      const dialog = element.querySelector('[role="dialog"]');
      expect(dialog).withContext('має відкритись <app-modal>').not.toBeNull();

      buttonByText(dialog!, 'Submit')?.click();
      fixture.detectChanges();
      buttonByText(dialog!, 'Submit')?.click();
      buttonByText(dialog!, 'Submitting…')?.click();
      fixture.detectChanges();

      expect(service.submit$).toHaveBeenCalledOnceWith('grp-1', 'res-1');
    });

    it('після успіху: «Sent to Restaurant», кнопки Submit більше немає', () => {
      service.submit$.and.returnValue(of([{ dishId: 'dish1', quantity: 3 }]));
      const { fixture, element } = create();
      buttonByText(element, 'Submit Pre-Order')?.click();
      fixture.detectChanges();
      buttonByText(element.querySelector('[role="dialog"]')!, 'Submit')?.click();
      fixture.detectChanges();

      expect(element.textContent).toContain('Sent to Restaurant');
      expect(buttonByText(element, 'Submit Pre-Order')).toBeUndefined();
    });

    it('помилка submit: екран не ламається, кнопку можна натиснути знову', () => {
      service.submit$.and.returnValue(throwError(() => new HttpErrorResponse({ status: 400 })));
      const { fixture, element } = create();
      buttonByText(element, 'Submit Pre-Order')?.click();
      fixture.detectChanges();
      buttonByText(element.querySelector('[role="dialog"]')!, 'Submit')?.click();
      fixture.detectChanges();

      expect(buttonByText(element, 'Submit Pre-Order')?.disabled).toBeFalse();
    });
  });

  describe('власне замовлення Owner', () => {
    it('«+» зберігає замовлення і перечитує групу тихим запитом', () => {
      service.updateOwnerOrder$.and.returnValue(of({}));
      const { fixture, element } = create();

      element.querySelector<HTMLButtonElement>('[aria-label="Increase"]')!.click();
      fixture.detectChanges();

      expect(service.updateOwnerOrder$).toHaveBeenCalledOnceWith('res-1', [{ dishId: 'dish1', quantity: 2 }]);
      expect(service.getSessions$.calls.mostRecent().args).toEqual(['grp-1', { silent: true }]);
    });

    it('кошик прибирає страву з замовлення', () => {
      service.updateOwnerOrder$.and.returnValue(of({}));
      const { fixture, element } = create();

      element.querySelector<HTMLButtonElement>('[aria-label="Remove Caesar Salad"]')!.click();
      fixture.detectChanges();

      expect(service.updateOwnerOrder$).toHaveBeenCalledOnceWith('res-1', []);
    });

    it('кнопки редагування є лише у власній картці', () => {
      expect(create().element.querySelectorAll('[aria-label="Increase"]').length).toBe(1);
    });

    it('після Submit редагувати не можна: картка Owner лише для перегляду', () => {
      service.getStatus$.and.returnValue(of({ currentParticipants: 3, maxCapacity: 5, status: 'Submitted' as const }));
      const element = create().element;
      expect(element.querySelector('[aria-label="Increase"]')).toBeNull();
      expect(element.querySelector('[aria-label="Remove Caesar Salad"]')).toBeNull();
      expect(element.textContent).not.toContain('Edit my Pre-Order');
    });
  });

  describe('within 30 minutes of the start, or after it', () => {
    function createStarted() {
      const created = create();
      created.fixture.componentRef.setInput('reservation', {
        ...RESERVATION,
        startTime: new Date(Date.now() - 60 * 60_000).toISOString(),
      });
      created.fixture.detectChanges();
      return created;
    }

    it('shows every participant\'s dishes and prices, so the bill can be split', () => {
      const { element } = createStarted();
      const cards = element.querySelectorAll('app-participant-card');
      expect(cards.length).toBe(3);
      expect(cards[1].textContent).toContain('Guest: Andrii');
      expect(cards[1].textContent).toContain('× 2');
      expect(cards[1].textContent).toContain('$360.00');
    });

    it('shows the owner\'s card like a guest\'s: quantity and price, no buttons', () => {
      const { element } = createStarted();
      const ownerCard = element.querySelector('app-participant-card')!;
      expect(ownerCard.textContent).toContain('My Pre-Order');
      expect(ownerCard.textContent).toContain('× 1');
      expect(ownerCard.textContent).toContain('$180.00');
      expect(ownerCard.querySelectorAll('button').length).toBe(0);
      expect(element.textContent).not.toContain('Edit my Pre-Order');
    });

    it('has no Submit and saves nothing', () => {
      const { fixture, element } = createStarted();
      expect(buttonByText(element, 'Submit Pre-Order')).toBeUndefined();

      fixture.componentInstance.changeOwnQuantity(SESSIONS.participants[0], { dishId: 'dish1', quantity: 2 });
      fixture.componentInstance.removeOwnDish(SESSIONS.participants[0], 'dish1');

      expect(service.updateOwnerOrder$).not.toHaveBeenCalled();
    });

    it('says why: the badge reads «Pre-order closed» and the note gives the 30-minute rule', () => {
      const { element } = createStarted();
      expect(element.querySelector('.status-badge')?.textContent?.trim()).toBe('Pre-order closed');
      expect(element.textContent).toContain('Pre-orders close 30 minutes before the booking starts');
    });

    it('a submitted order keeps its «Sent to Restaurant» badge', () => {
      service.getStatus$.and.returnValue(of({ currentParticipants: 3, maxCapacity: 5, status: 'Submitted' as const }));
      const { element } = createStarted();
      expect(element.querySelector('.status-badge')?.textContent?.trim()).toBe('Sent to Restaurant');
    });
  });

  it('хрестик закриває вікно', () => {
    const { fixture, element } = create();
    let closed = 0;
    fixture.componentInstance.closed.subscribe(() => closed++);
    element.querySelector<HTMLButtonElement>('[aria-label="Close"]')!.click();
    expect(closed).toBe(1);
  });
});
