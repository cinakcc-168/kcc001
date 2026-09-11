import {
  AlertTriangle,
  ClipboardCheck
} from "lucide-react";
import {
  useEffect,
  useState
} from "react";
import Modal from "./Modal";
import { money } from "../lib/catalog";
import { useLanguage } from "../context/LanguageContext";

export default function StockCountCompleteModal({
  session,
  metrics,
  busy,
  onClose,
  onSubmit
}) {
  const { t } = useLanguage();
  const [note, setNote] = useState("");

  useEffect(() => {
    if (session) setNote("");
  }, [session?.id]);

  if (!session) return null;

  const ready =
    metrics.uncounted === 0;

  return (
    <Modal
      title={`${t("Complete")} ${session.count_number}`}
      onClose={onClose}
    >
      <form
        className="stock-count-complete-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (ready) onSubmit(note);
        }}
      >
        <div className="stock-count-complete-warning">
          <AlertTriangle size={21} />
          <span>
            {t("Pause sales, receiving, transfers and refunds before completion. Tiny POS blocks completion when system stock changed after the count started.")}
          </span>
        </div>

        <div className="stock-count-complete-grid">
          <div>
            <span>{t("Products")}</span>
            <strong>
              {metrics.total}
            </strong>
          </div>

          <div>
            <span>{t("Uncounted")}</span>
            <strong>
              {metrics.uncounted}
            </strong>
          </div>

          <div>
            <span>{t("Discrepancies")}</span>
            <strong>
              {metrics.discrepancies}
            </strong>
          </div>

          <div>
            <span>{t("Shortage items")}</span>
            <strong>
              {metrics.shortages}
            </strong>
          </div>

          <div>
            <span>{t("Overage items")}</span>
            <strong>
              {metrics.overages}
            </strong>
          </div>

          <div>
            <span>{t("USD value variance")}</span>
            <strong>
              {money(
                metrics.valueUsd,
                "USD"
              )}
            </strong>
          </div>

          <div>
            <span>{t("KHR value variance")}</span>
            <strong>
              {money(
                metrics.valueKhr,
                "KHR"
              )}
            </strong>
          </div>
        </div>

        {!ready && (
          <div className="notice error">
            {t("Count every product before completing this session.")}
          </div>
        )}

        <label>
          <span>{t("Completion note")}</span>
          <textarea
            rows="3"
            value={note}
            onChange={(event) =>
              setNote(event.target.value)
            }
            placeholder={t("Optional approval, witness or discrepancy explanation")}
          />
        </label>

        <div className="modal-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
            disabled={busy}
          >
            {t("Continue counting")}
          </button>

          <button
            type="submit"
            className="primary-button"
            disabled={busy || !ready}
          >
            <ClipboardCheck size={18} />
            {busy
              ? t("Applying stock count...")
              : metrics.discrepancies > 0
                ? t("Complete and adjust stock")
                : t("Complete balanced count")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
