import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { GuestInviteService } from '@app/services/reservation/guest-invite.service';
import { ToastService } from '@app/services/toast/toast.service';

/** The group invite link for a reservation, with a copy button. */
@Component({
  selector: 'app-invite-link',
  templateUrl: './invite-link.component.html',
  styleUrl: './invite-link.component.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class InviteLinkComponent implements OnInit {
  private readonly toastService = inject(ToastService);
  private readonly guestInviteService = inject(GuestInviteService);
  private readonly destroyRef = inject(DestroyRef);

  readonly reservationId = input.required<string>();

  private readonly inviteToken = signal<string | null>(null);
  private readonly tokenLoading = signal(false);
  private readonly tokenFailed = signal(false);

  readonly inviteLink = computed(() => {
    const token = this.inviteToken();
    return token ? `${window.location.origin}/join/${token}` : null;
  });

  readonly invitePlaceholder = computed(() => {
    if (this.tokenFailed()) {
      return 'Link is unavailable';
    }
    return this.tokenLoading() ? 'Generating link...' : 'Link will be available soon';
  });

  ngOnInit(): void {
    this.tokenLoading.set(true);
    this.guestInviteService
      .getInviteToken$(this.reservationId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ token }) => {
          this.inviteToken.set(token);
          this.tokenLoading.set(false);
        },
        error: () => {
          this.tokenLoading.set(false);
          this.tokenFailed.set(true);
          this.toastService.error('Could not load the invite link. Please try again later.');
        },
      });
  }

  async onCopyLink(): Promise<void> {
    const link = this.inviteLink();
    if (!link) {
      return;
    }

    try {
      await navigator.clipboard.writeText(link);
      this.toastService.success('Share it with your friends.', 'Link copied!');
    } catch {
      this.toastService.error('Could not copy the link. Please copy it manually.');
    }
  }
}
