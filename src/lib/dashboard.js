export async function loadDashboardActionCenter(
  supabase,
  allBranches = false
) {
  const { data, error } = await supabase.rpc(
    "get_dashboard_action_center",
    {
      p_all_branches: Boolean(allBranches)
    }
  );

  if (error) throw error;
  return data;
}

export function dashboardDateTime(value) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function dashboardDay(value) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-US", {
    weekday: "short"
  }).format(new Date(`${value}T00:00:00`));
}

export function dashboardPercent(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "No previous-month comparison";
  }

  const sign = number > 0 ? "+" : "";

  return `${sign}${number.toLocaleString("en-US", {
    maximumFractionDigits: 1
  })}% vs previous month`;
}

export function paymentMethodLabel(method) {
  const labels = {
    cash: "Cash",
    bank: "Bank",
    khqr: "KHQR",
    card: "Card",
    other: "Other"
  };

  return labels[method] || String(method || "Other");
}
