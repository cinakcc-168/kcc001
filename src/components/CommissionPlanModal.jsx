import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useLanguage } from "../context/LanguageContext";
import { isoDate } from "../lib/staffOperations";

const emptyPlan = {
  id: null, user_id: "", branch_id: "", name: "Standard commission",
  currency: "USD", base_type: "net_sales", rate_percent: 0,
  fixed_per_sale: 0, effective_from: isoDate(), effective_to: "",
  is_active: true, notes: ""
};

export default function CommissionPlanModal({ plan, staff, branches, busy, onClose, onSave }) {
  const { t } = useLanguage();
  const [values, setValues] = useState(emptyPlan);
  useEffect(() => setValues(plan ? {
    ...emptyPlan, ...plan,
    branch_id: plan.branch_id || "",
    effective_to: plan.effective_to || ""
  } : emptyPlan), [plan]);
  function change(event) {
    const { name, value, type, checked } = event.target;
    setValues((current) => ({ ...current, [name]: type === "checkbox" ? checked : value }));
  }
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card staff-modal" role="dialog" aria-modal="true" aria-label={t("Commission plan")}>
        <div className="modal-header"><div><p className="eyebrow">{t("COMMISSION PLAN")}</p><h2>{plan ? t("Edit plan") : t("New plan")}</h2></div><button className="icon-button" type="button" onClick={onClose}><X size={20} /></button></div>
        <div className="form-grid two-columns">
          <label><span>{t("Staff member")}</span><select name="user_id" value={values.user_id} onChange={change}><option value="">{t("Select staff")}</option>{staff.map((row) => <option key={row.id} value={row.id}>{row.full_name} · {t(row.role)}</option>)}</select></label>
          <label><span>{t("Branch")}</span><select name="branch_id" value={values.branch_id} onChange={change}><option value="">{t("All assigned branches")}</option>{branches.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
          <label><span>{t("Plan name")}</span><input name="name" value={values.name} onChange={change} /></label>
          <label><span>{t("Currency")}</span><select name="currency" value={values.currency} onChange={change}><option>USD</option><option>KHR</option></select></label>
          <label><span>{t("Commission base")}</span><select name="base_type" value={values.base_type} onChange={change}><option value="net_sales">{t("Net sales after refunds")}</option><option value="gross_profit">{t("Gross profit after refunds")}</option></select></label>
          <label><span>{t("Rate (%)")}</span><input type="number" min="0" max="100" step="0.01" name="rate_percent" value={values.rate_percent} onChange={change} /></label>
          <label><span>{t("Fixed amount per sale")}</span><input type="number" min="0" step={values.currency === "KHR" ? "1" : "0.01"} name="fixed_per_sale" value={values.fixed_per_sale} onChange={change} /></label>
          <label><span>{t("Effective from")}</span><input type="date" name="effective_from" value={values.effective_from} onChange={change} /></label>
          <label><span>{t("Effective to")}</span><input type="date" name="effective_to" value={values.effective_to} onChange={change} /></label>
          <label className="form-check form-switch full-width"><input className="form-check-input" id="plan-active" type="checkbox" name="is_active" checked={values.is_active} onChange={change} /><span className="form-check-label">{t("Active plan")}</span></label>
          <label className="full-width"><span>{t("Notes")}</span><textarea name="notes" rows="3" value={values.notes || ""} onChange={change} /></label>
        </div>
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>{t("Cancel")}</button><button type="button" className="primary-button" disabled={busy || !values.user_id || !values.name.trim()} onClick={() => onSave(values)}>{busy ? t("Saving...") : t("Save plan")}</button></div>
      </section>
    </div>
  );
}
