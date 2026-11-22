import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import { type UserRead } from '@/client';
import { clearUnconfirmedChanges } from '@/features/settings/hooks/unconfirmedUserChanges';

const STORAGE_KEY = 'auth-storage';

interface AuthState {
  user: UserRead | null;
  setUser: (user: UserRead | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    set => ({
      user: null,

      setUser: user => set({ user }),

      logout: () => {
        // The overlay is module state: without this, the next user would see the last user's unsaved settings.
        clearUnconfirmedChanges();
        set({ user: null });
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: state => ({ user: state.user }),
    }
  )
);

// Cross-tab sync: when another tab updates auth-storage, rehydrate this tab's store
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return;

    if (!e.newValue) {
      useAuthStore.getState().logout();
      return;
    }

    try {
      // The value is zustand persist output that this store wrote; a guard would only copy the generated UserRead type
      const parsed = JSON.parse(e.newValue) as { state?: { user?: UserRead | null } };
      const user = parsed.state?.user ?? null;
      useAuthStore.getState().setUser(user);
    } catch {
      // Malformed storage value — ignore
    }
  });
}
