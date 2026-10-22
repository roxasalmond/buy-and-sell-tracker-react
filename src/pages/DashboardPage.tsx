import { signOut } from "firebase/auth";
import { auth } from "../lib/firebase";
import { useAuth } from "../auth/useAuth";

/** Placeholder: the real dashboard arrives in phase 3 (read-only app). */
export function DashboardPage() {
  const { user } = useAuth();

  return (
    <main className="placeholder">
      <h1>
        Transaction <span>Tracker</span>
      </h1>
      <p>Signed in as {user?.email}</p>
      <p className="muted">Phase 1 scaffold: login works. The dashboard comes next.</p>
      <button type="button" onClick={() => void signOut(auth)}>
        Sign out
      </button>
    </main>
  );
}
