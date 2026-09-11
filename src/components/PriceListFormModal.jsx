import {
  BadgeDollarSign,
  Save
} from "lucide-react";
import {
  useEffect,
  useState
} from "react";
import Modal from "./Modal";
import { useLanguage } from "../context/LanguageContext";

function toLocalInput(value) {
  if (!value) return "";

  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  const local = new Date(
    date.getTime() - offset * 60000
  );

  return local.toISOString().slice(0, 16);
}

function blankForm(defaultBranchId = "") {
  return {
    price_list_id: null,
    code: "",
    name: "",
    currency: "USD",
    customer_type: "all",
    branch_id: defaultBranchId,
    priority: "0",
    starts_at: "",
    ends_at: "",
    is_active: true,
    notes: ""
  };
}

export default function PriceListFormModal({
  open,
  priceList,
  branches,
  busy,
  defaultBranchId = "",
  allowAllBranches = true,
  onClose,
  onSubmit
}) {
  const { t } = useLanguage();
  const [form, setForm] = useState(() => blankForm(defaultBranchId));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;

    setForm(
      priceList
        ? {
            price_list_id: priceList.id,
            code: priceList.code || "",
            name: priceList.name || "",
            currency: priceList.currency || "USD",
            customer_type:
              priceList.customer_type || "all",
            branch_id:
              priceList.branch_id || "",
            priority: String(
              priceList.priority || 0
            ),
            starts_at:
              toLocalInput(priceList.starts_at),
            ends_at:
              toLocalInput(priceList.ends_at),
            is_active:
              priceList.is_active !== false,
            notes: priceList.notes || ""
          }
        : blankForm(defaultBranchId)
    );

    setError("");
  }, [open, priceList, defaultBranchId]);

  if (!open) return null;

  function update(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value
    }));
    setError("");
  }

  async function submit(event) {
    event.preventDefault();

    if (!form.code.trim()) {
      setError(t("Price-list code is required."));
      return;
    }

    if (!form.name.trim()) {
      setError(t("Price-list name is required."));
      return;
    }

    if (
      form.starts_at
      && form.ends_at
      && new Date(form.ends_at)
        <= new Date(form.starts_at)
    ) {
      setError(
        t("End time must be after start time.")
      );
      return;
    }

    await onSubmit({
      ...form,
      starts_at: form.starts_at
        ? new Date(form.starts_at).toISOString()
        : null,
      ends_at: form.ends_at
        ? new Date(form.ends_at).toISOString()
        : null
    });
  }

  return (
    <Modal
      title={
        priceList
          ? `${t("Edit")} ${priceList.name}`
          : t("New price list")
      }
      onClose={() => !busy && onClose()}
      wide
    >
      <form
        className="price-list-form"
        onSubmit={submit}
      >
        <section className="price-list-form-intro">
          <BadgeDollarSign size={24} />
          <div>
            <strong>
              {t("Customer and wholesale pricing")}
            </strong>
            <span>
              {t("Only product units with an override use this list. Other units keep their normal selling price.")}
            </span>
          </div>
        </section>

        <div className="form-grid three">
          <label>
            <span>{t("Code")}</span>
            <input
              value={form.code}
              onChange={(event) =>
                update(
                  "code",
                  event.target.value.toUpperCase()
                )
              }
              placeholder="WHOLESALE-USD"
              autoFocus
            />
          </label>

          <label>
            <span>{t("Name")}</span>
            <input
              value={form.name}
              onChange={(event) =>
                update("name", event.target.value)
              }
              placeholder="Wholesale USD"
            />
          </label>

          <label>
            <span>{t("Currency")}</span>
            <select
              value={form.currency}
              onChange={(event) =>
                update("currency", event.target.value)
              }
              disabled={
                Boolean(
                  priceList?.price_list_items?.length
                )
              }
            >
              <option value="USD">USD</option>
              <option value="KHR">KHR</option>
            </select>
          </label>
        </div>

        <div className="form-grid three">
          <label>
            <span>{t("Automatic customer group")}</span>
            <select
              value={form.customer_type}
              onChange={(event) =>
                update(
                  "customer_type",
                  event.target.value
                )
              }
            >
              <option value="all">
                {t("All customers")}
              </option>
              <option value="regular">
                {t("Regular customers")}
              </option>
              <option value="vip">
                {t("VIP customers")}
              </option>
              <option value="wholesale">
                {t("Wholesale customers")}
              </option>
            </select>
          </label>

          <label>
            <span>{t("Branch")}</span>
            <select
              value={form.branch_id}
              onChange={(event) =>
                update(
                  "branch_id",
                  event.target.value
                )
              }
            >
              {allowAllBranches && (
                <option value="">
                  {t("All branches")}
                </option>
              )}
              {branches.map((branch) => (
                <option
                  value={branch.id}
                  key={branch.id}
                >
                  {branch.code} · {branch.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>{t("Priority")}</span>
            <input
              type="number"
              step="1"
              value={form.priority}
              onChange={(event) =>
                update(
                  "priority",
                  event.target.value
                )
              }
            />
            <small>
              {t("Higher wins when multiple lists match.")}
            </small>
          </label>
        </div>

        <div className="form-grid two">
          <label>
            <span>{t("Starts at")}</span>
            <input
              type="datetime-local"
              value={form.starts_at}
              onChange={(event) =>
                update(
                  "starts_at",
                  event.target.value
                )
              }
            />
          </label>

          <label>
            <span>{t("Ends at")}</span>
            <input
              type="datetime-local"
              value={form.ends_at}
              onChange={(event) =>
                update(
                  "ends_at",
                  event.target.value
                )
              }
            />
          </label>
        </div>

        <label>
          <span>{t("Internal notes")}</span>
          <textarea
            rows="3"
            value={form.notes}
            onChange={(event) =>
              update("notes", event.target.value)
            }
            placeholder={t("Optional explanation or approval reference")}
          />
        </label>

        <label className="check-row">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(event) =>
              update(
                "is_active",
                event.target.checked
              )
            }
          />
          <span>{t("Price list is active")}</span>
        </label>

        {error && (
          <div className="notice error">
            {error}
          </div>
        )}

        <div className="modal-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
            disabled={busy}
          >
            {t("Cancel")}
          </button>

          <button
            type="submit"
            className="primary-button"
            disabled={busy}
          >
            <Save size={18} />
            {busy
              ? t("Saving price list...")
              : t("Save price list")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
