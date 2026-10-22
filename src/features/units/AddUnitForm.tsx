import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { useAuth } from "../../auth/useAuth";
import { executePlan, newTransactionKey, writesEnabled } from "../../data/writes";
import { UNIT_CATEGORIES, UNIT_CONDITIONS, needsImei, planAddUnit } from "../../domain/unitEntry";
import { photoProblem, uploadUnitPhoto } from "../../lib/cloudinary";
import { toLocalDateString } from "../../lib/dates";
import { useFlashMessage } from "../useFlashMessage";

export function AddUnitForm() {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [imei, setImei] = useState("");
  const [condition, setCondition] = useState("");
  const [date, setDate] = useState(toLocalDateString());
  const [cost, setCost] = useState("");
  const [suggested, setSuggested] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileKey, setFileKey] = useState(0); // changing it clears the file input
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useFlashMessage();

  useEffect(() => {
    if (!photo) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    const problem = file ? photoProblem(file) : null;
    if (problem) {
      setMessage({ ok: false, text: problem });
      setPhoto(null);
      setFileKey((k) => k + 1);
      return;
    }
    setMessage(null);
    setPhoto(file);
  }

  function removePhoto() {
    setPhoto(null);
    setFileKey((k) => k + 1);
  }

  function reset() {
    setName("");
    setCategory("");
    setImei("");
    setCondition("");
    setCost("");
    setSuggested("");
    removePhoto();
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!user?.email) {
      setMessage({ ok: false, text: "You are signed out. Please sign in again." });
      return;
    }
    if (!photo) {
      setMessage({ ok: false, text: "Please upload a photo of the unit." });
      return;
    }

    const ctx = { today: toLocalDateString(), now: Date.now(), email: user.email };
    const fields = { name, category, condition, imei, date, cost: Number(cost), suggestedPrice: Number(suggested) };

    // Check the form before uploading, so a typo does not leave a stray photo behind.
    const check = planAddUnit({ ...fields, photoURL: "pending" }, "check", ctx);
    if (!check.ok) {
      setMessage({ ok: false, text: check.message });
      return;
    }

    setBusy(true);
    setMessage(null);

    let photoURL: string;
    try {
      photoURL = await uploadUnitPhoto(photo);
    } catch (error) {
      console.error("Photo upload failed:", error);
      setBusy(false);
      setMessage({ ok: false, text: "The photo could not be uploaded. Nothing was recorded. Please try again." });
      return;
    }

    const unitKey = newTransactionKey();
    const plan = planAddUnit({ ...fields, photoURL }, unitKey, ctx);
    const result = await executePlan(plan, (r) => ({ createAt: [{ key: unitKey, row: r.unit }], create: [r.expense] }));
    setBusy(false);

    if (result.ok) {
      reset();
      setMessage({ ok: true, text: `${result.result.unit.transactionId} added: ${result.result.unit.name}. Fund deducted.` });
    } else {
      setMessage({ ok: false, text: result.message });
    }
  }

  return (
    <form className="entry-form" onSubmit={(e) => void onSubmit(e)}>
      <input type="text" placeholder="Unit Name" value={name} onChange={(e) => setName(e.target.value)} required />
      <select value={category} onChange={(e) => setCategory(e.target.value)} required aria-label="Category">
        <option value="" disabled>
          Android, IOS, Laptop/Desktop
        </option>
        {UNIT_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c === "IOS" ? "iOS" : c}
          </option>
        ))}
      </select>
      {needsImei(category) && (
        <input type="text" placeholder="IMEI" value={imei} onChange={(e) => setImei(e.target.value)} required />
      )}
      <select value={condition} onChange={(e) => setCondition(e.target.value)} required aria-label="Condition">
        <option value="" disabled>
          Condition
        </option>
        {UNIT_CONDITIONS.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required aria-label="Date purchased" />
      <input
        type="number"
        inputMode="decimal"
        step="0.01"
        min="0"
        placeholder="Cost"
        value={cost}
        onChange={(e) => setCost(e.target.value)}
        required
      />
      <input
        type="number"
        inputMode="decimal"
        step="0.01"
        min="0"
        placeholder="Suggested Selling Price"
        value={suggested}
        onChange={(e) => setSuggested(e.target.value)}
        required
      />
      <label className="photo-pick">
        <span>Upload Photo *</span>
        <input key={fileKey} type="file" accept="image/*" onChange={choosePhoto} />
      </label>
      {preview && (
        <div className="photo-preview">
          <img src={preview} alt="Preview of the chosen photo" />
          <button type="button" className="remove-photo-btn" onClick={removePhoto}>
            Remove
          </button>
        </div>
      )}
      <button type="submit" className="entry-submit" disabled={busy || !writesEnabled}>
        {busy ? "Saving..." : "Add Unit"}
      </button>
      {!writesEnabled && <p className="coming-soon">Saving is switched off in this version.</p>}
      {message && (
        <p className={message.ok ? "entry-message ok" : "entry-message error"} role="status">
          {message.text}
        </p>
      )}
    </form>
  );
}
