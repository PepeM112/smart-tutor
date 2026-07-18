import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import { type UserRead } from '@/client';

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
      const parsed = JSON.parse(e.newValue) as { state?: { user?: UserRead | null } };
      const user = parsed.state?.user ?? null;
      useAuthStore.getState().setUser(user);
    } catch {
      // Malformed storage value — ignore
    }
  });
}
