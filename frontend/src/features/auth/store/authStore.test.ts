// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { getUnconfirmed, trackUnconfirmed } from '@/features/settings/hooks/unconfirmedUserChanges';

import { useAuthStore } from './authStore';

describe('authStore logout', () => {
  it('drops the settings changes that the backend has not confirmed', () => {
    trackUnconfirmed('theme', { body: { theme: 'dark' }, previous: { theme: 'light' } });

    useAuthStore.getState().logout();

    expect(getUnconfirmed('theme')).toBeUndefined();
  });
});
