import { useContext } from "react";
import { TransactionsContext } from "./TransactionsContext";
import type { TransactionsState } from "./TransactionsContext";

export function useTransactions(): TransactionsState {
  const value = useContext(TransactionsContext);
  if (value === null) throw new Error("useTransactions must be used inside <TransactionsProvider>");
  return value;
}
