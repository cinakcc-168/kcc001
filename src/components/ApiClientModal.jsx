import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { INTEGRATION_SCOPES } from "../lib/integrations";
import { useLanguage } from "../context/LanguageContext";

const defaults = {
  name: "",
  description: "",
  scopes: ["catalog.read"],
  branch_ids: [],
  allowed_origins: "",
  rate_limit_per_minute: 60,
  expires_at: ""
};

export default function ApiClientModal({
  open,
  branches,
  busy,
  onClose,
  onSave
}) {
  const { t } = useLanguage();
  const [v, setV] = useState(defaults);

  useEffect(() => {
    if (open) setV(defaults);
  }, [open]);

  if (!open) return null;

  const toggle = (key, value) =>
    setV((c) => ({
      ...c,
      [key]: c[key].includes(value)
        ? c[key].filter((x) => x !== value)
        : [...c[key], value]
    }));

  return (
    <div className="modal-backdrop">
      <div className="modal integration-modal">
        <div className="modal-header">
          <div>
            <p className="eyebrow">{t("SECURE EXTERNAL ACCESS")}</p>
            <h2>{t("New API Client")}</h2>
          </div>
          <button className="icon-button" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="integration-form-grid">
          <label>
            {t("Client name")}
            <input
              value={v.name}
              onChange={(e) => setV({ ...v, name: e.target.value })}
              placeholder={t("Online store connector")}
            />
          </label>
          <label>
            {t("Requests per minute")}
            <input
              type="number"
              min="1"
              max="600"
              value={v.rate_limit_per_minute}
              onChange={(e) =>
                setV({ ...v, rate_limit_per_minute: e.target.value })
              }
            />
          </label>
          <label className="span-2">
            {t("Description")}
            <textarea
              value={v.description}
              onChange={(e) => setV({ ...v, description: e.target.value })}
            />
          </label>
          <label>
            {t("Expiry date")}
            <input
              type="datetime-local"
              value={v.expires_at}
              onChange={(e) => setV({ ...v, expires_at: e.target.value })}
            />
          </label>
          <label>
            {t("Allowed browser origins")}
            <textarea
              value={v.allowed_origins}
              onChange={(e) => setV({ ...v, allowed_origins: e.target.value })}
              placeholder={`https://example.com\n${t("One origin per line")}`}
            />
          </label>
        </div>

        <h3>{t("API scopes")}</h3>
        <div className="integration-check-grid">
          {INTEGRATION_SCOPES.map(([scope, label]) => (
            <label className="check-card" key={scope}>
              <input
                type="checkbox"
                checked={v.scopes.includes(scope)}
                onChange={() => toggle("scopes", scope)}
              />
              <span>
                <strong>{scope}</strong>
                <small>{t(label)}</small>
              </span>
            </label>
          ))}
        </div>

        <h3>{t("Allowed branches")}</h3>
        <p className="muted">
          {t("Leave all unchecked for organization-wide access.")}
        </p>
        <div className="integration-check-grid">
          {branches.map((b) => (
            <label className="check-card" key={b.id}>
              <input
                type="checkbox"
                checked={v.branch_ids.includes(b.id)}
                onChange={() => toggle("branch_ids", b.id)}
              />
              <span>
                <strong>{b.name}</strong>
                <small>{b.code}</small>
              </span>
            </label>
          ))}
        </div>

        <div className="modal-actions">
          <button className="secondary" onClick={onClose}>
            {t("Cancel")}
          </button>
          <button
            disabled={busy || !v.name.trim() || !v.scopes.length}
            onClick={() =>
              onSave({
                ...v,
                allowed_origins: v.allowed_origins
                  .split(/\r?\n|,/)
                  .map((x) => x.trim())
                  .filter(Boolean),
                rate_limit_per_minute: Number(v.rate_limit_per_minute),
                expires_at: v.expires_at
                  ? new Date(v.expires_at).toISOString()
                  : null
              })
            }
          >
            {busy ? t("Creating…") : t("Create API client")}
          </button>
        </div>
      </div>
    </div>
  );
}
