import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ReservationCustomer, ReservationStatusCustomer } from '@app/models/reservations/reservation.model';
import { GuestInviteService } from '@app/services/reservation/guest-invite.service';
import { ToastService } from '@app/services/toast/toast.service';
import { InviteGuestsModalComponent } from './invite-guests-modal.component';

const RESERVATION: ReservationCustomer = {
  id: 'res-1',
  tableId: 'table-1',
  startTime: new Date(2026, 10, 4, 16, 30),
  endTime: new Date(2026, 10, 4, 18, 0),
  guestCount: 4,
  status: ReservationStatusCustomer.Reserved,
  restaurantName: 'Green & Tasty',
  locationAddress: '9 Abashidze Street',
  waiterId: 'waiter-1',
};

describe('InviteGuestsModalComponent', () => {
  function render() {
    const guestInviteService = jasmine.createSpyObj<GuestInviteService>('GuestInviteService', ['getInviteToken$']);
    guestInviteService.getInviteToken$.and.returnValue(of({ token: 'tok' }));
    TestBed.configureTestingModule({
      imports: [InviteGuestsModalComponent],
      providers: [
        { provide: GuestInviteService, useValue: guestInviteService },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['success', 'error']) },
      ],
    });
    const fixture = TestBed.createComponent(InviteGuestsModalComponent);
    fixture.componentRef.setInput('reservation', RESERVATION);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement, guestInviteService };
  }

  it('shows the invite link for the reservation', () => {
    const { element, guestInviteService } = render();

    expect(guestInviteService.getInviteToken$).toHaveBeenCalledWith('res-1');
    expect(element.querySelector<HTMLInputElement>('#invite-link-input')?.value).toBe(
      `${window.location.origin}/join/tok`,
    );
    expect(element.textContent).toContain('9 Abashidze Street');
  });

  it('Done closes the window', () => {
    const { fixture, element } = render();
    let closed = 0;
    fixture.componentInstance.closed.subscribe(() => closed++);

    [...element.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Done')!.click();

    expect(closed).toBe(1);
  });
});
