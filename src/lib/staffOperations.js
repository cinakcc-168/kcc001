export function isoDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().slice(0, 10);
}

export function monthRange(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
  return { start: isoDate(start), end: isoDate(end) };
}

export function staffDateTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function staffTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function durationLabel(minutes) {
  const total = Math.max(0, Number(minutes || 0));
  const hours = Math.floor(total / 60);
  const remainder = Math.round(total % 60);
  if (!hours) return `${remainder} min`;
  return `${hours} hr ${remainder} min`;
}

export function commissionMoney(value, currency) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "KHR" ? 0 : 2
  }).format(Number(value || 0));
}

export function attendanceStatusLabel(value) {
  const labels = {
    on_time: "On time",
    late: "Late",
    overtime: "Overtime",
    late_overtime: "Late + overtime",
    open: "Checked in",
    absent: "Absent",
    day_off: "Day off",
    worked_day_off: "Worked on day off",
    leave: "Leave",
    scheduled: "Scheduled"
  };
  return labels[value] || String(value || "—").replaceAll("_", " ");
}

export async function getMyAttendanceStatus(supabase) {
  const { data, error } = await supabase.rpc("get_my_attendance_status");
  if (error) throw error;
  return data;
}

export async function attendanceCheckIn(supabase, branchId, note = "", location = {}) {
  const { data, error } = await supabase.rpc("attendance_check_in_v2", {
    p_branch_id: branchId || null,
    p_note: note || null,
    p_latitude: location.latitude ?? null,
    p_longitude: location.longitude ?? null,
    p_accuracy_m: location.accuracy ?? null
  });
  if (error) throw error;
  return data;
}

export async function attendanceCheckOut(supabase, note = "", location = {}) {
  const { data, error } = await supabase.rpc("attendance_check_out_v2", {
    p_note: note || null,
    p_latitude: location.latitude ?? null,
    p_longitude: location.longitude ?? null,
    p_accuracy_m: location.accuracy ?? null
  });
  if (error) throw error;
  return data;
}

export async function correctAttendance(supabase, values) {
  const { data, error } = await supabase.rpc("correct_attendance_session", {
    p_session_id: values.id,
    p_check_in_at: values.check_in_at,
    p_check_out_at: values.check_out_at || null,
    p_correction_note: values.correction_note
  });
  if (error) throw error;
  return data;
}

export async function saveManualAttendance(supabase, values) {
  const { data, error } = await supabase.rpc("save_manual_attendance_days", {
    p_user_id: values.user_id,
    p_branch_id: values.branch_id,
    p_month: values.month,
    p_days: values.days.map(Number),
    p_day_type: values.day_type,
    p_check_in_time: values.day_type === "work" ? values.check_in_time : null,
    p_check_out_time: values.day_type === "work" ? values.check_out_time : null,
    p_note: String(values.note || "").trim() || null
  });
  if (error) throw error;
  return data;
}

export async function saveCommissionPlan(supabase, values) {
  const { data, error } = await supabase.rpc("save_commission_plan", {
    p_plan_id: values.id || null,
    p_user_id: values.user_id,
    p_branch_id: values.branch_id || null,
    p_name: values.name,
    p_currency: values.currency,
    p_base_type: values.base_type,
    p_rate_percent: Number(values.rate_percent || 0),
    p_fixed_per_sale: Number(values.fixed_per_sale || 0),
    p_effective_from: values.effective_from,
    p_effective_to: values.effective_to || null,
    p_is_active: Boolean(values.is_active),
    p_notes: values.notes || null
  });
  if (error) throw error;
  return data;
}

export async function recordCommissionPayout(supabase, values) {
  const { data, error } = await supabase.rpc("record_commission_payout", {
    p_user_id: values.user_id,
    p_branch_id: values.branch_id,
    p_currency: values.currency,
    p_period_start: values.period_start,
    p_period_end: values.period_end,
    p_amount: Number(values.amount || 0),
    p_payment_method: values.payment_method,
    p_reference_number: values.reference_number || null,
    p_notes: values.notes || null
  });
  if (error) throw error;
  return data;
}

function csvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function downloadStaffCsv(filename, columns, rows, summary = []) {
  const lines = [];
  for (const item of summary) {
    lines.push([csvCell(item.label), csvCell(item.value)].join(","));
  }
  if (summary.length) lines.push("");
  lines.push(columns.map((column) => csvCell(column.label)).join(","));
  for (const row of rows) {
    lines.push(columns.map((column) => csvCell(
      typeof column.value === "function" ? column.value(row) : row[column.value]
    )).join(","));
  }
  const blob = new Blob(["\ufeff", lines.join("\r\n")], {
    type: "text/csv;charset=utf-8"
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function printStaffReport({ title, subtitle = "", summary = [], columns, rows }) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "1px";
  frame.style.height = "1px";
  frame.style.opacity = "0";
  frame.style.pointerEvents = "none";
  document.body.appendChild(frame);

  const summaryHtml = summary.length
    ? `<section class="summary">${summary.map((item) => `<div><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong></div>`).join("")}</section>`
    : "";
  const head = columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("");
  const body = rows.length
    ? rows.map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(typeof column.value === "function" ? column.value(row) : row[column.value])}</td>`).join("")}</tr>`).join("")
    : `<tr><td colspan="${columns.length}">No records in the selected period.</td></tr>`;
  const documentHtml = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
    @page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{font-family:Arial,"Noto Sans Khmer",sans-serif;color:#162033;margin:0;font-size:11px}h1{font-size:22px;margin:0 0 4px}p{margin:0 0 14px;color:#5e6b80}.summary{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:6px;margin:12px 0}.summary div{border:1px solid #cad3df;border-radius:6px;padding:7px}.summary span{display:block;color:#667085;font-size:9px}.summary strong{display:block;margin-top:3px;font-size:12px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #aeb9c8;padding:6px 7px;text-align:left;vertical-align:top}th{background:#edf3f8;font-weight:700}tbody tr:nth-child(even){background:#f8fafc}.footer{margin-top:10px;color:#667085;font-size:9px}@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
  </style></head><body><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p>${summaryHtml}<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table><div class="footer">Printed ${escapeHtml(new Date().toLocaleString())}</div></body></html>`;

  const printWindow = frame.contentWindow;
  const printDocument = frame.contentDocument || printWindow?.document;
  if (!printWindow || !printDocument) {
    frame.remove();
    throw new Error("This browser could not open the print document.");
  }
  printDocument.open();
  printDocument.write(documentHtml);
  printDocument.close();
  window.setTimeout(() => {
    printWindow.focus();
    printWindow.print();
    window.setTimeout(() => frame.remove(), 1200);
  }, 250);
}

export async function loadStaffOperations(supabase, profile, access, filters) {
  const canManageAttendance = Boolean(access?.permissions?.["*"] || access?.permissions?.["attendance.manage"]);
  const canManageCommissions = Boolean(access?.permissions?.["*"] || access?.permissions?.["commissions.manage"]);
  const userId = canManageAttendance || canManageCommissions
    ? filters.user_id || null
    : profile.id;
  const branchId = filters.branch_id || null;

  let attendanceQuery = supabase
    .from("attendance_sessions")
    .select(`
      *,
      profiles!attendance_sessions_user_id_fkey(id,full_name,role),
      branches(id,name,code)
    `)
    .gte("business_date", filters.date_from)
    .lte("business_date", filters.date_to)
    .order("check_in_at", { ascending: false })
    .limit(500);
  if (userId) attendanceQuery = attendanceQuery.eq("user_id", userId);
  if (branchId) attendanceQuery = attendanceQuery.eq("branch_id", branchId);

  let commissionQuery = supabase
    .from("sales_commissions")
    .select(`
      *,
      profiles!sales_commissions_cashier_id_fkey(id,full_name,role),
      branches(id,name,code),
      sales(invoice_number,total_amount,status)
    `)
    .gte("sale_completed_at", `${filters.date_from}T00:00:00`)
    .lte("sale_completed_at", `${filters.date_to}T23:59:59.999`)
    .order("sale_completed_at", { ascending: false })
    .limit(1000);
  if (userId) commissionQuery = commissionQuery.eq("cashier_id", userId);
  if (branchId) commissionQuery = commissionQuery.eq("branch_id", branchId);

  let payoutQuery = supabase
    .from("commission_payouts")
    .select(`
      *,
      profiles!commission_payouts_user_id_fkey(id,full_name,role),
      branches(id,name,code)
    `)
    .gte("period_start", filters.date_from)
    .lte("period_end", filters.date_to)
    .order("paid_at", { ascending: false })
    .limit(500);
  if (userId) payoutQuery = payoutQuery.eq("user_id", userId);
  if (branchId) payoutQuery = payoutQuery.eq("branch_id", branchId);

  const attendanceReportRequest = supabase.rpc("get_attendance_report", {
    p_date_from: filters.date_from,
    p_date_to: filters.date_to,
    p_branch_id: canManageAttendance ? branchId : null,
    p_user_id: userId
  });

  const [
    statusResult,
    attendanceResult,
    attendanceReportResult,
    commissionResult,
    payoutResult,
    planResult,
    staffResult,
    branchResult
  ] = await Promise.all([
    getMyAttendanceStatus(supabase),
    attendanceQuery,
    attendanceReportRequest,
    commissionQuery,
    payoutQuery,
    canManageCommissions
      ? supabase.from("commission_plans").select(`*,profiles!commission_plans_user_id_fkey(id,full_name,role),branches(id,name,code)`).order("created_at", { ascending: false })
      : supabase.from("commission_plans").select(`*,branches(id,name,code)`).eq("user_id", profile.id).order("created_at", { ascending: false }),
    (canManageAttendance || canManageCommissions)
      ? supabase.from("profiles").select("id,full_name,role,branch_id,is_active").eq("organization_id", profile.organization_id).eq("is_active", true).order("full_name")
      : Promise.resolve({ data: [profile], error: null }),
    supabase.from("branches").select("id,name,code,is_active,latitude,longitude,attendance_radius_m,attendance_geofence_required").eq("organization_id", profile.organization_id).eq("is_active", true).order("name")
  ]);

  for (const result of [
    attendanceResult,
    attendanceReportResult,
    commissionResult,
    payoutResult,
    planResult,
    staffResult,
    branchResult
  ]) {
    if (result.error) throw result.error;
  }

  return {
    status: statusResult,
    attendance: attendanceResult.data || [],
    attendanceReport: attendanceReportResult.data || { rows: [], summary: [], settings: {} },
    commissions: commissionResult.data || [],
    payouts: payoutResult.data || [],
    plans: planResult.data || [],
    staff: staffResult.data || [],
    branches: branchResult.data || []
  };
}
