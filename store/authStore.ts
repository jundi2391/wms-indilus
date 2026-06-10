import { create } from 'zustand';
import { User as FirebaseUser } from 'firebase/auth';

export type AppRole = 'Super Admin' | 'Warehouse Manager' | 'Warehouse Staff' | null;

interface AppUser {
  uid: string;
  email: string;
  name: string;
  role: AppRole;
  status: string;
}

interface AuthState {
  user: FirebaseUser | null;
  appUser: AppUser | null;
  isReady: boolean;
  setUser: (user: FirebaseUser | null) => void;
  setAppUser: (appUser: AppUser | null) => void;
  setReady: (ready: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  appUser: null,
  isReady: false,
  setUser: (user) => set({ user }),
  setAppUser: (appUser) => set({ appUser }),
  setReady: (isReady) => set({ isReady }),
}));
