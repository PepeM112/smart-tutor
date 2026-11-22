import type { AiEffortSettings, UserRead } from '@/client';

/** The settings that save with a delay. Free text and API keys save at once and are not here. */
export type DelayedUserUpdate = Partial<
  Pick<UserRead, 'theme' | 'timeFormat' | 'timezone' | 'locale' | 'aiProvider' | 'anthropicModel'>
> & { aiEffort?: Partial<AiEffortSettings> };

interface UnconfirmedChange {
  /** The value the user chose last. The page shows it until the backend confirms it. */
  body: DelayedUserUpdate;
  /** The last value the backend confirmed. A failed save goes back to it. */
  previous: DelayedUserUpdate;
  /** Side effects of the change besides the user store (the theme on the page, the locale cookie). */
  show?: (body: DelayedUserUpdate) => void;
}

// Module scope on purpose: a response to one control must not re-apply an old value of another control.
const unconfirmed = new Map<string, UnconfirmedChange>();
// What a request was for. The mutation handlers only receive the body, typed as the wider `UserUpdate`.
interface SentRequest {
  field: string;
  body: DelayedUserUpdate;
}
const sentRequests = new WeakMap<object, SentRequest>();

const SCALAR_FIELDS = ['theme', 'timeFormat', 'timezone', 'locale', 'aiProvider', 'anthropicModel'] as const;

export function getUnconfirmed(field: string): UnconfirmedChange | undefined {
  return unconfirmed.get(field);
}

export function trackUnconfirmed(field: string, change: UnconfirmedChange): void {
  unconfirmed.set(field, change);
}

export function untrackUnconfirmed(field: string): void {
  unconfirmed.delete(field);
}

export function markSent(body: DelayedUserUpdate, field: string): void {
  sentRequests.set(body, { field, body });
}

export function getSentRequest(body: object): SentRequest | undefined {
  return sentRequests.get(body);
}

export function clearUnconfirmedChanges(): void {
  unconfirmed.clear();
}

export function mergeUserUpdate(user: UserRead, body: DelayedUserUpdate): UserRead {
  const { aiEffort, ...scalars } = body;
  return { ...user, ...scalars, ...(aiEffort && { aiEffort: { ...user.aiEffort, ...aiEffort } }) };
}

/** Puts every change the backend has not confirmed yet on top of a user that came from the backend. */
export function overlayUnconfirmed(user: UserRead): UserRead {
  return [...unconfirmed.values()].reduce((merged, { body }) => mergeUserUpdate(merged, body), user);
}

/** The values the user has now for the fields of `body`. */
export function previousValuesOf(user: UserRead, body: DelayedUserUpdate): DelayedUserUpdate {
  const scalars = pickFields(
    user,
    SCALAR_FIELDS.filter(field => field in body)
  );
  if (!body.aiEffort) return scalars;
  const { aiEffort } = body;
  return {
    ...scalars,
    aiEffort: pickFields(
      user.aiEffort,
      Object.keys(aiEffort).filter((action): action is keyof AiEffortSettings => action in user.aiEffort)
    ),
  };
}

function pickFields<T extends object, K extends keyof T>(source: T, fields: readonly K[]): Pick<T, K> {
  // SAFETY: the entries are built from `fields`, so the result has exactly the keys of Pick<T, K>
  return Object.fromEntries(fields.map(field => [field, source[field]])) as Pick<T, K>;
}
