import { money } from "../lib/catalog";

export default function EndOfDayReport({ report }) {
  const summary = report?.summary || {};
  return <div className="report-section-stack end-of-day-report">
    <div className="report-metric-grid">
      <article className="panel"><span>Invoices</span><strong>{Number(summary.invoice_count || 0).toLocaleString()}</strong></article>
      <article className="panel"><span>Gross sales</span><strong>{money(summary.gross_sales || 0, "USD")}</strong></article>
      <article className="panel"><span>Refunds</span><strong>{money(summary.refunds || 0, "USD")}</strong></article>
      <article className="panel"><span>Net sales</span><strong>{money(summary.net_sales || 0, "USD")}</strong></article>
    </div>
    <section className="panel report-panel"><div className="report-panel-heading"><div><h2>Payment breakdown</h2><p>Collections by method and currency</p></div></div><div className="report-table-wrap"><table className="report-table"><thead><tr><th>Method</th><th>Currency</th><th>Transactions</th><th>Amount</th></tr></thead><tbody>{(report?.payments || []).map((row, i)=><tr key={`${row.method}-${row.currency}-${i}`}><td>{row.method}</td><td>{row.currency}</td><td>{row.transaction_count}</td><td>{money(row.amount,row.currency)}</td></tr>)}</tbody></table></div></section>
    <section className="panel report-panel"><div className="report-panel-heading"><div><h2>User / cashier breakdown</h2><p>Sales ownership for the selected period</p></div></div><div className="report-table-wrap"><table className="report-table"><thead><tr><th>User</th><th>Invoices</th><th>Gross</th><th>Refunds</th><th>Net</th></tr></thead><tbody>{(report?.cashiers || []).map((row)=><tr key={row.cashier_id || row.cashier_name}><td>{row.cashier_name || "POS Staff"}</td><td>{row.invoice_count}</td><td>{money(row.gross_sales,"USD")}</td><td>{money(row.refunds,"USD")}</td><td>{money(row.net_sales,"USD")}</td></tr>)}</tbody></table></div></section>
    <section className="panel report-panel"><div className="report-panel-heading"><div><h2>Counter / register reconciliation</h2><p>Opening, expected, counted and variance</p></div></div><div className="report-table-wrap"><table className="report-table wide"><thead><tr><th>Counter</th><th>Session</th><th>User</th><th>Status</th><th>Expected USD</th><th>Counted USD</th><th>Variance USD</th><th>Expected KHR</th><th>Counted KHR</th><th>Variance KHR</th></tr></thead><tbody>{(report?.registers || []).map((row)=><tr key={row.id}><td>{row.register_name}</td><td>{row.session_number}</td><td>{row.opened_by_name || "—"}</td><td>{row.status}</td><td>{money(row.expected_cash_usd || 0,"USD")}</td><td>{money(row.counted_cash_usd || 0,"USD")}</td><td>{money(row.variance_usd || 0,"USD")}</td><td>{money(row.expected_cash_khr || 0,"KHR")}</td><td>{money(row.counted_cash_khr || 0,"KHR")}</td><td>{money(row.variance_khr || 0,"KHR")}</td></tr>)}</tbody></table></div></section>
  </div>;
}
