import {
  HttpErrorResponse,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { ToastService } from '../services/toast/toast.service';
import { inject } from '@angular/core';
import { AuthenticationService } from './services/authentication.service';
import { SKIP_ERROR_TOAST } from './skip-error-toast.context';
import { getServerErrorMessage } from '../shared/helpers/http-error-helpers';

export const tokenInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
) => {
  const toastr = inject(ToastService);

  // IMPORTANT: do not modify Guest endpoints at all.
  // Guest flow uses a different token (guest session token) and we must not touch the body.
  // Otherwise we break POST /guest/sessions payload.
  // /guest/groups/ endpoints are the exception: only the reservation owner calls them, with the
  // Cognito login, so they take the normal path below.
  if (req.url.includes('/guest/') && !req.url.includes('/guest/groups/')) {
    return next(req).pipe(
      catchError((error: HttpErrorResponse) => {
        console.log(error);

        let errorMessage = 'An unexpected error occurred.';
        if (error.error && typeof error.error === 'string') {
          errorMessage = error.error;
        } else if (error.error?.error) {
          errorMessage = error.error.error;
        } else if (error.error?.message) {
          errorMessage = error.error.message;
        }

        // For guest endpoints, you may still show toast if you want:
        switch (error.status) {
          case 400:
            toastr.error(errorMessage || 'Bad request.', 'Error');
            break;
          case 401:
            toastr.error('Session expired. Please re-open the invite link.', 'Unauthorized');
            break;
          case 403:
            toastr.error(errorMessage || 'You are not allowed!', 'Forbidden');
            break;
          case 404:
            toastr.error(errorMessage || 'Resource not found.', 'Not Found');
            break;
          case 409:
            toastr.error(errorMessage || 'Conflict occurred.', 'Conflict');
            break;
          case 422:
            toastr.error(errorMessage || 'Validation error.', 'Error');
            break;
          case 500:
            toastr.error('Server error. Please try again later.', 'Server Error');
            break;
          default:
            toastr.error(errorMessage, 'Error');
            break;
        }

        return throwError(() => error);
      })
    );
  }

  const authService = inject(AuthenticationService);
  const hadStoredLogin = authService.hasStoredLogin();
  const tokens = authService.getTokens();
  // The saved login has just expired (getTokens() signed out), so this request goes without a token.
  // API Gateway rejects it with a 401 that has no CORS headers, which the browser reports as status 0;
  // without this the user would only see "An unexpected error occurred".
  const loginJustExpired = hadStoredLogin && !tokens;

  const clonedRequest =
    tokens && tokens.idToken
      ? req.clone({
        setHeaders: {
          Authorization: 'Bearer ' + tokens.idToken,
        },
      })
      : req;

  return next(clonedRequest).pipe(
    catchError((error: HttpErrorResponse) => {
      console.log(error);
      const errorMessage = getServerErrorMessage(error) || 'An unexpected error occurred.';

      // The API no longer accepts the stored login: sign out so the header offers Sign In again.
      const loginRejected =
        (error.status === 401 && !!tokens) ||
        (loginJustExpired && (error.status === 0 || error.status === 401));
      if (loginRejected) {
        authService.signOut();
      }

      if (clonedRequest.url.includes('orders') && error.status === 404) {
        return throwError(() => error);
      }

      if (clonedRequest.context.get(SKIP_ERROR_TOAST)) {
        return throwError(() => error);
      }

      // Status 0 hides the gateway's 401 (no CORS headers); after an expired login it means the same.
      const status = loginRejected && error.status === 0 ? 401 : error.status;

      switch (status) {
        case 400:
          toastr.error(errorMessage || 'Bad request.', 'Error');
          break;
        case 401:
          toastr.error(
            loginRejected
              ? 'Your session has expired. Please sign in again.'
              : 'Please log in to perform the action!',
            'Unauthorized',
          );
          break;
        case 403:
          toastr.error(errorMessage || 'You are not allowed!', 'Forbidden');
          break;
        case 404:
          toastr.error(errorMessage || 'Resource not found.', 'Not Found');
          break;
        case 409:
          toastr.error(errorMessage || 'Conflict occurred.', 'Conflict');
          break;
        case 422:
          toastr.error(errorMessage || 'Validation error.', 'Error');
          break;
        case 500:
          toastr.error('Server error. Please try again later.', 'Server Error');
          break;
        default:
          toastr.error(errorMessage, 'Error');
          break;
      }

      return throwError(() => error);
    })
  );
};