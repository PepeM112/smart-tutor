import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import { type UserRead } from '@/client';

interface AuthState {
  user: UserRead | null;
  isLoading: boolean;
  setUser: (user: UserRead | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    set => ({
      user: null,
      isLoading: true,

      setUser: user =>
        set({
          user,
          isLoading: false,
        }),

      logout: () => {
        set({ user: null, isLoading: false });
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: state => ({ user: state.user }),
    }
  )
);
