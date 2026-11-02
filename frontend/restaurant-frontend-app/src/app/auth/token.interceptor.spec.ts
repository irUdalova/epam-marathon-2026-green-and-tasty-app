import { HttpClient, HttpContext, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ToastService } from '../services/toast/toast.service';
import { AuthenticationService } from './services/authentication.service';
import { SKIP_ERROR_TOAST } from './skip-error-toast.context';
import { tokenInterceptor } from './token.interceptor';

const URL = 'https://test.api/reservations';

describe('tokenInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let toastService: jasmine.SpyObj<ToastService>;
  let authService: jasmine.SpyObj<AuthenticationService>;

  beforeEach(() => {
    toastService = jasmine.createSpyObj<ToastService>('ToastService', ['error']);
    authService = jasmine.createSpyObj<AuthenticationService>('AuthenticationService', [
      'getTokens',
      'signOut',
    ]);
    authService.getTokens.and.returnValue(null);

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([tokenInterceptor])),
        provideHttpClientTesting(),
        { provide: ToastService, useValue: toastService },
        { provide: AuthenticationService, useValue: authService },
      ],
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('shows the server message in a toast for a 400 response', () => {
    http.post(URL, {}).subscribe({ error: () => undefined });

    httpMock
      .expectOne(URL)
      .flush({ message: 'Overlaps' }, { status: 400, statusText: 'Bad Request' });

    expect(toastService.error).toHaveBeenCalledWith('Overlaps', 'Error');
  });

  it('does not show a toast but still rethrows when SKIP_ERROR_TOAST is set', () => {
    let receivedStatus: number | undefined;
    http
      .post(URL, {}, { context: new HttpContext().set(SKIP_ERROR_TOAST, true) })
      .subscribe({ error: (error) => (receivedStatus = error.status) });

    httpMock
      .expectOne(URL)
      .flush({ message: 'Overlaps' }, { status: 400, statusText: 'Bad Request' });

    expect(toastService.error).not.toHaveBeenCalled();
    expect(receivedStatus).toBe(400);
  });

  it('signs out and asks to sign in again when the API rejects the stored login', () => {
    authService.getTokens.and.returnValue({ idToken: 'id', accessToken: 'access' });
    http.get(URL).subscribe({ error: () => undefined });

    const request = httpMock.expectOne(URL);
    expect(request.request.headers.get('Authorization')).toBe('Bearer id');
    request.flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(authService.signOut).toHaveBeenCalled();
    expect(toastService.error).toHaveBeenCalledWith(
      'Your session has expired. Please sign in again.',
      'Unauthorized',
    );
  });

  it('signs out on 401 even when SKIP_ERROR_TOAST is set', () => {
    authService.getTokens.and.returnValue({ idToken: 'id', accessToken: 'access' });
    http
      .get(URL, { context: new HttpContext().set(SKIP_ERROR_TOAST, true) })
      .subscribe({ error: () => undefined });

    httpMock.expectOne(URL).flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(authService.signOut).toHaveBeenCalled();
    expect(toastService.error).not.toHaveBeenCalled();
  });

  it('does not sign out on 401 when no one is logged in', () => {
    http.get(URL).subscribe({ error: () => undefined });

    httpMock.expectOne(URL).flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(authService.signOut).not.toHaveBeenCalled();
    expect(toastService.error).toHaveBeenCalledWith(
      'Please log in to perform the action!',
      'Unauthorized',
    );
  });

  it('sends the login token to the owner-only /guest/groups/ endpoints', () => {
    authService.getTokens.and.returnValue({ idToken: 'id', accessToken: 'access' });
    const url = 'https://test.api/guest/groups/grp-1/sessions';
    http.get(url).subscribe();

    const request = httpMock.expectOne(url);
    expect(request.request.headers.get('Authorization')).toBe('Bearer id');
    request.flush({ participants: [], total: 0 });
  });

  it('leaves guest-session requests untouched', () => {
    authService.getTokens.and.returnValue({ idToken: 'id', accessToken: 'access' });
    const url = 'https://test.api/guest/sessions/gs-1/dishes';
    http.get(url).subscribe();

    const request = httpMock.expectOne(url);
    expect(request.request.headers.has('Authorization')).toBeFalse();
    request.flush([]);
  });
});
