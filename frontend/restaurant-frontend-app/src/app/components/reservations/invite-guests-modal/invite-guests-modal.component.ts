import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { InviteLinkComponent } from '@app/components/reservations/invite-link/invite-link.component';
import { ReservationCustomer } from '@app/models/reservations/reservation.model';
import { ModalComponent } from '@app/shared/custom-components/modal/modal.component';

/** Opened from a reservation card to share the group invite link again. */
@Component({
  selector: 'app-invite-guests-modal',
  imports: [DatePipe, InviteLinkComponent, ModalComponent],
  templateUrl: './invite-guests-modal.component.html',
  styleUrl: './invite-guests-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class InviteGuestsModalComponent {
  readonly reservation = input.required<ReservationCustomer>();
  readonly closed = output<void>();
}
