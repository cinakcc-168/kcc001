import {
  BadgeDollarSign,
  CalendarDays,
  CheckCircle2,
  Clock3,
  LogIn,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  WalletCards
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import AttendanceCorrectionModal from "../components/AttendanceCorrectionModal";
import CommissionPlanModal from "../components/CommissionPlanModal";
import CommissionPayoutModal from "../components/CommissionPayoutModal";
import {
  attendanceCheckIn,
  attendanceCheckOut,
  commissionMoney,
  correctAttendance,
  durationLabel,
  isoDate,
  loadStaffOperations,
  monthRange,
  recordCommissionPayout,
  saveCommissionPlan,
  staffDateTime
} from "../lib/staffOperations";

export default function StaffOperationsPage() {
  const { supabase, profile, access, can } = useAuth();
  const range = useMemo(() => monthRange(), []);
  const [filters, setFilters] = useState({ date_from: range.start, date_to: range.end, branch_id: "", user_id: "" });
  const [workspace, setWorkspace] = useState({ status: null, attendance: [], commissions: [], payouts: [], plans: [], staff: [], branches: [] });
  const [tab, setTab] = useState("attendance");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");
  const [note, setNote] = useState("");
  const [correction, setCorrection] = useState(null);
  const [plan, setPlan] = useState(undefined);
  const [payout, setPayout] = useState(false);

  const canManageAttendance = can("attendance.manage");
  const canManageCommissions = can("commissions.manage");
  const canPayCommissions = can("commissions.pay");
  const canViewCommission = can("commissions.view_self") || canManageCommissions;

  const refresh = useCallback(async () => {
    if (!supabase || !profile?.id) return;
    try {
      setLoading(true);
      const result = await loadStaffOperations(supabase, profile, access, filters);
      setWorkspace(result);
    } catch (error) {
      setMessageType("error");
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }, [supabase, profile, access, filters]);

  useEffect(() => { refresh(); }, [refresh]);

  const totals = useMemo(() => {
    const earned = { USD: 0, KHR: 0 };
    const paid = { USD: 0, KHR: 0 };
    for (const row of workspace.commissions) earned[row.currency] += Number(row.commission_amount || 0);
    for (const row of workspace.payouts) paid[row.currency] += Number(row.amount || 0);
    return { earned, paid, outstanding: { USD: Math.max(0, earned.USD - paid.USD), KHR: Math.max(0, earned.KHR - paid.KHR) } };
  }, [workspace.commissions, workspace.payouts]);

  function announce(type, text) { setMessageType(type); setMessage(text); }

  async function check(action) {
    try {
      setBusy(action);
      if (action === "check-in") await attendanceCheckIn(supabase, profile.branch_id, note);
      else await attendanceCheckOut(supabase, note);
      setNote("");
      announce("success", action === "check-in" ? "Checked in successfully." : "Checked out successfully.");
      await refresh();
    } catch (error) { announce("error", error.message); }
    finally { setBusy(""); }
  }

  async function saveCorrection(values) {
    try { setBusy("correction"); await correctAttendance(supabase, values); setCorrection(null); announce("success", "Attendance correction saved."); await refresh(); }
    catch (error) { announce("error", error.message); }
    finally { setBusy(""); }
  }

  async function savePlan(values) {
    try { setBusy("plan"); await saveCommissionPlan(supabase, values); setPlan(undefined); announce("success", "Commission plan saved and matching sales recalculated."); await refresh(); }
    catch (error) { announce("error", error.message); }
    finally { setBusy(""); }
  }

  async function savePayout(values) {
    try { setBusy("payout"); await recordCommissionPayout(supabase, values); setPayout(false); announce("success", "Commission payout recorded."); await refresh(); }
    catch (error) { announce("error", error.message); }
    finally { setBusy(""); }
  }

  const status = workspace.status;
  const elapsed = status?.elapsed_minutes || 0;

  return (
    <div className="page-stack staff-operations-page">
      <div className="page-heading">
        <div><p className="eyebrow">STAFF OPERATIONS</p><h1>Attendance & Commission</h1><p className="muted">Track working time, calculate refund-adjusted commissions and record staff payouts.</p></div>
        <div className="page-heading-actions"><button type="button" className="secondary-button" onClick={refresh} disabled={loading}><RefreshCw size={18} className={loading ? "spin" : ""} />Refresh</button></div>
      </div>

      {message && <div className={`notice ${messageType}`}>{message}</div>}

      <section className={`attendance-clock-card ${status?.checked_in ? "active" : ""}`}>
        <div className="attendance-clock-icon">{status?.checked_in ? <CheckCircle2 size={30} /> : <Clock3 size={30} />}</div>
        <div className="attendance-clock-copy">
          <span>{status?.checked_in ? "Currently checked in" : "Not checked in"}</span>
          <strong>{status?.checked_in ? durationLabel(elapsed) : profile?.branches?.name || "Assigned branch"}</strong>
          <small>{status?.checked_in ? `Since ${staffDateTime(status.session?.check_in_at)} · ${status.session?.branch_id === profile.branch_id ? profile?.branches?.name || "Current branch" : "Selected branch"}` : "Use POS or Telegram /checkin when your shift begins."}</small>
        </div>
        <label className="attendance-note"><span>Optional note</span><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Shift or handover note" /></label>
        <button type="button" className={status?.checked_in ? "danger-button" : "primary-button"} disabled={Boolean(busy)} onClick={() => check(status?.checked_in ? "check-out" : "check-in")}>
          {status?.checked_in ? <LogOut size={18} /> : <LogIn size={18} />}
          {busy ? "Saving..." : status?.checked_in ? "Check out" : "Check in"}
        </button>
      </section>

      <div className="staff-tabs" role="tablist">
        <button type="button" className={tab === "attendance" ? "active" : ""} onClick={() => setTab("attendance")}><CalendarDays size={18} />Attendance</button>
        {canViewCommission && <button type="button" className={tab === "commission" ? "active" : ""} onClick={() => setTab("commission")}><BadgeDollarSign size={18} />Commission</button>}
        {canManageCommissions && <button type="button" className={tab === "plans" ? "active" : ""} onClick={() => setTab("plans")}><WalletCards size={18} />Plans & Payouts</button>}
      </div>

      <section className="panel staff-filter-panel">
        <div className="staff-filters">
          <label><span>From</span><input type="date" value={filters.date_from} onChange={(event) => setFilters((current) => ({ ...current, date_from: event.target.value }))} /></label>
          <label><span>To</span><input type="date" value={filters.date_to} onChange={(event) => setFilters((current) => ({ ...current, date_to: event.target.value }))} /></label>
          {(canManageAttendance || canManageCommissions) && <label><span>Branch</span><select value={filters.branch_id} onChange={(event) => setFilters((current) => ({ ...current, branch_id: event.target.value }))}><option value="">Accessible branches</option>{workspace.branches.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>}
          {(canManageAttendance || canManageCommissions) && <label><span>Staff member</span><select value={filters.user_id} onChange={(event) => setFilters((current) => ({ ...current, user_id: event.target.value }))}><option value="">All staff</option>{workspace.staff.map((row) => <option key={row.id} value={row.id}>{row.full_name}</option>)}</select></label>}
        </div>
      </section>

      {tab === "attendance" && <section className="panel">
        <div className="panel-title-row"><div><p className="eyebrow">TIMESHEETS</p><h2>Attendance history</h2></div><span className="status-pill">{workspace.attendance.length} sessions</span></div>
        <div className="responsive-table"><table><thead><tr><th>Business date</th><th>Staff</th><th>Branch</th><th>Check-in</th><th>Check-out</th><th>Duration</th><th>Status</th>{canManageAttendance && <th />}</tr></thead><tbody>{workspace.attendance.map((row) => <tr key={row.id}><td>{row.business_date}</td><td><strong>{row.profiles?.full_name}</strong><small>{row.profiles?.role}</small></td><td>{row.branches?.name}</td><td>{staffDateTime(row.check_in_at)}<small>{row.check_in_source}</small></td><td>{staffDateTime(row.check_out_at)}<small>{row.check_out_source || "—"}</small></td><td>{durationLabel(row.status === "open" ? (Date.now() - new Date(row.check_in_at).getTime()) / 60000 : row.total_minutes)}</td><td><span className={`status-pill ${row.status}`}>{row.status}</span></td>{canManageAttendance && <td><button type="button" className="icon-button" onClick={() => setCorrection(row)} title="Correct attendance"><Pencil size={17} /></button></td>}</tr>)}{!workspace.attendance.length && <tr><td colSpan={canManageAttendance ? 8 : 7} className="empty-table">No attendance sessions in this period.</td></tr>}</tbody></table></div>
      </section>}

      {tab === "commission" && canViewCommission && <>
        <div className="staff-metric-grid"><article><span>Earned USD</span><strong>{commissionMoney(totals.earned.USD, "USD")}</strong></article><article><span>Paid USD</span><strong>{commissionMoney(totals.paid.USD, "USD")}</strong></article><article><span>Outstanding USD</span><strong>{commissionMoney(totals.outstanding.USD, "USD")}</strong></article><article><span>Outstanding KHR</span><strong>{commissionMoney(totals.outstanding.KHR, "KHR")}</strong></article></div>
        <section className="panel"><div className="panel-title-row"><div><p className="eyebrow">EARNINGS</p><h2>Sales commission ledger</h2></div><span className="status-pill">{workspace.commissions.length} sales</span></div><div className="responsive-table"><table><thead><tr><th>Date</th><th>Staff</th><th>Invoice</th><th>Branch</th><th>Base</th><th>Rate</th><th>Refund</th><th>Commission</th><th>Status</th></tr></thead><tbody>{workspace.commissions.map((row) => <tr key={row.id}><td>{staffDateTime(row.sale_completed_at)}</td><td>{row.profiles?.full_name}</td><td>{row.sales?.invoice_number}</td><td>{row.branches?.name}</td><td>{commissionMoney(row.commissionable_amount, row.currency)}<small>{row.base_type.replaceAll("_", " ")}</small></td><td>{Number(row.rate_percent || 0).toFixed(2)}%<small>+ {commissionMoney(row.fixed_per_sale, row.currency)}</small></td><td>{commissionMoney(row.refunded_amount, row.currency)}</td><td><strong>{commissionMoney(row.commission_amount, row.currency)}</strong></td><td><span className={`status-pill ${row.status}`}>{row.status}</span></td></tr>)}{!workspace.commissions.length && <tr><td colSpan="9" className="empty-table">No commission records in this period.</td></tr>}</tbody></table></div></section>
      </>}

      {tab === "plans" && canManageCommissions && <div className="staff-plan-grid">
        <section className="panel"><div className="panel-title-row"><div><p className="eyebrow">RULES</p><h2>Commission plans</h2></div><button type="button" className="primary-button" onClick={() => setPlan(null)}><Plus size={18} />New plan</button></div><div className="staff-plan-list">{workspace.plans.map((row) => <button type="button" key={row.id} className="staff-plan-row" onClick={() => setPlan(row)}><span><strong>{row.name}</strong><small>{row.profiles?.full_name} · {row.branches?.name || "All branches"}</small></span><span>{row.currency} · {Number(row.rate_percent).toFixed(2)}% + {commissionMoney(row.fixed_per_sale, row.currency)}<small>{row.base_type.replaceAll("_", " ")} · {row.is_active ? "Active" : "Inactive"}</small></span></button>)}{!workspace.plans.length && <div className="empty-state compact"><p>No commission plans yet.</p></div>}</div></section>
        <section className="panel"><div className="panel-title-row"><div><p className="eyebrow">PAYOUTS</p><h2>Payment history</h2></div>{canPayCommissions && <button type="button" className="primary-button" onClick={() => setPayout(true)}><Plus size={18} />Record payout</button>}</div><div className="responsive-table"><table><thead><tr><th>Paid at</th><th>Staff</th><th>Branch</th><th>Period</th><th>Method</th><th>Amount</th></tr></thead><tbody>{workspace.payouts.map((row) => <tr key={row.id}><td>{staffDateTime(row.paid_at)}</td><td>{row.profiles?.full_name}</td><td>{row.branches?.name}</td><td>{row.period_start} → {row.period_end}</td><td>{row.payment_method}<small>{row.reference_number || "—"}</small></td><td><strong>{commissionMoney(row.amount, row.currency)}</strong></td></tr>)}{!workspace.payouts.length && <tr><td colSpan="6" className="empty-table">No commission payouts in this period.</td></tr>}</tbody></table></div></section>
      </div>}

      {correction && <AttendanceCorrectionModal session={correction} busy={busy === "correction"} onClose={() => setCorrection(null)} onSave={saveCorrection} />}
      {plan !== undefined && <CommissionPlanModal plan={plan} staff={workspace.staff} branches={workspace.branches} busy={busy === "plan"} onClose={() => setPlan(undefined)} onSave={savePlan} />}
      {payout && <CommissionPayoutModal staff={workspace.staff} branches={workspace.branches} busy={busy === "payout"} onClose={() => setPayout(false)} onSave={savePayout} />}
    </div>
  );
}
