import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable, switchMap } from 'rxjs';
import { SKIP_ERROR_TOAST } from '@app/auth/skip-error-toast.context';
import { GroupSessionsResponse } from '@app/models/group-orders/group-sessions-response.model';
import { GroupStatusResponse } from '@app/models/group-orders/group-status.model';
import { OwnerSessionResponse } from '@app/models/group-orders/owner-session.model';
import {
  SubmitGroupPreOrderRequest,
  SubmittedDish,
} from '@app/models/group-orders/submit-group-pre-order.model';
import { GuestInvite } from '@app/models/reservations/guest-invite.model';
import { GuestInviteService } from '@app/services/reservation/guest-invite.service';
import { API_BASE_URL } from '@app/shared/config/api-base-url.token';

export interface GroupRequestOptions {
  /** Background refresh: no error toast, the page shows its own message. */
  silent?: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class GroupOrdersService {
  private readonly baseUrl = inject(API_BASE_URL);
  private readonly http = inject(HttpClient);
  private readonly guestInviteService = inject(GuestInviteService);

  /** The invite carries GroupReservationId and the header data (address, time, guest limit). */
  getGroupInvite$(reservationId: string): Observable<GuestInvite> {
    return this.guestInviteService
      .getInviteToken$(reservationId)
      .pipe(switchMap(({ token }) => this.guestInviteService.getInvite$(token)));
  }

  getSessions$(groupId: string, options: GroupRequestOptions = {}): Observable<GroupSessionsResponse> {
    return this.http.get<GroupSessionsResponse>(this.sessionsUrl(groupId), {
      context: this.requestContext(options),
    });
  }

  getOwnerSessionId$(reservationId: string): Observable<string> {
    return this.http
      .get<OwnerSessionResponse>(
        `${this.baseUrl}/reservations/${encodeURIComponent(reservationId)}/guest-session-id`,
      )
      .pipe(map(({ guestSessionId }) => guestSessionId));
  }

  getStatus$(groupId: string, options: GroupRequestOptions = {}): Observable<GroupStatusResponse> {
    return this.http.get<GroupStatusResponse>(
      `${this.baseUrl}/guest/groups/${encodeURIComponent(groupId)}/status`,
      { context: this.requestContext(options) },
    );
  }

  submit$(groupId: string, reservationId: string): Observable<SubmittedDish[]> {
    const body: SubmitGroupPreOrderRequest = { reservationId };
    return this.http.post<SubmittedDish[]>(
      `${this.baseUrl}/group-reservations/${encodeURIComponent(groupId)}/submit`,
      body,
    );
  }

  removeSession$(groupId: string, guestSessionId: string): Observable<GroupSessionsResponse> {
    return this.http.delete<GroupSessionsResponse>(
      `${this.sessionsUrl(groupId)}/${encodeURIComponent(guestSessionId)}`,
    );
  }

  private sessionsUrl(groupId: string): string {
    return `${this.baseUrl}/guest/groups/${encodeURIComponent(groupId)}/sessions`;
  }

  private requestContext(options: GroupRequestOptions): HttpContext {
    return new HttpContext().set(SKIP_ERROR_TOAST, options.silent ?? false);
  }
}
