import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { AuthenticationService } from './authentication.service';
import { API_BASE_URL } from '@app/shared/config/api-base-url.token';

// Unsigned JWT: the frontend only decodes it to read exp.
function makeToken(expiresInSeconds: number): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: 'user-1', exp })}.sig`;
}

function storeLogin(expiresInSeconds: number, withUser = true): void {
  const token = makeToken(expiresInSeconds);
  localStorage.setItem('auth', JSON.stringify({ idToken: token, accessToken: token }));
  if (withUser) {
    localStorage.setItem('user', JSON.stringify({ firstName: 'Iryna', email: 'test@example.com' }));
  }
}

describe('AuthenticationService', () => {
  function createService(): AuthenticationService {
    TestBed.configureTestingModule({
      providers: [{ provide: API_BASE_URL, useValue: 'https://test.api' }],
    });
    return TestBed.inject(AuthenticationService);
  }

  beforeEach(() => {
    localStorage.removeItem('auth');
    localStorage.removeItem('user');
  });

  afterEach(() => {
    localStorage.removeItem('auth');
    localStorage.removeItem('user');
  });

  it('should be created', () => {
    expect(createService()).toBeTruthy();
  });

  it('keeps a valid stored login', async () => {
    storeLogin(3600);

    const service = createService();

    expect(await firstValueFrom(service.isAuthorised$)).toBeTrue();
    expect(await firstValueFrom(service.user$)).not.toBeNull();
  });

  it('signs out at startup when the stored token has expired', async () => {
    storeLogin(-60);

    const service = createService();

    expect(await firstValueFrom(service.isAuthorised$)).toBeFalse();
    expect(await firstValueFrom(service.user$)).toBeNull();
    expect(localStorage.getItem('auth')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
  });

  it('signs out at startup when the user profile is missing', async () => {
    storeLogin(3600, false);

    const service = createService();

    expect(await firstValueFrom(service.isAuthorised$)).toBeFalse();
    expect(localStorage.getItem('auth')).toBeNull();
  });

  it('is signed out when nothing is stored', async () => {
    const service = createService();

    expect(await firstValueFrom(service.isAuthorised$)).toBeFalse();
  });
});
