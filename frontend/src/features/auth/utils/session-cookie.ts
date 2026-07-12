const COOKIE_NAME = 'session';
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

export function setSessionCookie(): void {
  const isProduction = process.env.NODE_ENV === 'production';
  document.cookie = `${COOKIE_NAME}=1; path=/; max-age=${MAX_AGE_SECONDS}; SameSite=Lax${isProduction ? '; Secure' : ''}`;
}

export function clearSessionCookie(): void {
  document.cookie = `${COOKIE_NAME}=; path=/; max-age=0`;
}
