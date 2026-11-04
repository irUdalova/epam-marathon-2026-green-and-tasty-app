import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';

import { CreateOrderRequest } from '@app/models/cart/create-order-request.model';
import {
  ReservationCustomer,
  ReservationStatusCustomer,
} from '@app/models/reservations/reservation.model';
import { PlaceOrderWaiterComponent } from '@app/components/place-order-waiter/place-order-waiter.component';
import { Roles } from '@app/shared/constants/roles';
import { CustomSelectComponent } from '@app/shared/custom-components/custom-select/custom-select.component';
import { buildPreOrderQueryParams } from '@app/shared/helpers/pre-order-query-params';
import { isPreOrderClosed } from '@app/shared/helpers/pre-order-window';

interface ReservationStatusView {
  class: string;
  label: string;
}

interface WaiterPreOrderNavigationData {
  reservationId: string;
  createdByName: string;
  createdByRole: string;
  tableName: string;
}

@Component({
  selector: 'app-card-reservation',
  standalone: true,
  imports: [
    DatePipe,
    CustomSelectComponent,
    PlaceOrderWaiterComponent,
  ],
  templateUrl: './card-reservation.component.html',
  styleUrl: './card-reservation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardReservationComponent {
  private readonly router = inject(Router);
  readonly Roles = Roles;
  readonly ReservationStatusCustomer = ReservationStatusCustomer;

  readonly r = input.required<ReservationCustomer>();
  readonly role = input<string>(Roles.CUSTOMER);
  readonly statusEnum =
    input<Record<number, ReservationStatusView>>({});

  readonly availableTableOptions = input<string[]>([]);

  readonly availableTableOptionsMap =
    input<Map<string, string>>(new Map<string, string>());

  readonly selectedTableLabel = input('');

  readonly createdByName = input<string | undefined>();

  readonly createdByRole =
    input<ReservationCustomer['createdByRole']>();
  readonly tableChanged = output<{
    reservationId: string;
    newTableId: string;
  }>();

  readonly cancelReservation = output<string>();

  readonly editReservation =
    output<ReservationCustomer>();

  readonly postponeReservation =
    output<ReservationCustomer>();

  readonly leaveFeedbackReservation =
    output<ReservationCustomer>();

  readonly updateFeedbackReservation =
    output<ReservationCustomer>();

  readonly sendAnonymousFeedback =
    output<ReservationCustomer>();

  readonly statusChanged = output<{
    id: string;
    newStatus: ReservationStatusCustomer;
  }>();

  readonly preOrder = output<CreateOrderRequest>();

  /** Opens the group pre-order review for this reservation. */
  readonly groupPreOrder = output<string>();

  /** Shows the group invite link again. */
  readonly inviteGuests = output<ReservationCustomer>();

  /** Shows a closed one-guest booking's pre-order, read-only. */
  readonly viewPreOrder = output<ReservationCustomer>();
  readonly showWaiterOrderModal = signal(false);

  readonly statusView = computed<ReservationStatusView>(() => {
    const reservation = this.r();

    // The backend keeps a past booking Reserved; the customer sees that it is over.
    if (this.isExpired()) {
      return { class: 'finished', label: 'Expired' };
    }

    return (
      this.statusEnum()[reservation.status] ?? {
        class: '',
        label: 'Unknown',
      }
    );
  });

  readonly displayedTableLabel = computed(() => {
    return this.selectedTableLabel() || 'Table (Unknown)';
  });

  readonly creatorName = computed(() => {
    return (
      this.createdByName() ||
      this.r().createdByName ||
      'Unknown'
    );
  });

  readonly creatorRole = computed(() => {
    return (
      this.createdByRole() ||
      this.r().createdByRole ||
      Roles.CUSTOMER
    );
  });

  readonly preOrderItemCount = computed(() => {
    return this.r().preOrder?.orderItems?.length ?? 0;
  });

  readonly canOpenWaiterPreOrder = computed(() => {
    return (
      this.preOrderItemCount() > 0 ||
      this.creatorRole() === Roles.WAITER
    );
  });

  // Guests can join through the invite link only when the table is for two or more.
  readonly isGroupReservation = computed(() => {
    return this.r().guestCount >= 2;
  });

  // From 30 minutes before the start the backend refuses to cancel, edit or change the pre-order,
  // and a past booking can still say Reserved. The customer then can only look at what was ordered.
  readonly preOrderClosed = computed(() => {
    return isPreOrderClosed(this.r().startTime);
  });

  readonly isClosedForCustomer = computed(() => {
    return (
      this.role() === Roles.CUSTOMER &&
      this.r().status === ReservationStatusCustomer.Reserved &&
      this.preOrderClosed()
    );
  });

  readonly isExpired = computed(() => {
    return (
      this.isClosedForCustomer() &&
      Date.now() >= new Date(this.r().endTime).getTime()
    );
  });

  // A sent group order is final (it also holds the guests' dishes), so My Pre-Order is not offered
  // for it; Group Pre-Order still shows it.
  readonly groupOrderSent = computed(() => {
    return this.isGroupReservation() && !!this.r().hasSubmittedPreOrder;
  });

  // A group booking shows its order in the group pre-order; a one-guest booking gets its own view.
  readonly canViewOwnPreOrder = computed(() => {
    return (
      this.isClosedForCustomer() &&
      !this.isGroupReservation() &&
      this.preOrderItemCount() > 0
    );
  });

  readonly isAnonymous = computed(() => {
    return !this.r().customerId;
  });

  readonly hasFullFeedback = computed(() => {
    const feedback = this.r().feedback;

    return (
      feedback?.cuisineExperience != null &&
      feedback?.service != null
    );
  });

  onPreOrder(): void {
    void this.router.navigate(['/menu'], {
      queryParams: buildPreOrderQueryParams(this.r()),
    });
  }

  onPreOrderWaiter(): void {
    if (this.preOrderItemCount() > 0) {
      this.navigateToWaiterPreOrder();
      return;
    }

    if (this.creatorRole() === Roles.WAITER) {
      this.showWaiterOrderModal.set(true);
    }
  }

  closeWaiterOrderModal(): void {
    this.showWaiterOrderModal.set(false);
  }

  onWaiterOrderCreated(order: CreateOrderRequest): void {
    this.showWaiterOrderModal.set(false);
    this.preOrder.emit(order);
  }

  onTableChange(label: string): void {
    const reservation = this.r();
    const newTableId =
      this.availableTableOptionsMap().get(label);

    if (!newTableId || newTableId === reservation.tableId) {
      return;
    }

    this.tableChanged.emit({
      reservationId: reservation.id,
      newTableId,
    });
  }

  onStatusChange(
    newStatus: ReservationStatusCustomer,
  ): void {
    this.statusChanged.emit({
      id: this.r().id,
      newStatus,
    });
  }

  private navigateToWaiterPreOrder(): void {
    const reservation = this.r();

    const navigationData: WaiterPreOrderNavigationData = {
      reservationId: reservation.id,
      createdByName: this.creatorName(),
      createdByRole: this.creatorRole(),
      tableName: reservation.tableName || 'Unknown table',
    };

    sessionStorage.setItem(
      'waiterPreOrderData',
      JSON.stringify(navigationData),
    );

    void this.router.navigate(['/waiter-pre-order'], {
      state: navigationData,
    });
  }
}
