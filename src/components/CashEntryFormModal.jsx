import { useEffect, useMemo, useState } from "react";
import { Save } from "lucide-react";
import Modal from "./Modal";
import { useLanguage } from "../context/LanguageContext";
import { localDateTimeValue } from "../lib/cashExpenses";

const METHODS = [
  ["cash", "Cash"],
  ["bank", "Bank"],
  ["khqr", "KHQR"],
  ["card", "Card"],
  ["other", "Other"]
];

export default function CashEntryFormModal({
  entry,
  initialDirection = "expense",
  categories,
  baseCurrency = "USD",
  busy,
  onClose,
  onSave
}) {
  const { t } = useLanguage();
  const [form, setForm] = useState({
    direction: initialDirection,
    category_id: "",
    method: "cash",
    currency: baseCurrency,
    amount: "",
    entry_at: localDateTimeValue(),
    reference_number: "",
    remark: ""
  });
  const [error, setError] = useState("");

  useEffect(() => {
    const direction = entry?.direction || initialDirection;
    setForm({
      direction,
      category_id: entry?.category_id || "",
      method: entry?.method || "cash",
      currency: entry?.currency || baseCurrency,
      amount: entry?.amount == null ? "" : String(entry.amount),
      entry_at: localDateTimeValue(entry?.entry_at || new Date()),
      reference_number: entry?.reference_number || "",
      remark: entry?.remark || ""
    });
    setError("");
  }, [entry, initialDirection, baseCurrency]);

  const availableCategories = useMemo(
    () =>
      (categories || []).filter(
        (category) =>
          category.is_active && category.direction === form.direction
      ),
    [categories, form.direction]
  );

  useEffect(() => {
    if (
      form.category_id &&
      availableCategories.some((category) => category.id === form.category_id)
    ) {
      return;
    }

    setForm((current) => ({
      ...current,
      category_id: availableCategories[0]?.id || ""
    }));
  }, [availableCategories, form.category_id]);

  function update(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
    setError("");
  }

  async function submit(event) {
    event.preventDefault();
    const amount = Number(form.amount);

    if (!form.category_id) {
      setError("Create or select a category first.");
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Amount must be greater than zero.");
      return;
    }

    if (!form.entry_at) {
      setError("Entry date and time are required.");
      return;
    }

    await onSave({ ...form, id: entry?.id || null });
  }

  return (
    <Modal
      title={entry ? `${t("Edit")} ${entry.entry_number}` : form.direction === "income" ? t("Add cash in") : t("Add expense")}
      onClose={onClose}
      wide
    >
      <form className="cash-entry-form" onSubmit={submit}>
        <div className="cash-entry-grid">
          <label>
            <span>{t("Entry type")}</span>
            <select
              value={form.direction}
              onChange={(event) => update("direction", event.target.value)}
              disabled={Boolean(entry)}
            >
              <option value="income">{t("Cash in / Other income")}</option>
              <option value="expense">{t("Expense / Cash out")}</option>
            </select>
          </label>

          <label>
            <span>{t("Category")}</span>
            <select
              value={form.category_id}
              onChange={(event) => update("category_id", event.target.value)}
            >
              {availableCategories.map((category) => (
                <option value={category.id} key={category.id}>
                  {category.name}{category.affects_profit ? "" : ` · ${t("Cash only")}`}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>{t("Payment type")}</span>
            <select
              value={form.method}
              onChange={(event) => update("method", event.target.value)}
            >
              {METHODS.map(([value, label]) => (
                <option value={value} key={value}>{t(label)}</option>
              ))}
            </select>
          </label>

          <label>
            <span>{t("Currency")}</span>
            <select
              value={form.currency}
              onChange={(event) => update("currency", event.target.value)}
            >
              <option value="USD">USD</option>
              <option value="KHR">KHR</option>
            </select>
          </label>

          <label>
            <span>{t("Amount")}</span>
            <input
              type="number"
              min="0"
              step={form.currency === "KHR" ? "1" : "0.01"}
              value={form.amount}
              onChange={(event) => update("amount", event.target.value)}
              placeholder={form.currency === "KHR" ? "0" : "0.00"}
            />
          </label>

          <label>
            <span>{t("Date and time")}</span>
            <input
              type="datetime-local"
              value={form.entry_at}
              onChange={(event) => update("entry_at", event.target.value)}
            />
          </label>

          <label className="cash-entry-reference">
            <span>{t("Reference number")}</span>
            <input
              value={form.reference_number}
              onChange={(event) => update("reference_number", event.target.value)}
              placeholder={t("Invoice, bank reference or document number")}
            />
          </label>

          <label className="cash-entry-remark">
            <span>{t("Remark")}</span>
            <textarea
              rows="3"
              value={form.remark}
              onChange={(event) => update("remark", event.target.value)}
              placeholder={t("What was this payment for?")}
            />
          </label>
        </div>

        <div className="cash-profit-hint">
          {t("The selected category decides whether this entry changes Profit & Loss. Categories marked “Cash only” affect the balance but not net profit.")}
        </div>

        {error && <div className="notice error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>
            {t("Cancel")}
          </button>
          <button type="submit" className="primary-button" disabled={busy || availableCategories.length === 0}>
            <Save size={18} />
            {busy ? t("Saving...") : entry ? t("Save changes") : t("Save entry")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
