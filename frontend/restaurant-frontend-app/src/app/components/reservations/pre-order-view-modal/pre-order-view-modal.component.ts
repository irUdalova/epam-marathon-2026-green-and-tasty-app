import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { ParticipantCardComponent } from '@app/components/group-orders/participant-card/participant-card.component';
import { Participant } from '@app/models/group-orders/participant.model';
import { ReservationCustomer } from '@app/models/reservations/reservation.model';
import { ModalComponent } from '@app/shared/custom-components/modal/modal.component';

/** A closed one-guest booking's pre-order, read-only, in the same card as the group pre-order. */
@Component({
  selector: 'app-pre-order-view-modal',
  imports: [CurrencyPipe, DatePipe, ModalComponent, ParticipantCardComponent],
  templateUrl: './pre-order-view-modal.component.html',
  styleUrl: './pre-order-view-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class PreOrderViewModalComponent {
  readonly reservation = input.required<ReservationCustomer>();
  readonly closed = output<void>();

  readonly participant = computed<Participant>(() => {
    const order = this.reservation().preOrder;
    const items = (order?.orderItems ?? []).map((item) => ({ dish: item.dish, quantity: item.quantity }));

    return {
      id: order?.orderId ?? '',
      type: 'Owner',
      name: '',
      items,
      total: items.reduce((sum, item) => sum + item.dish.price * item.quantity, 0),
      isSubmitted: true,
    };
  });
}
