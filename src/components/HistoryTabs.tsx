import { useMemo, useState } from "react";
import type { TransactionRecord } from "../domain/schemas";
import { paginate } from "../domain/paginate";
import {
  filterPlans,
  filterUnits,
  fundRows,
  installmentPlans,
  NO_DATE_RANGE,
  remitRows,
  soldUnits,
  unitsInStock,
} from "../domain/views";
import type { DateRange, PlanStatusFilter, UnitStatusFilter } from "../domain/views";
import { writesEnabled } from "../data/writes";
import { EditCashModal } from "../features/entries/EditCashModal";
import { useCashRowActions } from "../features/entries/useCashRowActions";
import type { Notice } from "../features/notice";
import { PaymentHistoryModal } from "../features/installments/PaymentHistoryModal";
import { PaymentModal } from "../features/installments/PaymentModal";
import { useInstallmentActions } from "../features/installments/useInstallmentActions";
import { EditUnitModal } from "../features/units/EditUnitModal";
import { useUnitActions } from "../features/units/useUnitActions";
import { useSaleUndo } from "../features/sales/useSaleUndo";
import { useSellUnit } from "../features/sales/useSellUnit";
import { Filters } from "./Filters";
import { FundsTable, InstallmentsTable, RemitsTable, SoldTable, UnitsTable } from "./HistoryTables";
import { Pagination } from "./Pagination";
import { PhotoModal } from "./PhotoModal";

const TABS = [
  { id: "units", label: "Available Units" },
  { id: "installments", label: "Installments" },
  { id: "funds", label: "Funds" },
  { id: "remits", label: "Remits" },
  { id: "sold", label: "Sold Units" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const UNIT_STATUS = [
  { value: "all", label: "All" },
  { value: "in-stock", label: "In stock" },
  { value: "deleted", label: "Deleted" },
] as const satisfies readonly { value: UnitStatusFilter; label: string }[];

const PLAN_STATUS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "deleted", label: "Deleted" },
] as const satisfies readonly { value: PlanStatusFilter; label: string }[];

export function HistoryTabs({ records }: { records: TransactionRecord[] }) {
  const [tab, setTab] = useState<TabId>("units");
  const [pageNumber, setPageNumber] = useState(1);
  const [pageSize, setPageSize] = useState(9);
  const [notice, setNotice] = useState<Notice | null>(null);
  const cash = useCashRowActions(setNotice);
  const cashActions = writesEnabled ? cash.actions : undefined;
  const sell = useSellUnit(setNotice);
  const sellActions = writesEnabled ? sell : undefined;
  const saleUndo = useSaleUndo(records, setNotice);
  const saleUndoActions = writesEnabled ? saleUndo : undefined;
  const unitChanges = useUnitActions(records, setNotice);
  const unitActions = writesEnabled ? unitChanges.actions : undefined;
  const installments = useInstallmentActions(records, setNotice);
  const installmentActions = writesEnabled
    ? installments.actions
    : { busy: false, onHistory: installments.actions.onHistory };
  const [photo, setPhoto] = useState<{ url: string; name: string } | null>(null);

  const [unitRange, setUnitRange] = useState<DateRange>(NO_DATE_RANGE);
  const [unitStatus, setUnitStatus] = useState<UnitStatusFilter>("all");
  const [planRange, setPlanRange] = useState<DateRange>(NO_DATE_RANGE);
  const [planStatus, setPlanStatus] = useState<PlanStatusFilter>("all");

  const units = useMemo(() => filterUnits(unitsInStock(records), unitRange, unitStatus), [records, unitRange, unitStatus]);
  const plans = useMemo(
    () => filterPlans(installmentPlans(records), planRange, planStatus),
    [records, planRange, planStatus],
  );
  const funds = useMemo(() => fundRows(records), [records]);
  const remits = useMemo(() => remitRows(records), [records]);
  const sold = useMemo(() => soldUnits(records), [records]);

  const lists = { units, installments: plans, funds, remits, sold };
  const page = paginate(lists[tab] as readonly unknown[], pageNumber, pageSize);
  const rowsOf = <T,>(rows: T[]) => paginate(rows, pageNumber, pageSize).rows;

  const selectTab = (id: TabId) => {
    setTab(id);
    setPageNumber(1);
  };

  /** Any filter change goes back to page 1. */
  const resetPage = <A,>(set: (value: A) => void) => (value: A) => {
    set(value);
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

        {notice && (
          <p className={notice.ok ? "entry-message ok notice" : "entry-message error notice"} role="status">
            {notice.text}{" "}
            <button type="button" className="notice-close" onClick={() => setNotice(null)} aria-label="Dismiss">
              &times;
            </button>
          </p>
        )}

        {tab === "units" && (
          <Filters
            dateLabel="Purchased"
            range={unitRange}
            onRange={resetPage(setUnitRange)}
            status={unitStatus}
            statusOptions={UNIT_STATUS}
            onStatus={resetPage(setUnitStatus)}
          />
        )}
        {tab === "installments" && (
          <Filters
            dateLabel="Next due"
            range={planRange}
            onRange={resetPage(setPlanRange)}
            status={planStatus}
            statusOptions={PLAN_STATUS}
            onStatus={resetPage(setPlanStatus)}
          />
        )}

        {tab === "units" && <UnitsTable rows={rowsOf(units)} onPhoto={(url, name) => setPhoto({ url, name })} sell={sellActions} actions={unitActions} />}
        {tab === "installments" && <InstallmentsTable rows={rowsOf(plans)} actions={installmentActions} />}
        {tab === "funds" && <FundsTable rows={rowsOf(funds)} actions={cashActions} saleUndo={saleUndoActions} />}
        {tab === "remits" && <RemitsTable rows={rowsOf(remits)} actions={cashActions} />}
        {tab === "sold" && <SoldTable rows={rowsOf(sold)} undo={saleUndoActions} edit={unitActions} />}
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
      {unitChanges.editing && (
        <EditUnitModal unit={unitChanges.editing} onSave={unitChanges.saveEdit} onClose={unitChanges.closeEdit} />
      )}
      {cash.editing && <EditCashModal row={cash.editing} onSave={cash.saveEdit} onClose={cash.closeEdit} />}
      {installments.paying && (
        <PaymentModal plan={installments.paying} onSave={installments.savePayment} onClose={installments.closePayment} />
      )}
      {installments.history && <PaymentHistoryModal plan={installments.history} onClose={installments.closeHistory} />}
      {photo && <PhotoModal url={photo.url} name={photo.name} onClose={() => setPhoto(null)} />}
    </main>
  );
}
