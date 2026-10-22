import { createContext } from "react";
import type { TransactionRecord } from "../domain/schemas";

export type TransactionsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      records: TransactionRecord[];
      /** Records that failed their schema. Shown as a count, never thrown. */
      skipped: number;
    };

export const TransactionsContext = createContext<TransactionsState | null>(null);
