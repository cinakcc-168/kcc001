import { exportCsv } from "./reports";

export async function loadEndOfDay(supabase, filters) {
  const { data, error } = await supabase.rpc("get_end_of_day_report", {
    p_from: filters.from,
    p_to: filters.to,
    p_branch_id: filters.allBranches ? null : filters.branchId || null,
    p_cashier_id: filters.cashierId || null,
    p_register_name: filters.registerName || null
  });
  if (error) throw error;
  return data || {};
}

export function exportEndOfDayCsv(report, filename) {
  const rows = [
    ...(report.cashiers || []).map((row) => ({ section: "Cashier", name: row.cashier_name, count: row.invoice_count, gross: row.gross_sales, refunds: row.refunds, net: row.net_sales })),
    ...(report.registers || []).map((row) => ({ section: "Register", name: `${row.register_name} / ${row.opened_by_name || "—"}`, count: row.session_number, gross: row.expected_cash_usd, refunds: row.variance_usd, net: row.status }))
  ];
  exportCsv(filename, [
    { label: "Section", value: "section" }, { label: "Name / Counter", value: "name" }, { label: "Count / Session", value: "count" },
    { label: "Gross / Expected USD", value: "gross" }, { label: "Refunds / Variance USD", value: "refunds" }, { label: "Net / Status", value: "net" }
  ], rows);
}
