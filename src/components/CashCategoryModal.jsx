import { useEffect, useState } from "react";
import { Edit3, Plus, Save } from "lucide-react";
import Modal from "./Modal";
import { useLanguage } from "../context/LanguageContext";

const empty = {
  id: null,
  name: "",
  direction: "expense",
  affects_profit: true,
  is_active: true
};

export default function CashCategoryModal({ categories, busy, onClose, onSave }) {
  const { t } = useLanguage();
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");

  useEffect(() => {
    setForm(empty);
    setError("");
  }, [categories]);

  function edit(category) {
    setForm({
      id: category.id,
      name: category.name,
      direction: category.direction,
      affects_profit: category.affects_profit,
      is_active: category.is_active
    });
    setError("");
  }

  function reset() {
    setForm(empty);
    setError("");
  }

  async function submit(event) {
    event.preventDefault();
    if (!form.name.trim()) {
      setError("Category name is required.");
      return;
    }
    await onSave(form);
    reset();
  }

  return (
    <Modal title={t("Cash & expense categories")} onClose={onClose} wide>
      <div className="cash-category-layout">
        <section className="cash-category-list">
          <div className="cash-category-heading">
            <div>
              <h3>{t("Categories")}</h3>
              <p>{t("Inactive categories stay in old records but cannot be selected.")}</p>
            </div>
            <button type="button" className="secondary-button" onClick={reset}>
              <Plus size={17} /> {t("New")}
            </button>
          </div>

          <div className="cash-category-rows">
            {(categories || []).map((category) => (
              <button
                type="button"
                className="cash-category-row"
                onClick={() => edit(category)}
                key={category.id}
              >
                <span>
                  <strong>{category.name}</strong>
                  <small>
                    {category.direction === "income" ? t("Cash in") : t("Expense")}
                    {category.affects_profit ? ` · ${t("Profit & Loss")}` : ` · ${t("Cash only")}`}
                  </small>
                </span>
                <span className={`status-pill ${category.is_active ? "active" : "inactive"}`}>
                  {category.is_active ? t("Active") : t("Inactive")}
                </span>
                <Edit3 size={17} />
              </button>
            ))}
          </div>
        </section>

        <form className="cash-category-form" onSubmit={submit}>
          <h3>{form.id ? t("Edit category") : t("New category")}</h3>

          <label>
            <span>{t("Name")}</span>
            <input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder={t("Example: Delivery expense")}
            />
          </label>

          <label>
            <span>{t("Type")}</span>
            <select
              value={form.direction}
              onChange={(event) => setForm((current) => ({ ...current, direction: event.target.value }))}
            >
              <option value="income">{t("Cash in / Other income")}</option>
              <option value="expense">{t("Expense / Cash out")}</option>
            </select>
          </label>

          <label className="toggle-row cash-category-toggle">
            <span>
              <strong>{t("Affects Profit & Loss")}</strong>
              <small>{t("Turn off for opening balance, owner contribution, transfer, or owner withdrawal.")}</small>
            </span>
            <input
              type="checkbox"
              checked={form.affects_profit}
              onChange={(event) => setForm((current) => ({ ...current, affects_profit: event.target.checked }))}
            />
          </label>

          <label className="toggle-row cash-category-toggle">
            <span>
              <strong>{t("Active")}</strong>
              <small>{t("Inactive categories cannot be used for new entries.")}</small>
            </span>
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.checked }))}
            />
          </label>

          {error && <div className="notice error">{error}</div>}

          <button type="submit" className="primary-button" disabled={busy}>
            <Save size={18} />
            {busy ? t("Saving...") : t("Save category")}
          </button>
        </form>
      </div>
    </Modal>
  );
}
