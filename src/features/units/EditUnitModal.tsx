import { useState } from "react";
import type { FormEvent } from "react";
import type { UnitRecord } from "../../domain/schemas";
import { UNIT_CATEGORIES, UNIT_CONDITIONS, needsImei } from "../../domain/unitEntry";
import type { EditUnitInput } from "../../domain/unitChanges";
import { effectiveStatus } from "../../domain/unitStatus";

interface Props {
  unit: UnitRecord;
  /** Returns an error message, or null when saved. */
  onSave: (unit: UnitRecord, input: EditUnitInput, newPhoto: File | null) => Promise<string | null>;
  onClose: () => void;
}

export function EditUnitModal({ unit, onSave, onClose }: Props) {
  const [name, setName] = useState(unit.name);
  const [category, setCategory] = useState(unit.category);
  const [imei, setImei] = useState(unit.imei === "0" ? "" : unit.imei);
  const [condition, setCondition] = useState(unit.condition);
  const [date, setDate] = useState(unit.date);
  const [cost, setCost] = useState(String(unit.cost));
  const [suggested, setSuggested] = useState(unit.suggestedPrice === undefined ? "" : String(unit.suggestedPrice));
  const [photo, setPhoto] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Cost is locked once the unit is sold or on a plan: the sale rows are built from it.
  const costLocked = effectiveStatus(unit) !== "in-stock";

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const message = await onSave(
      unit,
      { name, category, condition, imei, date, cost: Number(cost), suggestedPrice: Number(suggested) },
      photo,
    );
    setBusy(false);
    if (message) setError(message);
  }

  // An older record may hold a category or condition that is not in the lists: keep it selectable.
  const categories = (UNIT_CATEGORIES as readonly string[]).includes(category) ? [...UNIT_CATEGORIES] : [category, ...UNIT_CATEGORIES];
  const conditions = (UNIT_CONDITIONS as readonly string[]).includes(condition) ? [...UNIT_CONDITIONS] : [condition, ...UNIT_CONDITIONS];

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-label="Edit unit">
      <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={(e) => void submit(e)}>
        <h3>
          Edit unit <span className="modal-sub">{unit.transactionId}</span>
        </h3>
        <label>
          Name
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          Category
          <select value={category} onChange={(e) => setCategory(e.target.value)} required>
            {categories.map((c) => (
              <option key={c || "none"} value={c}>
                {c === "IOS" ? "iOS" : c || "Choose..."}
              </option>
            ))}
          </select>
        </label>
        {needsImei(category) && (
          <label>
            IMEI
            <input type="text" value={imei} onChange={(e) => setImei(e.target.value)} required />
          </label>
        )}
        <label>
          Condition
          <select value={condition} onChange={(e) => setCondition(e.target.value)} required>
            {conditions.map((c) => (
              <option key={c || "none"} value={c}>
                {c || "Choose..."}
              </option>
            ))}
          </select>
        </label>
        <label>
          Date purchased
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label>
          Cost
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            readOnly={costLocked}
            required
          />
        </label>
        <p className="modal-info">
          {costLocked
            ? "This unit is sold, so its cost is locked. To change it, undo the sale first."
            : "Changing the cost also changes the purchase expense, so the fund follows."}
        </p>
        <label>
          Suggested selling price
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={suggested}
            onChange={(e) => setSuggested(e.target.value)}
            required
          />
        </label>
        <label>
          {unit.photoURL ? "Replace photo (optional)" : "Add photo (optional)"}
          <input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
        </label>
        {error && (
          <p className="entry-message error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-buttons">
          <button type="button" className="modal-cancel" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="entry-submit" disabled={busy}>
            {busy ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
