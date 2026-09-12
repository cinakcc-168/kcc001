import { printElementDocument } from "../lib/listDocuments";
import Modal from "./Modal";
import { Printer } from "lucide-react";
import { useLanguage } from "../context/LanguageContext";
import { payrollDate, payrollDuration, payrollMoney } from "../lib/payroll";

export default function PayrollPayslipModal({ line, shop, payments = [], onClose }) {
  const { t } = useLanguage();
  const run = line.payroll_runs || {};
  return <Modal title={t("Payroll payslip")} onClose={onClose} wide><div className="payslip-sheet">
    <div className="payslip-header">{shop?.shop_logo_url && <img src={shop.shop_logo_url} alt="" />}<div><h2>{shop?.shop_name || "Tiny POS"}</h2><p>{shop?.shop_address || ""}</p><strong>{t("PAYSLIP")}</strong></div><div><b>{run.run_number}</b><span>{payrollDate(run.pay_date)}</span></div></div>
    <div className="payslip-meta"><span><small>{t("Staff")}</small><strong>{line.profiles?.full_name}</strong></span><span><small>{t("Branch")}</small><strong>{line.branches?.name}</strong></span><span><small>{t("Period")}</small><strong>{payrollDate(run.period_start)} – {payrollDate(run.period_end)}</strong></span><span><small>{t("Status")}</small><strong>{t(line.status)}</strong></span></div>
    <div className="payslip-columns"><section><h3>{t("Earnings")}</h3><p><span>{t("Base pay")}</span><b>{payrollMoney(line.base_pay, line.currency)}</b></p><p><span>{t("Overtime")} · {payrollDuration(line.overtime_minutes)}</span><b>{payrollMoney(line.overtime_pay, line.currency)}</b></p><p><span>{t("Allowances")}</span><b>{payrollMoney(line.allowances, line.currency)}</b></p><p><span>{t("Commission due")}</span><b>{payrollMoney(line.commission_due, line.currency)}</b></p><p className="total"><span>{t("Gross pay")}</span><b>{payrollMoney(line.gross_pay, line.currency)}</b></p></section><section><h3>{t("Deductions & payment")}</h3><p><span>{t("Deductions")}</span><b>{payrollMoney(line.deductions, line.currency)}</b></p><p><span>{t("Net pay")}</span><b>{payrollMoney(line.net_pay, line.currency)}</b></p><p><span>{t("Paid")}</span><b>{payrollMoney(line.paid_amount, line.currency)}</b></p><p className="total"><span>{t("Outstanding")}</span><b>{payrollMoney(Math.max(0, line.net_pay-line.paid_amount), line.currency)}</b></p></section></div>
    <div className="payslip-work"><span>{t("Worked")} <b>{payrollDuration(line.work_minutes)}</b></span><span>{t("Scheduled days")} <b>{line.scheduled_days}</b></span><span>{t("Attendance days")} <b>{line.paid_days}</b></span><span>{t("Absent days")} <b>{line.absent_days}</b></span></div>
    {payments.length > 0 && <div className="payslip-payments"><h3>{t("Payment history")}</h3>{payments.map((row) => <p key={row.id}><span>{row.payment_number} · {t(row.payment_method)} · {new Date(row.paid_at).toLocaleDateString("en-US")}</span><b>{payrollMoney(row.amount, line.currency)}</b></p>)}</div>}
    <div className="payslip-signatures"><span>{t("Prepared by")}</span><span>{t("Employee signature")}</span><span>{t("Approved by")}</span></div>
    <div className="modal-actions no-print"><button type="button" className="secondary-button" onClick={onClose}>{t("Close")}</button><button type="button" className="primary-button" onClick={() => printElementDocument({ title: t("Payroll Payslip"), selector: ".payslip-sheet", page: "A4 portrait" })}><Printer size={18} />{t("Print payslip")}</button></div>
  </div></Modal>;
}
