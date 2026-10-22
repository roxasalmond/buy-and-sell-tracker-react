import { ActivityFeed } from "../components/ActivityFeed";
import { HistoryTabs } from "../components/HistoryTabs";
import { Sidebar } from "../components/Sidebar";
import { useTransactions } from "../data/useTransactions";
import { computeSummary } from "../domain/summary";

export function DashboardPage() {
  const state = useTransactions();

  if (state.status === "loading") return <p className="status-text">Loading transactions...</p>;
  if (state.status === "error") return <p className="status-text">Could not load data: {state.message}</p>;

  return (
    <div className="main-container">
      <Sidebar summary={computeSummary(state.records)} records={state.records} />
      <HistoryTabs records={state.records} />
      <ActivityFeed records={state.records} />
      {state.skipped > 0 && <p className="status-text">{state.skipped} record(s) skipped (see console).</p>}
    </div>
  );
}
