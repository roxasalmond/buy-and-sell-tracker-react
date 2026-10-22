import { useMemo, useState } from "react";
import type { TransactionRecord } from "../domain/schemas";
import { paginate } from "../domain/paginate";
import { fundRows, installmentPlans, remitRows, soldUnits, unitsInStock } from "../domain/views";
import { FundsTable, InstallmentsTable, RemitsTable, SoldTable, UnitsTable } from "./HistoryTables";
import { PhotoModal } from "./PhotoModal";
import { Pagination } from "./Pagination";

const TABS = [
  { id: "units", label: "Available Units" },
  { id: "installments", label: "Installments" },
  { id: "funds", label: "Funds" },
  { id: "remits", label: "Remits" },
  { id: "sold", label: "Sold Units" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function HistoryTabs({ records }: { records: TransactionRecord[] }) {
  const [tab, setTab] = useState<TabId>("units");
  const [pageNumber, setPageNumber] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [photo, setPhoto] = useState<{ url: string; name: string } | null>(null);

  const units = useMemo(() => unitsInStock(records), [records]);
  const plans = useMemo(() => installmentPlans(records), [records]);
  const funds = useMemo(() => fundRows(records), [records]);
  const remits = useMemo(() => remitRows(records), [records]);
  const sold = useMemo(() => soldUnits(records), [records]);

  const page = paginate(
    { units, installments: plans, funds, remits, sold }[tab] as readonly unknown[],
    pageNumber,
    pageSize,
  );
  const slice = <T,>(rows: T[]) => paginate(rows, pageNumber, pageSize).rows;
  const unitRows = slice(units);
  const planRows = slice(plans);
  const fundPageRows = slice(funds);
  const remitPageRows = slice(remits);
  const soldRows = slice(sold);

  const selectTab = (id: TabId) => {
    setTab(id);
    setPageNumber(1);
  };

  return (
    <main className="main-content">
      <section className="transaction-history">
        <h2>Transaction History</h2>
        <div className="history-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={t.id === tab}
              className={t.id === tab ? "history-tab-btn active" : "history-tab-btn"}
              onClick={() => selectTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "units" && <UnitsTable rows={unitRows} onPhoto={(url, name) => setPhoto({ url, name })} />}
        {tab === "installments" && <InstallmentsTable rows={planRows} />}
        {tab === "funds" && <FundsTable rows={fundPageRows} />}
        {tab === "remits" && <RemitsTable rows={remitPageRows} />}
        {tab === "sold" && <SoldTable rows={soldRows} />}
        <Pagination
          page={page}
          pageSize={pageSize}
          onPage={setPageNumber}
          onPageSize={(n) => {
            setPageSize(n);
            setPageNumber(1);
          }}
        />
      </section>
      {photo && <PhotoModal url={photo.url} name={photo.name} onClose={() => setPhoto(null)} />}
    </main>
  );
}
