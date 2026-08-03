import { exportCsv } from "./reports";

export async function loadEndOfDay(supabase, filters) {
  const { data, error } = await supabase.rpc("get_end_of_day_report", {
    p_from: filters.from,
    p_to: filters.to,
    p_branch_id: filters.allBranches ? null : filters.branchId || null,
    p_cashier_id: filters.cashierId || null,
    p_register_name: filters.registerName?.trim() || null
  });
  if (error) throw error;
  return data || {};
}

export function exportEndOfDayCsv(report, filename) {
  const rows = [];

  for (const row of report.summary_by_currency || []) {
    for (const [metric, value] of Object.entries(row)) {
      if (["currency", "invoice_count"].includes(metric)) continue;
      rows.push({ section: "Currency summary", group: row.currency, name: metric.replaceAll("_", " "), method: "", currency: row.currency, count: metric === "invoice_count" ? row.invoice_count : "", amount: value, note: "" });
    }
    rows.push({ section: "Currency summary", group: row.currency, name: "invoice count", method: "", currency: row.currency, count: row.invoice_count, amount: "", note: "" });
  }

  for (const row of report.payments || []) rows.push({ section: "Sales collection", group: "", name: "Sales payment", method: row.method, currency: row.currency, count: row.transaction_count, amount: row.amount, note: "" });
  for (const row of report.cash_activity || []) rows.push({ section: "Cash activity", group: row.direction, name: row.category_name, method: row.method, currency: row.currency, count: row.transaction_count, amount: row.amount, note: row.affects_profit ? "Affects profit" : "Does not affect profit" });
  for (const row of report.supplier_payments || []) rows.push({ section: "Supplier payment", group: "", name: "Purchase payment", method: row.method, currency: row.currency, count: row.transaction_count, amount: row.amount, note: "" });
  for (const row of report.cashiers || []) rows.push({ section: "User", group: row.cashier_name, name: "Net sales", method: `Cash ${row.cash_sales}; Non-cash ${row.non_cash_sales}`, currency: row.currency, count: row.invoice_count, amount: row.net_sales, note: `Gross ${row.gross_sales}; Refunds ${row.refunds}` });
  for (const row of report.registers || []) {
    rows.push({ section: "Register", group: row.register_name, name: row.session_number, method: row.status, currency: "USD", count: "", amount: row.expected_cash_usd, note: `Counted ${row.counted_cash_usd ?? ""}; variance ${row.variance_usd ?? ""}` });
    rows.push({ section: "Register", group: row.register_name, name: row.session_number, method: row.status, currency: "KHR", count: "", amount: row.expected_cash_khr, note: `Counted ${row.counted_cash_khr ?? ""}; variance ${row.variance_khr ?? ""}` });
  }
  for (const row of report.sales || []) rows.push({ section: "Sale detail", group: row.cashier_name, name: row.invoice_number, method: row.payment_methods, currency: row.currency, count: 1, amount: row.net_total, note: `${row.completed_at} | ${row.customer_name} | ${row.register_names} | gross ${row.gross_total} | refund ${row.refund_total}` });

  exportCsv(filename, [
    { label: "Section", value: "section" },
    { label: "Group / User", value: "group" },
    { label: "Metric / Document", value: "name" },
    { label: "Method / Status", value: "method" },
    { label: "Currency", value: "currency" },
    { label: "Count", value: "count" },
    { label: "Amount", value: "amount" },
    { label: "Note", value: "note" }
  ], rows);
}
