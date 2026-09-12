import {
  BadgeDollarSign,
  CalendarDays,
  CalendarPlus,
  Check,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  FileSpreadsheet,
  Image as ImageIcon,
  LogIn,
  LogOut,
  MapPin,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Send,
  Umbrella,
  WalletCards,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import AttendanceCorrectionModal from "../components/AttendanceCorrectionModal";
import CommissionPlanModal from "../components/CommissionPlanModal";
import CommissionPayoutModal from "../components/CommissionPayoutModal";
import LeaveRequestModal from "../components/LeaveRequestModal";
import MediaImage from "../components/MediaImage";
import MediaPreviewModal from "../components/MediaPreviewModal";
import ManualAttendanceModal from "../components/ManualAttendanceModal";
import DateRangePresetFields from "../components/DateRangePresetFields";
import ResponsiveDataList from "../components/ResponsiveDataList";
import {
  attendanceCheckIn,
  attendanceCheckOut,
  attendanceStatusLabel,
  buildDayOffMatrix,
  cancelLeaveRequest,
  commissionMoney,
  correctAttendance,
  downloadStaffExcel,
  durationLabel,
  isoDate,
  leaveStatusLabel,
  loadStaffOperations,
  monthRange,
  printStaffReport,
  recordCommissionPayout,
  reviewLeaveRequest,
  saveCommissionPlan,
  saveManualAttendance,
  staffDateTime,
  staffTime,
  submitLeaveRequest
} from "../lib/staffOperations";
import { notifyTelegramEvent } from "../lib/telegram";

function currentPosition(t = (s) => s) {
  if (!navigator.geolocation) {
    return Promise.reject(new Error(t("This device does not support location. Attendance check-in requires branch location verification.")));
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy
      }),
      (error) => reject(new Error(
        error.code === 1
          ? t("Location permission was denied. Allow precise location for Tiny POS and try again.")
          : t("Your location could not be verified. Move near the branch and try again.")
      )),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 15000 }
    );
  });
}

function initialTab() {
  const value = new URLSearchParams(window.location.search).get("tab");
  return ["attendance", "dayoff", "leave", "commission", "plans"].includes(value)
    ? value
    : "attendance";
}

function PageSizeControl({ value, onChange, t = (s) => s }) {
  return (
    <label className="staff-page-size">
      <span>{t("Rows")}</span>
      <select value={value} onChange={(event) => onChange(Number(event.target.value))}>
        {[30, 60, 90, 120].map((size) => <option key={size} value={size}>{size}</option>)}
      </select>
    </label>
  );
}

function Pagination({ page, pageSize, total, onPage, t = (s) => s }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="staff-pagination">
      <button type="button" className="secondary-button" disabled={page <= 1} onClick={() => onPage(page - 1)}>{t("Previous")}</button>
      <span>{t("Page")} <strong>{page}</strong> {t("of")} <strong>{pages}</strong></span>
      <button type="button" className="secondary-button" disabled={page >= pages} onClick={() => onPage(page + 1)}>{t("Next")}</button>
    </div>
  );
}

export default function StaffOperationsPage() {
  const { supabase, session, profile, access, can } = useAuth();
  const { t, language } = useLanguage();
  const today = useMemo(() => isoDate(), []);
  const [filters, setFilters] = useState({
    date_from: today,
    date_to: today,
    branch_id: "",
    user_id: ""
  });
  const [workspace, setWorkspace] = useState({
    status: null,
    attendance: [],
    attendanceReport: { rows: [], summary: [], settings: {} },
    commissions: [],
    payouts: [],
    plans: [],
    staff: [],
    branches: [],
    leaveRequests: []
  });
  const [tab, setTab] = useState(initialTab);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");
  const [note, setNote] = useState("");
  const [correction, setCorrection] = useState(null);
  const [manualAttendance, setManualAttendance] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [plan, setPlan] = useState(undefined);
  const [payout, setPayout] = useState(false);
  const [previewMedia, setPreviewMedia] = useState(null);
  const [pageSize, setPageSize] = useState(30);
  const [page, setPage] = useState(1);

  const canManageAttendance = can("attendance.manage");
  const canManageCommissions = can("commissions.manage");
  const canPayCommissions = can("commissions.pay");
  const canViewCommission = can("commissions.view_self") || canManageCommissions;
  const canRequestLeave = can("leave.request") || can("staff_operations.self") || canManageAttendance;
  const canManageLeave = can("leave.manage") || canManageAttendance;

  const attendanceColumns = useMemo(() => [
    { label: t("Date"), value: "business_date" },
    { label: t("Day"), value: (row) => t(row.weekday_name || "") },
    { label: t("Staff"), value: "full_name" },
    { label: t("Role"), value: (row) => t(row.role || "") },
    { label: t("Branch"), value: (row) => row.branch_name || "—" },
    { label: t("Check-in"), value: (row) => staffTime(row.check_in_at, language) },
    { label: t("Check-out"), value: (row) => staffTime(row.check_out_at, language) },
    { label: t("Status"), value: (row) => attendanceStatusLabel(row.attendance_status, t) },
    { label: t("Late"), value: (row) => durationLabel(row.late_minutes, language) },
    { label: t("Overtime"), value: (row) => durationLabel(row.overtime_minutes, language) },
    { label: t("Worked"), value: (row) => durationLabel(row.total_minutes, language) },
    { label: t("Note"), value: (row) => row.note || "" }
  ], [t, language]);

  const leaveColumns = useMemo(() => [
    { label: t("Requested"), value: (row) => staffDateTime(row.created_at, language) },
    { label: t("Staff"), value: (row) => row.profiles?.full_name || "—" },
    { label: t("Role"), value: (row) => t(row.profiles?.role || "") || "—" },
    { label: t("Branch"), value: (row) => row.branches?.name || "—" },
    { label: t("From"), value: "date_from" },
    { label: t("To"), value: "date_to" },
    { label: t("Type"), value: (row) => t(String(row.leave_type || "").replaceAll("_", " ")) },
    { label: t("Reason"), value: "reason" },
    { label: t("Status"), value: (row) => leaveStatusLabel(row.status, t) },
    { label: t("Reviewed by"), value: (row) => row.reviewer?.full_name || "—" },
    { label: t("Review note"), value: (row) => row.review_note || "" },
    { label: t("Picture"), value: (row) => row.image_url ? t("Attached") : "—" }
  ], [t, language]);

  const commissionColumns = useMemo(() => [
    { label: t("Date"), value: (row) => staffDateTime(row.sale_completed_at, language) },
    { label: t("Staff"), value: (row) => row.profiles?.full_name || "—" },
    { label: t("Invoice"), value: (row) => row.sales?.invoice_number || "—" },
    { label: t("Branch"), value: (row) => row.branches?.name || "—" },
    { label: t("Currency"), value: "currency" },
    { label: t("Base"), value: "commissionable_amount" },
    { label: t("Rate %"), value: (row) => Number(row.rate_percent || 0).toFixed(2) },
    { label: t("Fixed"), value: "fixed_per_sale" },
    { label: t("Refund"), value: "refunded_amount" },
    { label: t("Commission"), value: "commission_amount" },
    { label: t("Status"), value: (row) => t(row.status || "") }
  ], [t, language]);

  const refresh = useCallback(async () => {
    if (!supabase || !profile?.id) return;
    try {
      setLoading(true);
      setWorkspace(await loadStaffOperations(supabase, profile, access, filters));
    } catch (error) {
      setMessageType("error");
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }, [supabase, profile, access, filters]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { setPage(1); }, [tab, pageSize, filters]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") === "1" && canRequestLeave) setLeaveOpen(true);
  }, [canRequestLeave]);

  const totals = useMemo(() => {
    const earned = { USD: 0, KHR: 0 };
    const paid = { USD: 0, KHR: 0 };
    for (const row of workspace.commissions) earned[row.currency] += Number(row.commission_amount || 0);
    for (const row of workspace.payouts) paid[row.currency] += Number(row.amount || 0);
    return {
      earned,
      paid,
      outstanding: {
        USD: Math.max(0, earned.USD - paid.USD),
        KHR: Math.max(0, earned.KHR - paid.KHR)
      }
    };
  }, [workspace.commissions, workspace.payouts]);

  const attendanceRows = workspace.attendanceReport?.rows || [];
  const dayOffRows = attendanceRows.filter((row) => ["day_off", "worked_day_off", "leave"].includes(row.attendance_status));
  const reportSummary = workspace.attendanceReport?.summary || [];
  const attendanceTotals = useMemo(() => reportSummary.reduce((total, row) => ({
    calendar_days: total.calendar_days + Number(row.calendar_days || 0),
    present_days: total.present_days + Number(row.present_days || 0),
    on_time_days: total.on_time_days + Number(row.on_time_days || 0),
    late_days: total.late_days + Number(row.late_days || 0),
    overtime_days: total.overtime_days + Number(row.overtime_days || 0),
    absent_days: total.absent_days + Number(row.absent_days || 0),
    day_off_days: total.day_off_days + Number(row.day_off_days || 0),
    leave_days: total.leave_days + Number(row.leave_days || 0),
    work_minutes: total.work_minutes + Number(row.work_minutes || 0),
    overtime_minutes: total.overtime_minutes + Number(row.overtime_minutes || 0),
    late_minutes: total.late_minutes + Number(row.late_minutes || 0)
  }), {
    calendar_days: 0,
    present_days: 0,
    on_time_days: 0,
    late_days: 0,
    overtime_days: 0,
    absent_days: 0,
    day_off_days: 0,
    leave_days: 0,
    work_minutes: 0,
    overtime_minutes: 0,
    late_minutes: 0
  }), [reportSummary]);

  const leaveTotals = useMemo(() => workspace.leaveRequests.reduce((result, row) => {
    result[row.status] = Number(result[row.status] || 0) + 1;
    return result;
  }, { pending: 0, approved: 0, rejected: 0, cancelled: 0 }), [workspace.leaveRequests]);

  const selectedStaff = workspace.staff.find((row) => row.id === filters.user_id);
  const selectedBranch = workspace.branches.find((row) => row.id === filters.branch_id);
  const selectionText = `${selectedStaff?.full_name || (canManageAttendance || canManageLeave ? t("All staff") : profile?.full_name)} · ${selectedBranch?.name || t("All accessible branches")} · ${filters.date_from} ${t("to")} ${filters.date_to}`;

  const attendancePrintSummary = useMemo(() => [
    { label: t("Selected filters"), value: selectionText },
    { label: t("Present"), value: attendanceTotals.present_days },
    { label: t("On time"), value: attendanceTotals.on_time_days },
    { label: t("Late"), value: attendanceTotals.late_days },
    { label: t("Overtime"), value: attendanceTotals.overtime_days },
    { label: t("Absent"), value: attendanceTotals.absent_days },
    { label: t("Day off"), value: attendanceTotals.day_off_days },
    { label: t("Approved leave"), value: attendanceTotals.leave_days },
    { label: t("Worked"), value: durationLabel(attendanceTotals.work_minutes, language) },
    { label: t("Late time"), value: durationLabel(attendanceTotals.late_minutes, language) },
    { label: t("OT time"), value: durationLabel(attendanceTotals.overtime_minutes, language) }
  ], [t, language, selectionText, attendanceTotals]);

  const availableStaffForMatrix = useMemo(() => workspace.staff.filter((row) =>
    (!filters.user_id || row.id === filters.user_id)
    && (!filters.branch_id || row.branch_id === filters.branch_id)
  ), [workspace.staff, filters.user_id, filters.branch_id]);
  const dayOffMatrix = useMemo(() => buildDayOffMatrix(
    attendanceRows,
    availableStaffForMatrix,
    filters.date_from,
    filters.date_to,
    t
  ), [attendanceRows, availableStaffForMatrix, filters.date_from, filters.date_to, t]);

  const allRows = tab === "attendance"
    ? attendanceRows
    : tab === "dayoff"
      ? dayOffRows
      : tab === "leave"
        ? workspace.leaveRequests
        : tab === "commission"
          ? workspace.commissions
          : [];
  const pagedRows = allRows.slice((page - 1) * pageSize, page * pageSize);

  function announce(type, text) {
    setMessageType(type);
    setMessage(text);
  }

  function selectTab(next) {
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    url.searchParams.delete("new");
    window.history.replaceState({}, "", url);
  }

  function showDayOffList() {
    const range = monthRange(filters.date_from);
    setFilters((current) => ({ ...current, date_from: range.start, date_to: range.end }));
    selectTab("dayoff");
  }

  async function check(action) {
    try {
      setBusy(action);
      const branch = workspace.branches.find((row) => row.id === profile.branch_id) || profile.branches;
      const location = branch?.attendance_geofence_required === false ? {} : await currentPosition(t);
      if (action === "check-in") await attendanceCheckIn(supabase, profile.branch_id, note, location);
      else await attendanceCheckOut(supabase, note, location);
      setNote("");
      announce("success", action === "check-in" ? t("Checked in at the branch successfully.") : t("Checked out successfully."));
      await refresh();
    } catch (error) {
      announce("error", error.message);
    } finally {
      setBusy("");
    }
  }

  async function saveCorrection(values) {
    try {
      setBusy("correction");
      await correctAttendance(supabase, values);
      setCorrection(null);
      announce("success", t("Attendance correction saved."));
      await refresh();
    } catch (error) {
      announce("error", error.message);
    } finally {
      setBusy("");
    }
  }

  async function saveManual(values) {
    try {
      setBusy("manual-attendance");
      const result = await saveManualAttendance(supabase, values);
      setManualAttendance(false);
      announce("success", `${result.saved_days} ${t("attendance day(s) saved.")}`);
      await refresh();
    } catch (error) {
      announce("error", error.message);
    } finally {
      setBusy("");
    }
  }

  async function saveLeave(values) {
    try {
      setBusy("leave");
      const result = await submitLeaveRequest(supabase, session, values);
      setLeaveOpen(false);
      selectTab("leave");
      announce("success", t("Leave request submitted and waiting for manager approval."));
      void notifyTelegramEvent(session, "leave_requested", result.id);
      await refresh();
    } catch (error) {
      announce("error", error.message);
    } finally {
      setBusy("");
    }
  }

  async function reviewLeave(row, status) {
    const label = status === "approved" ? t("approve") : t("reject");
    if (!window.confirm(`${label} ${row.profiles?.full_name}${t("’s leave request?")}`)) return;
    const reviewNote = window.prompt(t("Review note (optional):"), "") || "";
    try {
      setBusy(`leave-${row.id}`);
      const result = await reviewLeaveRequest(supabase, row.id, status, reviewNote);
      announce("success", `${t("Leave request")} ${leaveStatusLabel(status, t)}.`);
      void notifyTelegramEvent(session, `leave_${status}`, result.id);
      await refresh();
    } catch (error) {
      announce("error", error.message);
    } finally {
      setBusy("");
    }
  }

  async function cancelLeave(row) {
    if (!window.confirm(t("Cancel this pending leave request?"))) return;
    try {
      setBusy(`leave-${row.id}`);
      const result = await cancelLeaveRequest(supabase, row.id);
      announce("success", t("Leave request cancelled."));
      void notifyTelegramEvent(session, "leave_cancelled", result.id);
      await refresh();
    } catch (error) {
      announce("error", error.message);
    } finally {
      setBusy("");
    }
  }

  async function savePlan(values) {
    try {
      setBusy("plan");
      await saveCommissionPlan(supabase, values);
      setPlan(undefined);
      announce("success", t("Commission plan saved and matching sales recalculated."));
      await refresh();
    } catch (error) {
      announce("error", error.message);
    } finally {
      setBusy("");
    }
  }

  async function savePayout(values) {
    try {
      setBusy("payout");
      await recordCommissionPayout(supabase, values);
      setPayout(false);
      announce("success", t("Commission payout recorded."));
      await refresh();
    } catch (error) {
      announce("error", error.message);
    } finally {
      setBusy("");
    }
  }

  function reportDefinition() {
    if (tab === "commission") {
      return {
        title: t("Sales Commission Report"),
        columns: commissionColumns,
        rows: workspace.commissions,
        summary: [
          { label: t("Selected filters"), value: selectionText },
          { label: t("Earned USD"), value: commissionMoney(totals.earned.USD, "USD") },
          { label: t("Paid USD"), value: commissionMoney(totals.paid.USD, "USD") },
          { label: t("Outstanding USD"), value: commissionMoney(totals.outstanding.USD, "USD") },
          { label: t("Earned KHR"), value: commissionMoney(totals.earned.KHR, "KHR") },
          { label: t("Paid KHR"), value: commissionMoney(totals.paid.KHR, "KHR") },
          { label: t("Outstanding KHR"), value: commissionMoney(totals.outstanding.KHR, "KHR") }
        ],
        filename: `commission-${filters.date_from}-${filters.date_to}.xls`
      };
    }
    if (tab === "leave") {
      return {
        title: t("Staff Take Leave Requests"),
        columns: leaveColumns,
        rows: workspace.leaveRequests,
        summary: [
          { label: t("Selected filters"), value: selectionText },
          { label: t("Pending"), value: leaveTotals.pending },
          { label: t("Approved"), value: leaveTotals.approved },
          { label: t("Rejected"), value: leaveTotals.rejected },
          { label: t("Cancelled"), value: leaveTotals.cancelled }
        ],
        filename: `take-leave-${filters.date_from}-${filters.date_to}.xls`
      };
    }
    if (tab === "dayoff") {
      return {
        title: t("Employee Day-Off Schedule"),
        columns: dayOffMatrix.columns,
        rows: dayOffMatrix.rows,
        summary: [
          { label: t("Selected filters"), value: selectionText },
          { label: t("Purpose"), value: t("Manager-set Day-Off schedule and approved leave; separate from pending Take Leave requests.") }
        ],
        filename: `day-off-list-${filters.date_from}-${filters.date_to}.xls`
      };
    }
    return {
      title: t("Daily Attendance Report"),
      columns: attendanceColumns,
      rows: attendanceRows,
      summary: attendancePrintSummary,
      filename: `attendance-${filters.date_from}-${filters.date_to}.xls`
    };
  }

  function printCurrent() {
    const report = reportDefinition();
    printStaffReport({ ...report, subtitle: selectionText, orientation: "landscape" });
  }

  function exportCurrent() {
    const report = reportDefinition();
    downloadStaffExcel(report.filename, report.columns, report.rows, report.summary, report.title);
  }

  function openCorrection(row) {
    if (!row.session_id) return;
    const record = workspace.attendance.find((item) => item.id === row.session_id);
    if (record) setCorrection(record);
  }

  const status = workspace.status;
  const elapsed = status?.elapsed_minutes || 0;
  const printableTab = ["attendance", "dayoff", "leave", "commission"].includes(tab);

  return (
    <div className="page-stack staff-operations-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t("STAFF OPERATIONS")}</p>
          <h1>{t("Attendance & Commission")}</h1>
          <p className="muted">{t("Daily attendance, manager day-off schedules, staff leave requests and commission reports.")}</p>
        </div>
        <div className="page-heading-actions">
          <button type="button" className="secondary-button" onClick={refresh} disabled={loading}>
            <RefreshCw size={18} className={loading ? "spin" : ""} />{t("Refresh")}
          </button>
        </div>
      </div>

      {message && <div className={`notice ${messageType}`}>{message}</div>}

      <section className={`attendance-clock-card ${status?.checked_in ? "active" : ""}`}>
        <div className="attendance-clock-icon">{status?.checked_in ? <CheckCircle2 size={30} /> : <Clock3 size={30} />}</div>
        <div className="attendance-clock-copy">
          <span>{status?.checked_in ? t("Currently checked in") : t("Not checked in")}</span>
          <strong>{status?.checked_in ? durationLabel(elapsed, language) : profile?.branches?.name || t("Assigned branch")}</strong>
          <small>{status?.checked_in ? `${t("Since")} ${staffDateTime(status.session?.check_in_at, language)}` : t("Check-in verifies that this device is inside the branch attendance radius.")}</small>
          {profile?.branches?.attendance_geofence_required !== false && (
            <span className="attendance-location-chip"><MapPin size={15} />{t("Branch location required")} · {profile?.branches?.attendance_radius_m || 150} m</span>
          )}
        </div>
        <label className="attendance-note"><span>{t("Optional note")}</span><input value={note} onChange={(event) => setNote(event.target.value)} placeholder={t("Shift or handover note")} /></label>
        <button type="button" className={status?.checked_in ? "danger-button" : "primary-button"} disabled={Boolean(busy)} onClick={() => check(status?.checked_in ? "check-out" : "check-in")}>
          {status?.checked_in ? <LogOut size={18} /> : <LogIn size={18} />}
          {busy ? t("Saving...") : status?.checked_in ? t("Check out") : t("Check in")}
        </button>
      </section>

      <div className="staff-tabs" role="tablist">
        <button type="button" className={tab === "attendance" ? "active" : ""} onClick={() => selectTab("attendance")}><CalendarDays size={18} />{t("Attendance")}</button>
        {canRequestLeave && <button type="button" className={tab === "leave" ? "active" : ""} onClick={() => selectTab("leave")}><Send size={18} />{t("Take Leave")}</button>}
        <button type="button" className={tab === "dayoff" ? "active" : ""} onClick={() => selectTab("dayoff")}><Umbrella size={18} />{t("Day-Off List")}</button>
        {canViewCommission && <button type="button" className={tab === "commission" ? "active" : ""} onClick={() => selectTab("commission")}><BadgeDollarSign size={18} />{t("Commission")}</button>}
        {canManageCommissions && <button type="button" className={tab === "plans" ? "active" : ""} onClick={() => selectTab("plans")}><WalletCards size={18} />{t("Plans & payouts")}</button>}
      </div>

      <section className="panel staff-filter-panel">
        <div className="staff-filters">
          <DateRangePresetFields
            from={filters.date_from}
            to={filters.date_to}
            onChange={(range) =>
              setFilters((current) => ({
                ...current,
                date_from: range.from,
                date_to: range.to
              }))
            }
          />
          {(canManageAttendance || canManageCommissions || canManageLeave) && (
            <label><span>{t("Branch")}</span><select value={filters.branch_id} onChange={(event) => setFilters((current) => ({ ...current, branch_id: event.target.value }))}><option value="">{t("Accessible branches")}</option>{workspace.branches.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
          )}
          {(canManageAttendance || canManageCommissions || canManageLeave) && (
            <label><span>{t("Staff member")}</span><select value={filters.user_id} onChange={(event) => setFilters((current) => ({ ...current, user_id: event.target.value }))}><option value="">{t("All staff")}</option>{workspace.staff.map((row) => <option key={row.id} value={row.id}>{row.full_name}</option>)}</select></label>
          )}
        </div>
        <div className="staff-report-toolbar">
          <span><strong>{t("Selected")}:</strong> {selectionText}</span>
          <div>
            {canManageAttendance && <button type="button" className="primary-button" onClick={() => setManualAttendance(true)}><CalendarPlus size={18} />{t("Set attendance")}</button>}
            {canRequestLeave && <button type="button" className="secondary-button" onClick={() => setLeaveOpen(true)}><Send size={18} />{t("Take Leave")}</button>}
            <button type="button" className="secondary-button" onClick={showDayOffList}><FileSpreadsheet size={18} />{t("Day-Off List")}</button>
            {printableTab && <button type="button" className="secondary-button" onClick={printCurrent}><Printer size={18} />{t("Print")}</button>}
            {printableTab && <button type="button" className="secondary-button" onClick={exportCurrent}><Download size={18} />{t("Export Excel")}</button>}
          </div>
        </div>
      </section>

      {(tab === "attendance" || tab === "dayoff") && (
        <div className="staff-metric-grid attendance-metric-grid">
          <article><span>{t("Present days")}</span><strong>{attendanceTotals.present_days}</strong></article>
          <article><span>{t("On time")}</span><strong>{attendanceTotals.on_time_days}</strong></article>
          <article><span>{t("Late")}</span><strong>{attendanceTotals.late_days}</strong><small>{durationLabel(attendanceTotals.late_minutes, language)}</small></article>
          <article><span>{t("Overtime")}</span><strong>{attendanceTotals.overtime_days}</strong><small>{durationLabel(attendanceTotals.overtime_minutes, language)}</small></article>
          <article><span>{t("Absent")}</span><strong>{attendanceTotals.absent_days}</strong></article>
          <article><span>{t("Day off")}</span><strong>{attendanceTotals.day_off_days}</strong></article>
          <article><span>{t("Approved leave")}</span><strong>{attendanceTotals.leave_days}</strong></article>
          <article><span>{t("Total worked")}</span><strong>{durationLabel(attendanceTotals.work_minutes, language)}</strong></article>
        </div>
      )}

      {tab === "leave" && (
        <div className="staff-metric-grid leave-metric-grid">
          <article><span>{t("Pending")}</span><strong>{leaveTotals.pending}</strong></article>
          <article><span>{t("Approved")}</span><strong>{leaveTotals.approved}</strong></article>
          <article><span>{t("Rejected")}</span><strong>{leaveTotals.rejected}</strong></article>
          <article><span>{t("Cancelled")}</span><strong>{leaveTotals.cancelled}</strong></article>
        </div>
      )}

      {tab === "attendance" && (
        <section className="panel staff-report-panel">
          <div className="panel-title-row">
            <div><p className="eyebrow">{t("DAILY TIMESHEET")}</p><h2>{t("Daily attendance report")}</h2><p className="muted">{t("Defaults to the current date and all accessible staff.")}</p></div>
            <div className="staff-table-tools"><PageSizeControl value={pageSize} onChange={setPageSize} t={t} /><span className="status-pill">{attendanceRows.length} {t("staff-days")}</span></div>
          </div>
          <div className="staff-horizontal-scroll attendance-report-table">
            <table><thead><tr><th>{t("Date")}</th><th>{t("Staff")}</th><th>{t("Branch")}</th><th>{t("Check-in")}</th><th>{t("Check-out")}</th><th>{t("Worked")}</th><th>{t("Late")}</th><th>{t("Overtime")}</th><th>{t("Status")}</th><th>{t("Note")}</th>{canManageAttendance && <th />}</tr></thead><tbody>
              {pagedRows.map((row) => <tr key={`${row.user_id}-${row.business_date}`}><td><strong>{row.business_date}</strong><small>{t(row.weekday_name)}</small></td><td><strong>{row.full_name}</strong><small>{t(row.role)}</small></td><td>{row.branch_name || "—"}</td><td>{staffTime(row.check_in_at, language)}<small>{row.check_in_source || "—"}</small></td><td>{staffTime(row.check_out_at, language)}<small>{row.check_out_source || "—"}</small></td><td>{row.session_id ? durationLabel(row.total_minutes, language) : "—"}</td><td>{Number(row.late_minutes || 0) ? durationLabel(row.late_minutes, language) : "—"}</td><td>{Number(row.overtime_minutes || 0) ? durationLabel(row.overtime_minutes, language) : "—"}</td><td><span className={`status-pill attendance-${row.attendance_status}`}>{attendanceStatusLabel(row.attendance_status, t)}</span></td><td>{row.note || "—"}</td>{canManageAttendance && <td>{row.session_id && <button type="button" className="icon-button" onClick={() => openCorrection(row)} title={t("Correct attendance")}><Pencil size={17} /></button>}</td>}</tr>)}
              {!pagedRows.length && <tr><td colSpan={canManageAttendance ? 11 : 10} className="empty-table">{t("No attendance days in this period.")}</td></tr>}
            </tbody></table>
          </div>
          <Pagination page={page} pageSize={pageSize} total={attendanceRows.length} onPage={setPage} t={t} />
        </section>
      )}

      {tab === "dayoff" && (
        <section className="panel staff-report-panel">
          <div className="panel-title-row">
            <div><p className="eyebrow">{t("MANAGER SCHEDULE")}</p><h2>{t("Day-Off List")}</h2><p className="muted">{t("Manager-set days off and approved leave. Pending Take Leave requests are shown in their own tab.")}</p></div>
            <div className="staff-table-tools"><PageSizeControl value={pageSize} onChange={setPageSize} t={t} /><span className="status-pill">{dayOffRows.length} {t("days")}</span></div>
          </div>
          <div className="staff-horizontal-scroll"><table><thead><tr><th>{t("Date")}</th><th>{t("Day")}</th><th>{t("Staff")}</th><th>{t("Branch")}</th><th>{t("Type")}</th><th>{t("Worked")}</th><th>{t("Note")}</th></tr></thead><tbody>
            {pagedRows.map((row) => <tr key={`${row.user_id}-${row.business_date}`}><td>{row.business_date}</td><td>{t(row.weekday_name)}</td><td><strong>{row.full_name}</strong><small>{t(row.role)}</small></td><td>{row.branch_name || "—"}</td><td><span className={`status-pill attendance-${row.attendance_status}`}>{attendanceStatusLabel(row.attendance_status, t)}</span></td><td>{row.session_id ? durationLabel(row.total_minutes, language) : "—"}</td><td>{row.note || "—"}</td></tr>)}
            {!pagedRows.length && <tr><td colSpan="7" className="empty-table">{t("No day-off or approved leave records in this period.")}</td></tr>}
          </tbody></table></div>
          <Pagination page={page} pageSize={pageSize} total={dayOffRows.length} onPage={setPage} t={t} />
        </section>
      )}

      {tab === "leave" && (
        <section className="panel staff-report-panel">
          <div className="panel-title-row">
            <div><p className="eyebrow">{t("STAFF REQUESTS")}</p><h2>{t("Take Leave")}</h2><p className="muted">{t("Staff requests remain pending until a manager approves or rejects them.")}</p></div>
            <div className="staff-table-tools"><PageSizeControl value={pageSize} onChange={setPageSize} t={t} /><span className="status-pill">{workspace.leaveRequests.length} {t("requests")}</span></div>
          </div>
          <div className="staff-horizontal-scroll take-leave-table"><table><thead><tr><th>{t("Requested")}</th><th>{t("Staff")}</th><th>{t("Branch")}</th><th>{t("Dates")}</th><th>{t("Type")}</th><th>{t("Reason")}</th><th>{t("Picture")}</th><th>{t("Status")}</th><th>{t("Reviewed by")}</th><th>{t("Review note")}</th><th>{t("Actions")}</th></tr></thead><tbody>
            {pagedRows.map((row) => {
              const own = row.user_id === profile.id;
              return <tr key={row.id}><td>{staffDateTime(row.created_at, language)}</td><td><strong>{row.profiles?.full_name}</strong><small>{t(row.profiles?.role || "")}</small></td><td>{row.branches?.name || "—"}</td><td><strong>{row.date_from}</strong><small>{t("to")} {row.date_to}</small></td><td>{t(String(row.leave_type || "").replaceAll("_", " "))}</td><td className="leave-reason-cell">{row.reason}</td><td>{row.image_url ? <button type="button" className="leave-image-link" onClick={() => setPreviewMedia({ src: row.image_url, title: `${row.profiles?.full_name || t("Staff")} · ${t("Leave attachment")}`, downloadName: `leave-${row.id}` })}><MediaImage src={row.image_url} alt={t("Leave attachment")} width={90} height={70} /><span><ImageIcon size={16} />{t("View")}</span></button> : "—"}</td><td><span className={`status-pill leave-${row.status}`}>{leaveStatusLabel(row.status, t)}</span></td><td>{row.reviewer?.full_name || "—"}</td><td>{row.review_note || "—"}</td><td><div className="leave-row-actions">{canManageLeave && row.status === "pending" && <><button type="button" className="success-icon-button" disabled={busy === `leave-${row.id}`} onClick={() => reviewLeave(row, "approved")} title={t("Approve")}><Check size={17} /></button><button type="button" className="danger-icon-button" disabled={busy === `leave-${row.id}`} onClick={() => reviewLeave(row, "rejected")} title={t("Reject")}><X size={17} /></button></>}{own && row.status === "pending" && <button type="button" className="secondary-button compact-button" disabled={busy === `leave-${row.id}`} onClick={() => cancelLeave(row)}>{t("Cancel")}</button>}</div></td></tr>;
            })}
            {!pagedRows.length && <tr><td colSpan="11" className="empty-table">{t("No leave requests in this period.")}</td></tr>}
          </tbody></table></div>
          <Pagination page={page} pageSize={pageSize} total={workspace.leaveRequests.length} onPage={setPage} t={t} />
        </section>
      )}

      {tab === "commission" && canViewCommission && (
        <>
          <div className="staff-metric-grid"><article><span>{t("Earned USD")}</span><strong>{commissionMoney(totals.earned.USD, "USD")}</strong></article><article><span>{t("Paid USD")}</span><strong>{commissionMoney(totals.paid.USD, "USD")}</strong></article><article><span>{t("Outstanding USD")}</span><strong>{commissionMoney(totals.outstanding.USD, "USD")}</strong></article><article><span>{t("Outstanding KHR")}</span><strong>{commissionMoney(totals.outstanding.KHR, "KHR")}</strong></article></div>
          <section className="panel staff-report-panel"><div className="panel-title-row"><div><p className="eyebrow">{t("EARNINGS")}</p><h2>{t("Sales commission ledger")}</h2></div><div className="staff-table-tools"><PageSizeControl value={pageSize} onChange={setPageSize} t={t} /><span className="status-pill">{workspace.commissions.length} {t("sales")}</span></div></div><div className="staff-horizontal-scroll"><table><thead><tr><th>{t("Date")}</th><th>{t("Staff")}</th><th>{t("Invoice")}</th><th>{t("Branch")}</th><th>{t("Base")}</th><th>{t("Rate")}</th><th>{t("Refund")}</th><th>{t("Commission")}</th><th>{t("Status")}</th></tr></thead><tbody>{pagedRows.map((row) => <tr key={row.id}><td>{staffDateTime(row.sale_completed_at, language)}</td><td>{row.profiles?.full_name}</td><td>{row.sales?.invoice_number}</td><td>{row.branches?.name}</td><td>{commissionMoney(row.commissionable_amount, row.currency)}<small>{t(row.base_type.replaceAll("_", " "))}</small></td><td>{Number(row.rate_percent || 0).toFixed(2)}%<small>+ {commissionMoney(row.fixed_per_sale, row.currency)}</small></td><td>{commissionMoney(row.refunded_amount, row.currency)}</td><td><strong>{commissionMoney(row.commission_amount, row.currency)}</strong></td><td><span className={`status-pill ${row.status}`}>{t(row.status)}</span></td></tr>)}{!pagedRows.length && <tr><td colSpan="9" className="empty-table">{t("No commission records in this period.")}</td></tr>}</tbody></table></div><Pagination page={page} pageSize={pageSize} total={workspace.commissions.length} onPage={setPage} t={t} /></section>
        </>
      )}

      {tab === "plans" && canManageCommissions && (
        <div className="staff-plan-grid staff-plan-grid-responsive">
          <ResponsiveDataList
            storageKey="tiny-pos-commission-plans"
            title={t("Commission plans")}
            subtitle={t("Commission rules for staff and branches.")}
            rows={workspace.plans}
            filename="tiny-pos-commission-plans.xls"
            printTitle={t("Commission Plans")}
            emptyTitle={t("No commission plans yet")}
            emptyText={t("Create the first commission plan to start calculating staff commission.")}
            headingExtra={<button type="button" className="primary-button" onClick={() => setPlan(null)}><Plus size={18} />{t("New plan")}</button>}
            columns={[
              { label: t("Plan"), width: 180, value: (row) => row.name || "—", render: (row) => <><strong>{row.name || "—"}</strong><small>{t(row.base_type?.replaceAll("_", " ") || "") || "—"}</small></> },
              { label: t("Staff"), width: 160, value: (row) => row.profiles?.full_name || t("All staff") },
              { label: t("Branch"), width: 160, value: (row) => row.branches?.name || t("All branches") },
              { label: t("Currency"), width: 90, value: (row) => row.currency || "USD" },
              { label: t("Rate"), width: 95, value: (row) => `${Number(row.rate_percent || 0).toFixed(2)}%` },
              { label: t("Fixed / sale"), width: 120, value: (row) => commissionMoney(row.fixed_per_sale, row.currency) },
              { label: t("Status"), width: 100, value: (row) => row.is_active ? t("Active") : t("Inactive"), render: (row) => <span className={`status-pill ${row.is_active ? "active" : "inactive"}`}>{row.is_active ? t("Active") : t("Inactive")}</span> },
              { label: t("Actions"), actionsOnly: true, excludeDocument: true, render: (row) => <button type="button" className="secondary-button compact-button" onClick={() => setPlan(row)}><Pencil size={16} />{t("Edit")}</button> }
            ]}
            renderCard={(row) => (
              <article className="responsive-data-card commission-plan-card">
                <header><div><strong>{row.name || "—"}</strong><small>{row.profiles?.full_name || t("All staff")} · {row.branches?.name || t("All branches")}</small></div><span className={`status-pill ${row.is_active ? "active" : "inactive"}`}>{row.is_active ? t("Active") : t("Inactive")}</span></header>
                <div><span>{t("Base")}</span><strong>{t(row.base_type?.replaceAll("_", " ") || "") || "—"}</strong></div>
                <div><span>{t("Rate")}</span><strong>{Number(row.rate_percent || 0).toFixed(2)}%</strong></div>
                <div><span>{t("Fixed / sale")}</span><strong>{commissionMoney(row.fixed_per_sale, row.currency)}</strong></div>
                <div><span>{t("Currency")}</span><strong>{row.currency || "USD"}</strong></div>
                <footer><button type="button" className="secondary-button compact-button" onClick={() => setPlan(row)}><Pencil size={16} />{t("Edit plan")}</button></footer>
              </article>
            )}
          />

          <ResponsiveDataList
            storageKey="tiny-pos-commission-payouts"
            title={t("Payment history")}
            subtitle={t("Commission payouts recorded for the selected period.")}
            rows={workspace.payouts}
            filename="tiny-pos-commission-payouts.xls"
            printTitle={t("Commission Payouts")}
            emptyTitle={t("No commission payouts in this period")}
            emptyText={t("Change the date or staff filter, or record a new payout.")}
            headingExtra={canPayCommissions ? <button type="button" className="primary-button" onClick={() => setPayout(true)}><Plus size={18} />{t("Record payout")}</button> : null}
            columns={[
              { label: t("Paid at"), width: 170, value: (row) => staffDateTime(row.paid_at, language) },
              { label: t("Staff"), width: 160, value: (row) => row.profiles?.full_name || "—" },
              { label: t("Branch"), width: 160, value: (row) => row.branches?.name || "—" },
              { label: t("Period"), width: 190, value: (row) => `${row.period_start || "—"} → ${row.period_end || "—"}` },
              { label: t("Method"), width: 130, value: (row) => t(row.payment_method || ""), render: (row) => <>{t(row.payment_method || "")}<small>{row.reference_number || "—"}</small></> },
              { label: t("Amount"), width: 120, value: (row) => commissionMoney(row.amount, row.currency), render: (row) => <strong>{commissionMoney(row.amount, row.currency)}</strong> }
            ]}
            renderCard={(row) => (
              <article className="responsive-data-card commission-payout-card">
                <header><div><strong>{row.profiles?.full_name || "—"}</strong><small>{staffDateTime(row.paid_at, language)}</small></div><strong>{commissionMoney(row.amount, row.currency)}</strong></header>
                <div><span>{t("Branch")}</span><strong>{row.branches?.name || "—"}</strong></div>
                <div><span>{t("Period")}</span><strong>{row.period_start || "—"} → {row.period_end || "—"}</strong></div>
                <div><span>{t("Method")}</span><strong>{t(row.payment_method || "")}</strong><small>{row.reference_number || "—"}</small></div>
              </article>
            )}
          />
        </div>
      )}

      {correction && <AttendanceCorrectionModal session={correction} busy={busy === "correction"} onClose={() => setCorrection(null)} onSave={saveCorrection} />}
      <ManualAttendanceModal open={manualAttendance} staff={workspace.staff} branches={workspace.branches} busy={busy === "manual-attendance"} onClose={() => setManualAttendance(false)} onSave={saveManual} />
      <LeaveRequestModal open={leaveOpen} busy={busy === "leave"} onClose={() => setLeaveOpen(false)} onSave={saveLeave} />
      <MediaPreviewModal
        open={Boolean(previewMedia)}
        src={previewMedia?.src}
        title={previewMedia?.title || t("Leave attachment")}
        downloadName={previewMedia?.downloadName || "leave-attachment"}
        onClose={() => setPreviewMedia(null)}
      />
      {plan !== undefined && <CommissionPlanModal plan={plan} staff={workspace.staff} branches={workspace.branches} busy={busy === "plan"} onClose={() => setPlan(undefined)} onSave={savePlan} />}
      {payout && <CommissionPayoutModal staff={workspace.staff} branches={workspace.branches} busy={busy === "payout"} onClose={() => setPayout(false)} onSave={savePayout} />}
    </div>
  );
}
