import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { type UserRead } from '@/client';

interface AuthState {
  user: UserRead | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setUser: (user: UserRead | null) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: true,

      setUser: (user) => set({ 
        user, 
        isAuthenticated: !!user, 
        isLoading: false 
      }),

      setLoading: (loading) => set({ isLoading: loading }),

      logout: () => {
        set({ user: null, isAuthenticated: false, isLoading: false });
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }), 
    }
  )
)