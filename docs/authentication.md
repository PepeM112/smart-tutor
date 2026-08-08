# Authentication

## How Auth Works

SmartTutor uses JWT (JSON Web Tokens) with HTTP-only cookies for authentication.

### Login Flow

1. User submits email + password to `POST /api/v1/users/login`
2. Backend verifies credentials (bcrypt hash comparison)
3. Backend generates a JWT containing the user ID as `sub` (subject)
4. JWT is set as an HTTP-only cookie in the response
5. All subsequent requests include the cookie automatically (browser handles this)

### Token Details

| Property  | Value                                         |
| --------- | --------------------------------------------- |
| Algorithm | HS256                                         |
| Expiry    | 30-minute access token + 30-day refresh token |
| Payload   | `{ sub: user_id, exp: timestamp }`            |
| Storage   | HTTP-only cookie                              |

**Same-origin via proxy:** In production, the frontend (Vercel) proxies all `/api/*` requests to the backend (Render) using Next.js rewrites (configured in `next.config.ts`). This makes API calls same-origin from the browser's perspective, which avoids cross-origin cookie issues — particularly on iOS Safari standalone mode (PWA), which partitions or blocks third-party cookies. Cookies use `SameSite=Lax` in both environments. The proxy destination is set via the `BACKEND_URL` server-side env var on Vercel.

### Refresh Token Flow

Authentication uses a dual-token strategy:

| Token         | Lifetime   | Purpose                            |
| ------------- | ---------- | ---------------------------------- |
| Access token  | 30 minutes | Authorizes API requests            |
| Refresh token | 30 days    | Obtains new access tokens silently |

Both tokens are stored as HTTP-only cookies. When the access token expires, the frontend's API client interceptor catches the 401 response and calls `POST /api/v1/users/refresh`. If the refresh token is still valid, a new access token is issued transparently — the original request is retried and the user sees no interruption.

#### Endpoints

- `POST /api/v1/users/refresh` — exchanges a valid refresh token for a new access token
- `POST /api/v1/users/logout` — clears both cookies server-side

#### Frontend Auth Guard

The `AuthGuard` component wraps all protected pages. It uses `useQuery(['me'])` with `staleTime: 5 * 60 * 1000` (a stale-while-revalidate pattern) rather than re-fetching on every mount, and sets `refetchOnWindowFocus` so switching back to the tab re-validates the session. If `/me` fails with 401/403 and silent refresh also fails, the guard triggers logout and redirects to login via a `useEffect` (never during render).

The API client interceptor in `api-client.ts` handles token refresh transparently. It deduplicates concurrent refresh attempts (only one `POST /refresh` in flight at a time) and tracks a `refreshFailed` flag — if refresh fails, the original response is returned immediately instead of retrying, preventing infinite loops.

### Protected Routes

Every API endpoint under `/api/v1/` requires authentication, except:

- `POST /api/v1/users/login`
- `POST /api/v1/users/signup`
- `POST /api/v1/users/refresh`
- `POST /api/v1/users/logout`

The `get_current_user` dependency extracts the JWT from the cookie, decodes it, looks up the user, and injects the `User` object into the endpoint function. If the token is missing, expired, or invalid, the request gets a 401.

#### Server-Side Route Protection

`frontend/proxy.ts` (Next.js 16 middleware) redirects unauthenticated users to `/login` before the page loads for `/dashboard` and `/tests` routes. It checks for the `access_token` or `refresh_token` cookie — if neither exists, the user has never logged in or their session expired. This prevents a flash of protected content before the client-side `AuthGuard` kicks in.

### Frontend Auth State

The frontend determines if the user is logged in by calling a `/me` endpoint, not by reading the cookie (it can't — the cookie is HTTP-only and invisible to JavaScript). The API client is configured with `credentials: 'include'` so cookies are sent automatically with every request.

Auth state is also mirrored in a Zustand store so components can read it synchronously. To keep multiple open tabs in sync, the store listens for the browser's `storage` event and updates itself whenever another tab changes auth state (e.g. after a logout).

## Role-Based Access

The `User` model has a `role` field: `ADMIN` or `USER` (the default).

- **Backend:** the `get_current_admin_user` dependency raises a 403 if the current user's role is not `ADMIN`.
- **Frontend:** the `RoleGuard` component checks the user's role and redirects away in a `useEffect` if it doesn't match the required role.

Currently, this is only used to restrict the Sandbox/dev page to admins.

## Why HTTP-only Cookies (Not localStorage)

**Security:** HTTP-only cookies cannot be accessed by JavaScript, which eliminates an entire class of XSS (Cross-Site Scripting) attacks. If an attacker injects malicious JS into the page, they still can't steal the auth token.

**Simplicity:** The browser handles cookie transmission automatically. No need to manually attach `Authorization` headers to every request, no "where do I store this token" decision. Token refresh is handled transparently by the API client interceptor — application code doesn't deal with it.

**Tradeoff:** The cookie approach requires `credentials: 'include'` in fetch calls and proper CORS configuration on the backend (`allow_credentials=True`). This is a one-time setup cost that pays for itself in security.
