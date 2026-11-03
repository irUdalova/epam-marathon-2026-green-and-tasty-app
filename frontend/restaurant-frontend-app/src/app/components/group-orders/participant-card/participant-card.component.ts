import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Participant } from '@app/models/group-orders/participant.model';

@Component({
  selector: 'app-participant-card',
  imports: [CurrencyPipe],
  templateUrl: './participant-card.component.html',
  styleUrl: './participant-card.component.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class ParticipantCardComponent {
  readonly participant = input.required<Participant>();
  /** The signed-in owner's own card is titled "My Pre-Order". */
  readonly isOwn = input(false);
  /** Shows the trash and −/+ controls; only the owner's own order can be edited. */
  readonly editable = input(false);
  /** Disables the controls while a change is being saved. */
  readonly busy = input(false);
  /** Shows "Remove Guest": the owner can take a guest out of an open group pre-order. */
  readonly canRemove = input(false);

  readonly quantityChange = output<{ dishId: string; quantity: number }>();
  readonly dishRemove = output<string>();
  readonly removeClick = output<Participant>();

  readonly title = computed(() => {
    const person = this.participant();
    if (this.isOwn()) {
      return 'My Pre-Order';
    }
    return person.type === 'Owner' ? `Owner: ${person.name}` : `Guest: ${person.name}`;
  });
}
