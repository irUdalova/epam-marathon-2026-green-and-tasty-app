// Рівень 2 · сервіс GroupOrdersService: URL, метод, тіло кожного запиту.
// Запуск: npm run test:hw
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_BASE_URL } from '@app/shared/config/api-base-url.token';
import { GroupOrdersService } from './group-orders.service';

const BASE_URL = 'https://api.test';

describe('Рівень 2 · GroupOrdersService', () => {
  let service: GroupOrdersService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: API_BASE_URL, useValue: BASE_URL }],
    });
    service = TestBed.inject(GroupOrdersService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('getGroupReservationId$: reads groupReservationId from the owner endpoint, not the guest invite', () => {
    let groupId = '';
    service.getGroupReservationId$('res-1').subscribe((value) => (groupId = value));

    const req = http.expectOne(`${BASE_URL}/reservations/res-1/guest-session-id`);
    expect(req.request.method).toBe('GET');
    req.flush({ guestSessionId: 'owner-1', groupReservationId: 'grp-1' });

    expect(groupId).toBe('grp-1');
  });

  it('getSessions$: GET /guest/groups/{id}/sessions', () => {
    service.getSessions$('grp-1').subscribe();
    const req = http.expectOne(`${BASE_URL}/guest/groups/grp-1/sessions`);
    expect(req.request.method).toBe('GET');
    req.flush({ participants: [], total: 0 });
  });

  it('getOwnerSessionId$: повертає рядок guestSessionId', () => {
    let id = '';
    service.getOwnerSessionId$('res-1').subscribe((value) => (id = value));
    const req = http.expectOne(`${BASE_URL}/reservations/res-1/guest-session-id`);
    expect(req.request.method).toBe('GET');
    req.flush({ guestSessionId: 'owner-1' });
    expect(id).toBe('owner-1');
  });

  it('getStatus$: GET /guest/groups/{id}/status', () => {
    service.getStatus$('grp-1').subscribe();
    const req = http.expectOne(`${BASE_URL}/guest/groups/grp-1/status`);
    expect(req.request.method).toBe('GET');
    req.flush({ currentParticipants: 3, maxCapacity: 5, status: 'Open' });
  });

  it('submit$: POST /group-reservations/{id}/submit з тілом { reservationId }', () => {
    service.submit$('grp-1', 'res-1').subscribe();
    const req = http.expectOne(`${BASE_URL}/group-reservations/grp-1/submit`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ reservationId: 'res-1' });
    req.flush([]);
  });

  it('submitOwnerOrder$: POST /orders/{reservationId}/submit', () => {
    service.submitOwnerOrder$('res-1').subscribe();
    const req = http.expectOne(`${BASE_URL}/orders/res-1/submit`);
    expect(req.request.method).toBe('POST');
    req.flush({});
  });

  it('updateOwnerOrder$: PUT /orders/{reservationId} з тілом { orderItems }', () => {
    service.updateOwnerOrder$('res-1', [{ dishId: 'dish1', quantity: 2 }]).subscribe();
    const req = http.expectOne(`${BASE_URL}/orders/res-1`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ orderItems: [{ dishId: 'dish1', quantity: 2 }] });
    req.flush({});
  });

  it('updateOwnerOrder$: без страв — DELETE /orders/{reservationId}', () => {
    service.updateOwnerOrder$('res-1', []).subscribe();
    const req = http.expectOne(`${BASE_URL}/orders/res-1`);
    expect(req.request.method).toBe('DELETE');
    req.flush({});
  });
});
