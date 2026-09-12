import Modal from "./Modal";
import { useLanguage } from "../context/LanguageContext";

function pretty(value, noDataText = "No data") {
  if (value === null || value === undefined) {
    return noDataText;
  }

  return JSON.stringify(value, null, 2);
}

function readable(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function AuditDetailModal({ entry, onClose }) {
  const { t, language } = useLanguage();
  const dateLocale = language === "km" ? "km-KH" : "en-US";

  if (!entry) return null;

  return (
    <Modal title={t("Audit entry details")} onClose={onClose} wide>
      <div className="audit-detail">
        <div className="audit-detail-summary">
          <div>
            <span>{t("Action")}</span>
            <strong>{t(readable(entry.action))}</strong>
          </div>
          <div>
            <span>{t("Entity")}</span>
            <strong>{t(readable(entry.entity_type))}</strong>
          </div>
          <div>
            <span>{t("User")}</span>
            <strong>
              {entry.profiles?.full_name || t("System")}
            </strong>
          </div>
          <div>
            <span>{t("Branch")}</span>
            <strong>{entry.branches?.name || "—"}</strong>
          </div>
          <div>
            <span>{t("Record ID")}</span>
            <strong>{entry.entity_id || "—"}</strong>
          </div>
          <div>
            <span>{t("Date")}</span>
            <strong>
              {new Intl.DateTimeFormat(dateLocale, {
                dateStyle: "medium",
                timeStyle: "medium"
              }).format(new Date(entry.created_at))}
            </strong>
          </div>
        </div>

        <div className="audit-json-grid">
          <section>
            <h3>{t("Before")}</h3>
            <pre>{pretty(entry.old_data, t("No data"))}</pre>
          </section>
          <section>
            <h3>{t("After / Details")}</h3>
            <pre>{pretty(entry.new_data, t("No data"))}</pre>
          </section>
        </div>

        {(entry.ip_address || entry.user_agent) && (
          <div className="audit-client-info">
            {entry.ip_address && (
              <span>IP: {entry.ip_address}</span>
            )}
            {entry.user_agent && (
              <span>Client: {entry.user_agent}</span>
            )}
          </div>
        )}

        <div className="modal-actions">
          <button
            type="button"
            className="primary-button"
            onClick={onClose}
          >
            {t("Close")}
          </button>
        </div>
      </div>
    </Modal>
  );
}

