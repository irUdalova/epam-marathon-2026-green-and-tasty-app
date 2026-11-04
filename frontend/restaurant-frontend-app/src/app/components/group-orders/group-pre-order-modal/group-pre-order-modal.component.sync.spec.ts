// Рівень 3 · синхронізація з бекендом: кожні 15 с, поки група Open.
// Adapted: the screen is a modal over My Bookings, so the booking is an input instead of a route param,
// and the group id comes from the owner endpoint (getGroupReservationId$) instead of the guest invite.
// fakeAsync + tick(15_000) «прокручує» час без очікування. Запуск: npm run test:hw
import { TestBed, discardPeriodicTasks, fakeAsync, tick } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject, of, throwError } from 'rxjs';
import { GroupOrdersService } from '@app/services/group-orders/group-orders.service';
import { CartSummaryService } from '@app/services/cart/cart-summary.service';
import { ToastService } from '@app/services/toast/toast.service';
import { GroupSessionsResponse } from '@app/models/group-orders/group-sessions-response.model';
import { ReservationCustomer } from '@app/models/reservations/reservation.model';
import { GroupPreOrderModalComponent } from './group-pre-order-modal.component';

const SYNC_MS = 15_000;
const caesar = { id: 'dish1', name: 'Caesar Salad', price: 180 };
const tomYum = { id: 'dish2', name: 'Tom Yum', price: 220 };
const SESSIONS: GroupSessionsResponse = {
  participants: [
    { id: 'owner', type: 'Owner', name: 'Yevhenii', isSubmitted: true, total: 180, items: [{ dish: caesar, quantity: 1 }] },
    { id: 'olena', type: 'Guest', name: 'Olena', isSubmitted: false, total: 220, items: [{ dish: tomYum, quantity: 1 }] },
  ],
  total: 400,
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

describe('Рівень 3 · синхронізація', () => {
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
      'getGroupReservationId$', 'getSessions$', 'getOwnerSessionId$', 'getStatus$', 'submit$',
    ]);
    service.getGroupReservationId$.and.returnValue(of('grp-1'));
    service.getSessions$.and.returnValue(of(structuredClone(SESSIONS)));
    service.getOwnerSessionId$.and.returnValue(of('owner'));
    service.getStatus$.and.returnValue(of({ currentParticipants: 2, maxCapacity: 5, status: 'Open' as const }));
  });

  it('кожні 15 с підтягує свіжі кошики — без перезавантаження сторінки', fakeAsync(() => {
    const { fixture, element } = create();
    expect(element.textContent).toContain('Still choosing');

    const updated = structuredClone(SESSIONS);
    updated.participants[1].isSubmitted = true; // Olena підтвердила кошик, поки Owner дивиться
    service.getSessions$.and.returnValue(of(updated));
    tick(SYNC_MS);
    fixture.detectChanges();

    expect(service.getSessions$).toHaveBeenCalledTimes(2);
    expect(element.textContent).not.toContain('Still choosing');
    discardPeriodicTasks();
  }));

  it('фонові запити тихі: { silent: true }', fakeAsync(() => {
    create();
    tick(SYNC_MS);
    expect(service.getSessions$.calls.mostRecent().args).toEqual(['grp-1', jasmine.objectContaining({ silent: true })]);
    discardPeriodicTasks();
  }));

  it('показує «Updated at …» і кнопку «Refresh», яка оновлює одразу', fakeAsync(() => {
    const { fixture, element } = create();
    expect(element.textContent).toContain('Updated at');
    buttonByText(element, 'Refresh')?.click();
    fixture.detectChanges();
    expect(service.getSessions$).toHaveBeenCalledTimes(2);
    discardPeriodicTasks();
  }));

  it('фонова помилка: дані лишаються, «Couldn’t refresh»', fakeAsync(() => {
    const { fixture, element } = create();
    service.getSessions$.and.returnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
    tick(SYNC_MS);
    fixture.detectChanges();

    expect(element.textContent).toMatch(/Couldn.t refresh/);
    expect(element.querySelectorAll('app-participant-card').length).toBe(2);
    discardPeriodicTasks();
  }));

  it('після Submit синхронізація зупиняється', fakeAsync(() => {
    service.submit$.and.returnValue(of([{ dishId: 'dish1', quantity: 1 }]));
    const { fixture, element } = create();
    buttonByText(element, 'Submit Pre-Order')?.click();
    fixture.detectChanges();
    buttonByText(element.querySelector('[role="dialog"]')!, 'Submit')?.click();
    fixture.detectChanges();

    tick(SYNC_MS * 3);
    expect(service.getSessions$).toHaveBeenCalledTimes(1);
    discardPeriodicTasks();
  }));

  it('при виході зі сторінки таймер зупиняється', fakeAsync(() => {
    const { fixture } = create();
    fixture.destroy();
    tick(SYNC_MS * 3);
    expect(service.getSessions$).toHaveBeenCalledTimes(1);
    discardPeriodicTasks();
  }));

  describe('extra cases', () => {
    it('Try again does not start a second timer', fakeAsync(() => {
      const { fixture } = create();
      fixture.componentInstance.load();
      tick(SYNC_MS);
      // two loads + one background read, not two
      expect(service.getSessions$).toHaveBeenCalledTimes(3);
      discardPeriodicTasks();
    }));

    it('a read still on its way makes the next tick wait', fakeAsync(() => {
      const { fixture } = create();
      const slow = new Subject<typeof SESSIONS>();
      service.getSessions$.and.returnValue(slow);
      tick(SYNC_MS * 2);
      expect(service.getSessions$).toHaveBeenCalledTimes(2);

      slow.next(structuredClone(SESSIONS));
      slow.complete();
      fixture.detectChanges();
      service.getSessions$.and.returnValue(of(structuredClone(SESSIONS)));
      tick(SYNC_MS);
      expect(service.getSessions$).toHaveBeenCalledTimes(3);
      discardPeriodicTasks();
    }));

    it('stops when a background read finds the group already sent', fakeAsync(() => {
      const { fixture, element } = create();
      service.getStatus$.and.returnValue(of({ currentParticipants: 2, maxCapacity: 5, status: 'Submitted' as const }));
      tick(SYNC_MS);
      fixture.detectChanges();
      expect(element.textContent).toContain('Sent to Restaurant');

      tick(SYNC_MS * 3);
      expect(service.getSessions$).toHaveBeenCalledTimes(2);
      discardPeriodicTasks();
    }));

    it('a later successful read clears «Couldn’t refresh»', fakeAsync(() => {
      const { fixture, element } = create();
      service.getSessions$.and.returnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
      tick(SYNC_MS);
      fixture.detectChanges();
      expect(element.textContent).toMatch(/Couldn.t refresh/);

      service.getSessions$.and.returnValue(of(structuredClone(SESSIONS)));
      buttonByText(element, 'Refresh')!.click();
      fixture.detectChanges();
      expect(element.textContent).not.toMatch(/Couldn.t refresh/);
      expect(element.textContent).toContain('Updated at');
      discardPeriodicTasks();
    }));
  });
});
