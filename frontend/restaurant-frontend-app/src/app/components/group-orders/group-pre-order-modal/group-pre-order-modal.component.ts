import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { finalize, forkJoin, Observable, Subscription, switchMap } from 'rxjs';
import { ParticipantCardComponent } from '@app/components/group-orders/participant-card/participant-card.component';
import { GroupSessionsResponse } from '@app/models/group-orders/group-sessions-response.model';
import { GroupReservationStatus } from '@app/models/group-orders/group-status.model';
import { Participant, ParticipantItem } from '@app/models/group-orders/participant.model';
import { GuestInvite } from '@app/models/reservations/guest-invite.model';
import { GroupOrdersService, OwnerOrderItem } from '@app/services/group-orders/group-orders.service';
import { ToastService } from '@app/services/toast/toast.service';
import { ModalComponent } from '@app/shared/custom-components/modal/modal.component';
import { consolidatePreOrder } from '@app/shared/helpers/consolidate-pre-order';
import { buildPreOrderQueryParams } from '@app/shared/helpers/pre-order-query-params';

type LoadState = 'loading' | 'ready' | 'not-found' | 'error';

const STATUS_LABELS: Record<GroupReservationStatus, string> = {
  Open: 'Collecting pre-orders',
  Submitted: 'Sent to Restaurant',
  Closed: 'Closed',
};

@Component({
  selector: 'app-group-pre-order-modal',
  imports: [CurrencyPipe, DatePipe, ModalComponent, ParticipantCardComponent],
  templateUrl: './group-pre-order-modal.component.html',
  styleUrl: './group-pre-order-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class GroupPreOrderModalComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly groupOrdersService = inject(GroupOrdersService);
  private readonly toastService = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly reservationId = input.required<string>();
  readonly closed = output<void>();

  private loadSubscription?: Subscription;

  readonly state = signal<LoadState>('loading');
  readonly invite = signal<GuestInvite | null>(null);
  readonly sessions = signal<GroupSessionsResponse | null>(null);
  readonly status = signal<GroupReservationStatus>('Open');

  readonly confirmOpen = signal(false);
  readonly submitting = signal(false);
  readonly savingOwnOrder = signal(false);

  readonly participants = computed(() => this.sessions()?.participants ?? []);

  readonly statusLabel = computed(() => STATUS_LABELS[this.status()]);
  readonly isLocked = computed(() => this.status() !== 'Open');

  readonly hasDishes = computed(() => this.participants().some((person) => person.items.length > 0));

  // The owner's dishes are the reservation's own order, so they always count; guests count once submitted.
  readonly consolidated = computed(() =>
    consolidatePreOrder(
      this.participants().map((person) => (this.isOwner(person) ? { ...person, isSubmitted: true } : person)),
    ),
  );

  readonly pendingGuests = computed(
    () => this.participants().filter((person) => !this.isOwner(person) && !person.isSubmitted).length,
  );

  readonly pendingMessage = computed(() => {
    const count = this.pendingGuests();
    return count === 1
      ? '1 participant hasn’t submitted their cart yet — their dishes won’t be included in the order.'
      : `${count} participants haven’t submitted their cart yet — their dishes won’t be included in the order.`;
  });

  readonly hasSubmittedGuests = computed(() =>
    this.participants().some((person) => !this.isOwner(person) && person.isSubmitted),
  );

  readonly canSubmit = computed(
    () =>
      !this.isLocked() && !this.submitting() && !this.savingOwnOrder() && this.consolidated().items.length > 0,
  );

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loadSubscription?.unsubscribe();
    this.state.set('loading');

    this.loadSubscription = this.groupOrdersService
      .getGroupInvite$(this.reservationId())
      .pipe(
        switchMap((invite) => {
          this.invite.set(invite);
          return forkJoin({
            sessions: this.groupOrdersService.getSessions$(invite.GroupReservationId),
            status: this.groupOrdersService.getStatus$(invite.GroupReservationId),
          });
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ sessions, status }) => {
          this.sessions.set(sessions);
          this.status.set(status.status);
          this.state.set('ready');
        },
        error: (error: HttpErrorResponse) => {
          this.state.set(error.status === 404 ? 'not-found' : 'error');
        },
      });
  }

  isOwner(person: Participant): boolean {
    return person.type === 'Owner';
  }

  close(): void {
    // Escape reaches both dialogs; the confirmation closes first.
    if (this.confirmOpen()) {
      this.closeConfirm();
      return;
    }
    this.closed.emit();
  }

  openConfirm(): void {
    if (this.canSubmit()) {
      this.confirmOpen.set(true);
    }
  }

  closeConfirm(): void {
    if (!this.submitting()) {
      this.confirmOpen.set(false);
    }
  }

  submit(): void {
    const invite = this.invite();
    if (!invite || !this.canSubmit()) {
      return;
    }

    this.submitting.set(true);
    // The group submit returns 400 when no guest has submitted, so then only the owner's order is sent.
    const request$: Observable<unknown> = this.hasSubmittedGuests()
      ? this.groupOrdersService.submit$(invite.GroupReservationId, this.reservationId())
      : this.groupOrdersService.submitOwnerOrder$(this.reservationId());

    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.submitting.set(false);
        this.confirmOpen.set(false);
        this.status.set('Submitted');
        this.toastService.success('Pre-order sent to the restaurant');
      },
      // tokenInterceptor already shows the API error in a toast.
      error: () => {
        this.submitting.set(false);
        this.confirmOpen.set(false);
      },
    });
  }

  changeOwnQuantity(owner: Participant, change: { dishId: string; quantity: number }): void {
    this.saveOwnOrder(
      owner.items.map((item) => (item.dish.id === change.dishId ? { ...item, quantity: change.quantity } : item)),
    );
  }

  removeOwnDish(owner: Participant, dishId: string): void {
    this.saveOwnOrder(owner.items.filter((item) => item.dish.id !== dishId));
  }

  editMyPreOrder(): void {
    const invite = this.invite();
    if (!invite) {
      return;
    }
    this.closed.emit();
    void this.router.navigate(['/menu'], {
      queryParams: buildPreOrderQueryParams({
        id: this.reservationId(),
        locationAddress: invite.LocationAddress,
        startTime: invite.StartTime,
        endTime: invite.EndTime,
      }),
    });
  }

  // Saves the owner's order, then re-reads the group so subtotals and Grand Total come from the server.
  private saveOwnOrder(items: ParticipantItem[]): void {
    const invite = this.invite();
    if (!invite || this.savingOwnOrder()) {
      return;
    }

    const orderItems: OwnerOrderItem[] = items.map((item) => ({ dishId: item.dish.id, quantity: item.quantity }));
    this.savingOwnOrder.set(true);
    this.groupOrdersService
      .updateOwnerOrder$(this.reservationId(), orderItems)
      .pipe(
        // Re-read even after an error (its toast comes from tokenInterceptor), so the screen matches the server.
        finalize(() => this.refreshSessions(invite.GroupReservationId)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({ error: () => undefined });
  }

  private refreshSessions(groupId: string): void {
    this.groupOrdersService
      .getSessions$(groupId, { silent: true })
      .pipe(
        finalize(() => this.savingOwnOrder.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (sessions) => this.sessions.set(sessions),
        error: () => this.toastService.error('Couldn’t refresh the group pre-order. Please reopen it.'),
      });
  }
}
