import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useLanguage } from "../context/LanguageContext";

function localInput(value) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

export default function AttendanceCorrectionModal({ session, busy, onClose, onSave }) {
  const { t } = useLanguage();
  const [values, setValues] = useState({ check_in_at: "", check_out_at: "", correction_note: "" });
  useEffect(() => {
    setValues({
      check_in_at: localInput(session?.check_in_at),
      check_out_at: localInput(session?.check_out_at),
      correction_note: ""
    });
  }, [session]);
  if (!session) return null;
  function change(event) {
    const { name, value } = event.target;
    setValues((current) => ({ ...current, [name]: value }));
  }
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card staff-modal" role="dialog" aria-modal="true" aria-label={t("Correct attendance")}>
        <div className="modal-header">
          <div><p className="eyebrow">{t("ATTENDANCE CORRECTION")}</p><h2>{session.profiles?.full_name || t("Staff member")}</h2></div>
          <button className="icon-button" type="button" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="form-grid two-columns">
          <label><span>{t("Check-in")}</span><input type="datetime-local" name="check_in_at" value={values.check_in_at} onChange={change} /></label>
          <label><span>{t("Check-out")}</span><input type="datetime-local" name="check_out_at" value={values.check_out_at} onChange={change} /></label>
          <label className="full-width"><span>{t("Correction reason")}</span><textarea name="correction_note" rows="3" value={values.correction_note} onChange={change} placeholder={t("Explain why this record is being changed")} /></label>
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>{t("Cancel")}</button>
          <button type="button" className="primary-button" disabled={busy || !values.check_in_at || values.correction_note.trim().length < 3} onClick={() => onSave({
            id: session.id,
            check_in_at: new Date(values.check_in_at).toISOString(),
            check_out_at: values.check_out_at ? new Date(values.check_out_at).toISOString() : null,
            correction_note: values.correction_note
          })}>{busy ? t("Saving...") : t("Save correction")}</button>
        </div>
      </section>
    </div>
  );
}
