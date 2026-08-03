import { money } from "../lib/catalog";
import { formatReportDate } from "../lib/reports";

function count(value) {
  return Number(value || 0).toLocaleString();
}

function amount(value, currency) {
  return money(Number(value || 0), currency || "USD");
}

function emptyRow(colSpan, label = "No activity for this selection.") {
  return <tr><td colSpan={colSpan} className="muted">{label}</td></tr>;
}

export default function EndOfDayReport({ report }) {
  const summaries = report?.summary_by_currency || [];
  const payments = report?.payments || [];
  const cashActivity = report?.cash_activity || [];
  const supplierPayments = report?.supplier_payments || [];
  const cashiers = report?.cashiers || [];
  const registers = report?.registers || [];
  const sales = report?.sales || [];

  return (
    <div className="report-section-stack end-of-day-report">
      <section className="panel end-of-day-print-header">
        <p className="eyebrow">END OF DAY / SHIFT REPORT</p>
        <h2>{report?.organization_name || "Tiny POS"}</h2>
        <div className="end-of-day-scope-grid">
          <span><small>Period</small><strong>{report?.from} – {report?.to}</strong></span>
          <span><small>Branch</small><strong>{report?.branch_name || "Current branch"}</strong></span>
          <span><small>User / cashier</small><strong>{report?.cashier_name || "All users"}</strong></span>
          <span><small>Counter</small><strong>{report?.register_name || "All counters"}</strong></span>
        </div>
      </section>

      <div className="end-of-day-currency-grid">
        {summaries.map((row) => (
          <section className="panel report-panel end-of-day-currency-card" key={row.currency}>
            <div className="report-panel-heading">
              <div><h2>{row.currency} summary</h2><p>Sales, money received, expenses and drawer movement</p></div>
              <strong>{count(row.invoice_count)} invoices</strong>
            </div>
            <div className="report-table-wrap">
              <table className="report-table end-of-day-summary-table">
                <tbody>
                  <tr><th>Gross sales</th><td>{amount(row.gross_sales, row.currency)}</td></tr>
                  <tr><th>Refunds</th><td>-{amount(row.refunds, row.currency)}</td></tr>
                  <tr className="summary-strong"><th>Net sales</th><td>{amount(row.net_sales, row.currency)}</td></tr>
                  <tr><th>Cash sales</th><td>{amount(row.cash_sales, row.currency)}</td></tr>
                  <tr><th>Bank / QR / card sales</th><td>{amount(row.bank_sales, row.currency)}</td></tr>
                  <tr><th>Credit sales</th><td>{amount(row.credit_sales, row.currency)}</td></tr>
                  <tr><th>Other cash income</th><td>{amount(row.cash_income, row.currency)}</td></tr>
                  <tr><th>Cash expenses</th><td>-{amount(row.cash_expenses, row.currency)}</td></tr>
                  <tr><th>Cash supplier payments</th><td>-{amount(row.supplier_cash_payments, row.currency)}</td></tr>
                  <tr className="summary-strong"><th>Expected cash movement</th><td>{amount(row.expected_cash_movement, row.currency)}</td></tr>
                  <tr><th>Net bank movement</th><td>{amount(row.net_bank_movement, row.currency)}</td></tr>
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>

      <section className="panel report-panel">
        <div className="report-panel-heading"><div><h2>Sales collections</h2><p>Payment-method totals in their original currencies</p></div></div>
        <div className="report-table-wrap"><table className="report-table"><thead><tr><th>Method</th><th>Currency</th><th>Transactions</th><th>Amount</th></tr></thead><tbody>
          {payments.length ? payments.map((row, index) => <tr key={`${row.method}-${row.currency}-${index}`}><td>{String(row.method || "other").toUpperCase()}</td><td>{row.currency}</td><td>{count(row.transaction_count)}</td><td>{amount(row.amount, row.currency)}</td></tr>) : emptyRow(4)}
        </tbody></table></div>
      </section>

      <section className="panel report-panel">
        <div className="report-panel-heading"><div><h2>Cash & expense activity</h2><p>Income and expense entries, including entries that do not affect profit</p></div></div>
        <div className="report-table-wrap"><table className="report-table wide"><thead><tr><th>Type</th><th>Category</th><th>Method</th><th>Currency</th><th>Entries</th><th>Amount</th><th>Affects profit</th></tr></thead><tbody>
          {cashActivity.length ? cashActivity.map((row, index) => <tr key={`${row.direction}-${row.category_name}-${row.method}-${row.currency}-${index}`}><td>{row.direction}</td><td>{row.category_name}</td><td>{String(row.method).toUpperCase()}</td><td>{row.currency}</td><td>{count(row.transaction_count)}</td><td>{amount(row.amount, row.currency)}</td><td>{row.affects_profit ? "Yes" : "No"}</td></tr>) : emptyRow(7)}
        </tbody></table></div>
      </section>

      <section className="panel report-panel">
        <div className="report-panel-heading"><div><h2>Supplier payments</h2><p>Purchase payments made during the selected period</p></div></div>
        <div className="report-table-wrap"><table className="report-table"><thead><tr><th>Method</th><th>Currency</th><th>Transactions</th><th>Amount</th></tr></thead><tbody>
          {supplierPayments.length ? supplierPayments.map((row, index) => <tr key={`${row.method}-${row.currency}-${index}`}><td>{String(row.method).toUpperCase()}</td><td>{row.currency}</td><td>{count(row.transaction_count)}</td><td>{amount(row.amount, row.currency)}</td></tr>) : emptyRow(4)}
        </tbody></table></div>
      </section>

      <section className="panel report-panel">
        <div className="report-panel-heading"><div><h2>User / cashier performance</h2><p>Use the report filter to show all users or one selected seller</p></div></div>
        <div className="report-table-wrap"><table className="report-table wide"><thead><tr><th>User</th><th>Currency</th><th>Invoices</th><th>Gross</th><th>Refunds</th><th>Net</th><th>Cash</th><th>Non-cash</th></tr></thead><tbody>
          {cashiers.length ? cashiers.map((row, index) => <tr key={`${row.cashier_id || row.cashier_name}-${row.currency}-${index}`}><td>{row.cashier_name || "POS Staff"}</td><td>{row.currency}</td><td>{count(row.invoice_count)}</td><td>{amount(row.gross_sales, row.currency)}</td><td>{amount(row.refunds, row.currency)}</td><td><strong>{amount(row.net_sales, row.currency)}</strong></td><td>{amount(row.cash_sales, row.currency)}</td><td>{amount(row.non_cash_sales, row.currency)}</td></tr>) : emptyRow(8)}
        </tbody></table></div>
      </section>

      <section className="panel report-panel">
        <div className="report-panel-heading"><div><h2>Counter / register reconciliation</h2><p>Opening, expected, counted and variance for each drawer</p></div></div>
        <div className="report-table-wrap"><table className="report-table wide"><thead><tr><th>Counter</th><th>Session</th><th>User</th><th>Status</th><th>Opened</th><th>Expected USD</th><th>Counted USD</th><th>Variance USD</th><th>Expected KHR</th><th>Counted KHR</th><th>Variance KHR</th></tr></thead><tbody>
          {registers.length ? registers.map((row) => <tr key={row.id}><td>{row.register_name}</td><td>{row.session_number}</td><td>{row.opened_by_name || "—"}</td><td>{row.status}</td><td>{formatReportDate(row.opened_at, { time: true })}</td><td>{amount(row.expected_cash_usd, "USD")}</td><td>{row.counted_cash_usd == null ? "—" : amount(row.counted_cash_usd, "USD")}</td><td>{row.variance_usd == null ? "—" : amount(row.variance_usd, "USD")}</td><td>{amount(row.expected_cash_khr, "KHR")}</td><td>{row.counted_cash_khr == null ? "—" : amount(row.counted_cash_khr, "KHR")}</td><td>{row.variance_khr == null ? "—" : amount(row.variance_khr, "KHR")}</td></tr>) : emptyRow(11)}
        </tbody></table></div>
      </section>

      <section className="panel report-panel report-detail-panel">
        <div className="report-panel-heading"><div><h2>Sale detail</h2><p>Up to 1,000 invoices for the selected branch, user and counter</p></div><span>{count(sales.length)} rows</span></div>
        <div className="report-table-wrap"><table className="report-table wide"><thead><tr><th>Invoice</th><th>Date</th><th>Branch</th><th>Customer</th><th>User</th><th>Counter</th><th>Payment</th><th>Currency</th><th>Gross</th><th>Refund</th><th>Net</th><th>Status</th></tr></thead><tbody>
          {sales.length ? sales.map((row) => <tr key={row.id}><td><strong>{row.invoice_number}</strong></td><td>{formatReportDate(row.completed_at, { time: true })}</td><td>{row.branch_name}</td><td>{row.customer_name}</td><td>{row.cashier_name}</td><td>{row.register_names}</td><td>{row.payment_methods}</td><td>{row.currency}</td><td>{amount(row.gross_total, row.currency)}</td><td>{amount(row.refund_total, row.currency)}</td><td><strong>{amount(row.net_total, row.currency)}</strong></td><td>{row.status}</td></tr>) : emptyRow(12)}
        </tbody></table></div>
      </section>
    </div>
  );
}
