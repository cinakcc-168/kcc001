import Modal from "./Modal";
import { useEffect, useState } from "react";
import { useLanguage } from "../context/LanguageContext";

export default function CompensationProfileModal({ value, staff, branches, busy, onClose, onSave }) {
  const { t } = useLanguage();
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    user_id: "", branch_id: "", currency: "USD", pay_basis: "monthly",
    base_salary: "0", hourly_rate: "0", overtime_rate: "0",
    standard_minutes_per_day: "480", fixed_allowance: "0", fixed_deduction: "0",
    prorate_monthly_by_attendance: false, effective_from: today, effective_to: "",
    is_active: true, notes: ""
  });
  useEffect(() => { if (value) setForm({ ...form, ...value, effective_to: value.effective_to || "" }); }, [value]);
  const set = (name, next) => setForm((current) => ({ ...current, [name]: next }));
  function submit(event) { event.preventDefault(); onSave(form); }
  return <Modal title={value ? t("Edit compensation profile") : t("New compensation profile")} onClose={onClose}>
    <form className="modal-form payroll-form" onSubmit={submit}>
      <div className="form-grid two">
        <label><span>{t("Staff member")}</span><select value={form.user_id} onChange={(e) => set("user_id", e.target.value)} required disabled={Boolean(value)}><option value="">{t("Select staff")}</option>{staff.map((row) => <option key={row.id} value={row.id}>{row.full_name} · {row.role}</option>)}</select></label>
        <label><span>{t("Branch")}</span><select value={form.branch_id} onChange={(e) => set("branch_id", e.target.value)} required><option value="">{t("Select branch")}</option>{branches.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
        <label><span>{t("Payroll currency")}</span><select value={form.currency} onChange={(e) => set("currency", e.target.value)}><option>USD</option><option>KHR</option></select></label>
        <label><span>{t("Pay basis")}</span><select value={form.pay_basis} onChange={(e) => set("pay_basis", e.target.value)}><option value="monthly">{t("Monthly salary")}</option><option value="hourly">{t("Hourly")}</option></select></label>
        <label><span>{t("Monthly base salary")}</span><input type="number" min="0" step="0.01" value={form.base_salary} onChange={(e) => set("base_salary", e.target.value)} /></label>
        <label><span>{t("Hourly rate")}</span><input type="number" min="0" step="0.0001" value={form.hourly_rate} onChange={(e) => set("hourly_rate", e.target.value)} /></label>
        <label><span>{t("Overtime hourly rate")}</span><input type="number" min="0" step="0.0001" value={form.overtime_rate} onChange={(e) => set("overtime_rate", e.target.value)} /></label>
        <label><span>{t("Standard minutes per day")}</span><input type="number" min="60" max="1440" value={form.standard_minutes_per_day} onChange={(e) => set("standard_minutes_per_day", e.target.value)} /></label>
        <label><span>{t("Fixed allowance")}</span><input type="number" min="0" step="0.01" value={form.fixed_allowance} onChange={(e) => set("fixed_allowance", e.target.value)} /></label>
        <label><span>{t("Fixed deduction")}</span><input type="number" min="0" step="0.01" value={form.fixed_deduction} onChange={(e) => set("fixed_deduction", e.target.value)} /></label>
        <label><span>{t("Effective from")}</span><input type="date" value={form.effective_from} onChange={(e) => set("effective_from", e.target.value)} required /></label>
        <label><span>{t("Effective to")}</span><input type="date" value={form.effective_to} onChange={(e) => set("effective_to", e.target.value)} /></label>
      </div>
      <label className="form-check form-switch"><input className="form-check-input" type="checkbox" checked={form.prorate_monthly_by_attendance} onChange={(e) => set("prorate_monthly_by_attendance", e.target.checked)} /><span className="form-check-label">{t("Prorate monthly salary when recorded attendance is below scheduled time")}</span></label>
      <label className="form-check form-switch"><input className="form-check-input" type="checkbox" checked={form.is_active} onChange={(e) => set("is_active", e.target.checked)} /><span className="form-check-label">{t("Active compensation profile")}</span></label>
      <label><span>{t("Notes")}</span><textarea rows="3" value={form.notes} onChange={(e) => set("notes", e.target.value)} /></label>
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>{t("Cancel")}</button><button className="primary-button" disabled={busy}>{busy ? t("Saving...") : t("Save compensation")}</button></div>
    </form>
  </Modal>;
}
