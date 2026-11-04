import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { provideRouter } from '@angular/router';

import { HeaderComponent } from './header.component';
import { API_BASE_URL } from '@app/shared/config/api-base-url.token';
import { AuthenticationService } from '@app/auth/services/authentication.service';
import { NotificationsService } from '@app/services/notifications/notifications.service';
import { CartSummaryService } from '@app/services/cart/cart-summary.service';
import { Roles } from '@app/shared/constants/roles';

describe('HeaderComponent', () => {
  let component: HeaderComponent;
  let fixture: ComponentFixture<HeaderComponent>;

  let authMock: jasmine.SpyObj<AuthenticationService>;
  let notificationsMock: jasmine.SpyObj<NotificationsService>;

  beforeEach(async () => {
    authMock = jasmine.createSpyObj<AuthenticationService>(
      'AuthenticationService',
      ['signOut'],
    {
      user$: of(null),
      isAuthorised$: of(false),
    },
  );
  
  notificationsMock = jasmine.createSpyObj<NotificationsService>(
    'NotificationsService',
    ['loadNotifications', 'markAsRead'],
  );

  notificationsMock.loadNotifications.and.returnValue(of([]));
  notificationsMock.markAsRead.and.returnValue(of(void 0));

  await TestBed.configureTestingModule({
    providers: [
      { provide: API_BASE_URL, useValue: 'https://test.api' },
      { provide: AuthenticationService, useValue: authMock },
      { provide: NotificationsService, useValue: notificationsMock },
      provideRouter([]),
    ],
    imports: [HeaderComponent],
  }).compileComponents();

  fixture = TestBed.createComponent(HeaderComponent);
  component = fixture.componentInstance;
  fixture.detectChanges();
});

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

describe('HeaderComponent cart badge', () => {
  const count = signal(0);
  let cartSummaryMock: { unsubmittedItemCount: typeof count; refresh: jasmine.Spy; clear: jasmine.Spy };

  function render(role: string) {
    cartSummaryMock = {
      unsubmittedItemCount: count,
      refresh: jasmine.createSpy('refresh'),
      clear: jasmine.createSpy('clear'),
    };
    const notificationsMock = jasmine.createSpyObj<NotificationsService>('NotificationsService', ['loadNotifications']);
    notificationsMock.loadNotifications.and.returnValue(of([]));

    TestBed.configureTestingModule({
      providers: [
        { provide: API_BASE_URL, useValue: 'https://test.api' },
        {
          provide: AuthenticationService,
          useValue: { user$: of({ role, firstName: 'Ira' }), isAuthorised$: of(true), signOut: () => undefined },
        },
        { provide: NotificationsService, useValue: notificationsMock },
        { provide: CartSummaryService, useValue: cartSummaryMock },
        provideRouter([]),
      ],
      imports: [HeaderComponent],
    });
    const fixture = TestBed.createComponent(HeaderComponent);
    fixture.detectChanges();
    return fixture;
  }

  function badge(fixture: ComponentFixture<HeaderComponent>): string | undefined {
    return (fixture.nativeElement as HTMLElement).querySelector('.actions .cart-icon .notification-badge')?.textContent?.trim();
  }

  beforeEach(() => count.set(0));

  it('loads the count for a customer', () => {
    render(Roles.CUSTOMER);
    expect(cartSummaryMock.refresh).toHaveBeenCalled();
  });

  it('shows the number of dishes not yet submitted, and no badge at 0', () => {
    const fixture = render(Roles.CUSTOMER);
    expect(badge(fixture)).toBeUndefined();

    count.set(3);
    fixture.detectChanges();
    expect(badge(fixture)).toBe('3');
  });

  it('shows 9+ above 9, and names the full count for screen readers', () => {
    count.set(12);
    const fixture = render(Roles.CUSTOMER);
    expect(badge(fixture)).toBe('9+');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.actions .cart-button')?.getAttribute('aria-label'),
    ).toBe('Cart, 12 dishes not submitted');
  });

  it('clears the count for anyone who is not a customer', () => {
    render(Roles.WAITER);
    expect(cartSummaryMock.clear).toHaveBeenCalled();
    expect(cartSummaryMock.refresh).not.toHaveBeenCalled();
  });
});
