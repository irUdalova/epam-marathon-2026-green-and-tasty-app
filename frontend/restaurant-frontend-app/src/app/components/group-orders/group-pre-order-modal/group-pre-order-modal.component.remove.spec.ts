// Бонус · Remove Guest — сторінка. Запуск: npm run test:hw
// Adapted: the screen is a modal over My Bookings, so the booking is an input instead of a route param,
// and the group id comes from the owner endpoint (getGroupReservationId$) instead of the guest invite.
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { GroupOrdersService } from '@app/services/group-orders/group-orders.service';
import { ToastService } from '@app/services/toast/toast.service';
import { GroupSessionsResponse } from '@app/models/group-orders/group-sessions-response.model';
import { ReservationCustomer } from '@app/models/reservations/reservation.model';
import { GroupPreOrderModalComponent } from './group-pre-order-modal.component';

const caesar = { id: 'dish1', name: 'Caesar Salad', price: 180 };
const SESSIONS: GroupSessionsResponse = {
  participants: [
    { id: 'owner', type: 'Owner', name: 'Yevhenii', isSubmitted: true, total: 180, items: [{ dish: caesar, quantity: 1 }] },
    { id: 'andrii', type: 'Guest', name: 'Andrii', isSubmitted: true, total: 360, items: [{ dish: caesar, quantity: 2 }] },
    { id: 'olena', type: 'Guest', name: 'Olena', isSubmitted: false, total: 180, items: [{ dish: caesar, quantity: 1 }] },
  ],
  total: 720,
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

describe('Бонус · Remove Guest', () => {
  let service: jasmine.SpyObj<GroupOrdersService>;

  function create() {
    TestBed.configureTestingModule({
      imports: [GroupPreOrderModalComponent],
      providers: [
        { provide: GroupOrdersService, useValue: service },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['success', 'error', 'info']) },
      ],
    });
    const fixture = TestBed.createComponent(GroupPreOrderModalComponent);
    fixture.componentRef.setInput('reservation', RESERVATION);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  function removeButtons(element: HTMLElement): HTMLButtonElement[] {
    return [...element.querySelectorAll('button')].filter((b) => b.textContent?.trim() === 'Remove Guest') as HTMLButtonElement[];
  }

  beforeEach(() => {
    service = jasmine.createSpyObj<GroupOrdersService>('GroupOrdersService', [
      'getGroupReservationId$', 'getSessions$', 'getOwnerSessionId$', 'getStatus$', 'submit$', 'removeSession$',
    ]);
    service.getGroupReservationId$.and.returnValue(of('grp-1'));
    service.getSessions$.and.returnValue(of(structuredClone(SESSIONS)));
    service.getOwnerSessionId$.and.returnValue(of('owner'));
    service.getStatus$.and.returnValue(of({ currentParticipants: 3, maxCapacity: 5, status: 'Open' as const }));
  });

  it('«Remove Guest» є біля кожного гостя і немає біля Owner', () => {
    expect(removeButtons(create().element).length).toBe(2);
  });

  it('кнопка має aria-label з ім\'ям: «Remove Andrii»', () => {
    expect(removeButtons(create().element)[0].getAttribute('aria-label')).toBe('Remove Andrii');
  });

  it('клік → діалог з ім\'ям гостя → підтвердження видаляє і оновлює список з відповіді', () => {
    service.removeSession$.and.returnValue(of({ participants: SESSIONS.participants.slice(0, 2), total: 540 }));
    const { fixture, element } = create();

    removeButtons(element)[1].click(); // Olena
    fixture.detectChanges();
    const dialog = element.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain('Are you sure you want to remove');
    expect(dialog.textContent).toContain('Olena');

    buttonByText(dialog, 'Remove Guest')?.click();
    fixture.detectChanges();

    expect(service.removeSession$).toHaveBeenCalledOnceWith('grp-1', 'olena');
    expect(element.querySelectorAll('app-participant-card').length).toBe(2);
  });

  it('помилка DELETE: список лишається без змін', () => {
    service.removeSession$.and.returnValue(throwError(() => new HttpErrorResponse({ status: 400 })));
    const { fixture, element } = create();
    removeButtons(element)[1].click();
    fixture.detectChanges();
    buttonByText(element.querySelector('[role="dialog"]')!, 'Remove Guest')?.click();
    fixture.detectChanges();
    expect(element.querySelectorAll('app-participant-card').length).toBe(3);
  });

  it('після Submit кнопок «Remove Guest» немає', () => {
    service.getStatus$.and.returnValue(of({ currentParticipants: 3, maxCapacity: 5, status: 'Submitted' as const }));
    expect(removeButtons(create().element).length).toBe(0);
  });
});
