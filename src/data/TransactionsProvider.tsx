import { onValue, ref } from "firebase/database";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { parseTransactions } from "../domain/schemas";
import { db } from "../lib/firebase";
import { TransactionsContext } from "./TransactionsContext";
import type { TransactionsState } from "./TransactionsContext";

/**
 * Live read-only subscription to `transactions`. Mount it only for a signed-in user,
 * because the database rules refuse reads otherwise.
 */
export function TransactionsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TransactionsState>({ status: "loading" });

  useEffect(() => {
    const unsubscribe = onValue(
      ref(db, "transactions"),
      (snapshot) => {
        const { records, errors } = parseTransactions(snapshot.val());
        if (errors.length > 0) console.warn("Skipped records that do not match the schema:", errors);
        setState({ status: "ready", records, skipped: errors.length });
      },
      (error) => setState({ status: "error", message: error.message }),
    );
    return unsubscribe;
  }, []);

  return <TransactionsContext.Provider value={state}>{children}</TransactionsContext.Provider>;
}
