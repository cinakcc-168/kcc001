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

  const [statusResult, attendanceResult, commissionResult, payoutResult, planResult, staffResult, branchResult] = await Promise.all([
    getMyAttendanceStatus(supabase),
    attendanceQuery,
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

  for (const result of [attendanceResult, commissionResult, payoutResult, planResult, staffResult, branchResult]) {
    if (result.error) throw result.error;
  }

  return {
    status: statusResult,
    attendance: attendanceResult.data || [],
    commissions: commissionResult.data || [],
    payouts: payoutResult.data || [],
    plans: planResult.data || [],
    staff: staffResult.data || [],
    branches: branchResult.data || []
  };
}
