import Modal from "./Modal";
import { useState } from "react";
import { useLanguage } from "../context/LanguageContext";
import { payrollMoney } from "../lib/payroll";

export default function PayrollAdjustmentModal({ line, busy, onClose, onSave }) {
  const { t } = useLanguage();
  const [form, setForm] = useState({ id: line.id, manual_allowance: line.manual_allowance || 0, manual_deduction: line.manual_deduction || 0, notes: line.notes || "" });
  return <Modal title={`${t("Adjust payroll")} · ${line.profiles?.full_name || t("Staff")}`} onClose={onClose}><form className="modal-form" onSubmit={(e) => { e.preventDefault(); onSave(form); }}>
    <div className="payroll-adjust-summary"><span>{t("Calculated gross")} <strong>{payrollMoney(line.gross_pay, line.currency)}</strong></span><span>{t("Current net")} <strong>{payrollMoney(line.net_pay, line.currency)}</strong></span></div>
    <div className="form-grid two">
      <label><span>{t("Additional allowance")}</span><input type="number" min="0" step="0.01" value={form.manual_allowance} onChange={(e) => setForm({ ...form, manual_allowance: e.target.value })} /></label>
      <label><span>{t("Additional deduction")}</span><input type="number" min="0" step="0.01" value={form.manual_deduction} onChange={(e) => setForm({ ...form, manual_deduction: e.target.value })} /></label>
    </div>
    <label><span>{t("Adjustment note")}</span><textarea rows="3" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
    <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>{t("Cancel")}</button><button className="primary-button" disabled={busy}>{busy ? t("Saving...") : t("Save adjustment")}</button></div>
  </form></Modal>;
}
