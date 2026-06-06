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

| Property  | Value                              |
| --------- | ---------------------------------- |
| Algorithm | HS256                              |
| Expiry    | 24 hours                           |
| Payload   | `{ sub: user_id, exp: timestamp }` |
| Storage   | HTTP-only cookie                   |

### Protected Routes

Every API endpoint under `/api/v1/` requires authentication, except:

- `POST /api/v1/users/login`
- `POST /api/v1/users/signup`

The `get_current_user` dependency extracts the JWT from the cookie, decodes it, looks up the user, and injects the `User` object into the endpoint function. If the token is missing, expired, or invalid, the request gets a 401.

### Frontend Auth State

The frontend determines if the user is logged in by calling a `/me` endpoint, not by reading the cookie (it can't — the cookie is HTTP-only and invisible to JavaScript). The API client is configured with `credentials: 'include'` so cookies are sent automatically with every request.

## Why HTTP-only Cookies (Not localStorage)

**Security:** HTTP-only cookies cannot be accessed by JavaScript, which eliminates an entire class of XSS (Cross-Site Scripting) attacks. If an attacker injects malicious JS into the page, they still can't steal the auth token.

**Simplicity:** The browser handles cookie transmission automatically. No need to manually attach `Authorization` headers to every request, no token refresh logic in the frontend, no "where do I store this token" decision.

**Tradeoff:** The cookie approach requires `credentials: 'include'` in fetch calls and proper CORS configuration on the backend (`allow_credentials=True`). This is a one-time setup cost that pays for itself in security.
