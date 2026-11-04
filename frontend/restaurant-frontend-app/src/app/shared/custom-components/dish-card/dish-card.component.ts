import {Component, ChangeDetectionStrategy, input, output, computed} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DishListResponse } from '@app/models/dishes/dish-list-response.model';
import { DishState } from '@app/models/enums/dish-state.model';
import { DishStateLabels } from '@app/shared/mappers/dish-enum.mapper';
import {CustomButtonComponent} from '@app/shared/custom-components/custom-button/custom-button.component';

@Component({
  selector: 'app-dish-card',
  templateUrl: './dish-card.component.html',
  styleUrls: ['./dish-card.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [CommonModule, CustomButtonComponent],
})
export class DishCardComponent {
  readonly dish = input.required<DishListResponse>();
  readonly maxWidth = input('');
  readonly preOrderEnabled = input(false);

  readonly dishClicked = output<void>();
  readonly preOrderClicked = output<void>();

  readonly dishStateLabel = computed(() => {
    const state = this.dish().state;

    return DishStateLabels[state as DishState] ?? state;
  });

  readonly isUnavailable = computed(() => {
    const state = this.dish().state.toLowerCase();

    return (
      state === DishState.OnStop.toLowerCase() ||
      state === DishState.OutOfStock.toLowerCase()
    );
  });

  // In pre-order mode only the Pre-Order button acts, so the card itself is not clickable then.
  readonly isClickable = computed(() => !this.isUnavailable() && !this.preOrderEnabled());

  onCardClicked(): void {
    if (this.isClickable()) {
      this.dishClicked.emit();
    }
  }
}
