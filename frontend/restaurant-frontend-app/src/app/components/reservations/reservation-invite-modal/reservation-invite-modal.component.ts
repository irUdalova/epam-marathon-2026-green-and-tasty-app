import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { Router } from '@angular/router';
import { InviteLinkComponent } from '@app/components/reservations/invite-link/invite-link.component';
import { Reservation } from '@app/models/reservations/reservation.model';
import { ModalComponent } from '@app/shared/custom-components/modal/modal.component';
import { buildPreOrderQueryParams } from '@app/shared/helpers/pre-order-query-params';

const MIN_GUESTS_FOR_INVITE = 2;

@Component({
  selector: 'app-reservation-invite-modal',
  imports: [DatePipe, InviteLinkComponent, ModalComponent],
  templateUrl: './reservation-invite-modal.component.html',
  styleUrl: './reservation-invite-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class ReservationInviteModalComponent {
  private readonly router = inject(Router);

  readonly reservation = input.required<Reservation>();

  readonly closed = output<void>();

  readonly showInviteField = computed(() => this.reservation().guestCount >= MIN_GUESTS_FOR_INVITE);

  readonly guestsLabel = computed(() => {
    const count = this.reservation().guestCount;
    return `${count} ${count === 1 ? 'person' : 'people'}`;
  });

  onClose(): void {
    this.closed.emit();
  }

  onViewReservation(): void {
    this.closed.emit();
    this.router.navigate(['/reservations']);
  }

  onMakePreOrder(): void {
    this.closed.emit();
    this.router.navigate(['/menu'], {
      queryParams: buildPreOrderQueryParams(this.reservation()),
    });
  }
}
