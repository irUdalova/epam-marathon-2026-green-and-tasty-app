import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { SKIP_ERROR_TOAST } from '@app/auth/skip-error-toast.context';
import { GroupSessionsResponse } from '@app/models/group-orders/group-sessions-response.model';
import { GroupStatusResponse } from '@app/models/group-orders/group-status.model';
import { OwnerSessionResponse } from '@app/models/group-orders/owner-session.model';
import {
  SubmitGroupPreOrderRequest,
  SubmittedDish,
} from '@app/models/group-orders/submit-group-pre-order.model';
import { API_BASE_URL } from '@app/shared/config/api-base-url.token';

export interface GroupRequestOptions {
  /** Background refresh: no error toast, the page shows its own message. */
  silent?: boolean;
}

/** One line of the owner's order, as PUT /orders/{reservationId} expects it. */
export interface OwnerOrderItem {
  dishId: string;
  quantity: number;
}

@Injectable({
  providedIn: 'root',
})
export class GroupOrdersService {
  private readonly baseUrl = inject(API_BASE_URL);
  private readonly http = inject(HttpClient);

  /**
   * The group id comes from the owner's own endpoint. The guest invite (GET /guest/invites/{token}) is a
   * join check: it refuses once every seat is taken or the order has been sent.
   */
  getGroupReservationId$(reservationId: string): Observable<string> {
    return this.getOwnerSession$(reservationId).pipe(map(({ groupReservationId }) => groupReservationId));
  }

  getSessions$(groupId: string, options: GroupRequestOptions = {}): Observable<GroupSessionsResponse> {
    return this.http.get<GroupSessionsResponse>(this.sessionsUrl(groupId), {
      context: this.requestContext(options),
    });
  }

  getOwnerSessionId$(reservationId: string): Observable<string> {
    return this.getOwnerSession$(reservationId).pipe(map(({ guestSessionId }) => guestSessionId));
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

  /** Fallback when no guest has submitted: the group submit would return 400, so only the owner's order goes. */
  submitOwnerOrder$(reservationId: string): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/orders/${encodeURIComponent(reservationId)}/submit`, {});
  }

  /** The owner's dishes are the reservation's order; the basket edits it the same way. */
  updateOwnerOrder$(reservationId: string, orderItems: OwnerOrderItem[]): Observable<unknown> {
    const url = `${this.baseUrl}/orders/${encodeURIComponent(reservationId)}`;
    // Removing the last dish cancels the order, the same way the basket does.
    return orderItems.length ? this.http.put(url, { orderItems }) : this.http.delete(url);
  }

  removeSession$(groupId: string, guestSessionId: string): Observable<GroupSessionsResponse> {
    return this.http.delete<GroupSessionsResponse>(
      `${this.sessionsUrl(groupId)}/${encodeURIComponent(guestSessionId)}`,
    );
  }

  private getOwnerSession$(reservationId: string): Observable<OwnerSessionResponse> {
    return this.http.get<OwnerSessionResponse>(
      `${this.baseUrl}/reservations/${encodeURIComponent(reservationId)}/guest-session-id`,
    );
  }

  private sessionsUrl(groupId: string): string {
    return `${this.baseUrl}/guest/groups/${encodeURIComponent(groupId)}/sessions`;
  }

  private requestContext(options: GroupRequestOptions): HttpContext {
    return new HttpContext().set(SKIP_ERROR_TOAST, options.silent ?? false);
  }
}
