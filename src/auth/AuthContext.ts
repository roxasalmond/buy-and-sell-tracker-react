import { createContext } from "react";
import type { User } from "firebase/auth";

export interface AuthState {
  user: User | null;
  /** True until Firebase has told us whether someone is signed in. */
  loading: boolean;
}

export const AuthContext = createContext<AuthState>({ user: null, loading: true });
