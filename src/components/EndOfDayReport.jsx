import ResponsiveDataList from "./ResponsiveDataList";
import { money } from "../lib/catalog";
import { formatReportDate } from "../lib/reports";

function count(value) {
  return Number(value || 0).toLocaleString();
}

function amount(value, currency) {
  return money(Number(value || 0), currency || "USD");
}

function dateKey(value) {
  if (!value) return "";
  const direct = String(value).match(/^(\d{4}-\d{2}-\d{2})$/);
  if (direct) return direct[1];
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function withinReportPeriod(value, report) {
  const key = dateKey(value);
  return Boolean(key && (!report?.from || key >= report.from) && (!report?.to || key <= report.to));
}

export default function EndOfDayReport({ report }) {
  const summaries = report?.summary_by_currency || [];
  const payments = report?.payments || [];
  const cashActivity = report?.cash_activity || [];
  const supplierPayments = report?.supplier_payments || [];
  const cashiers = report?.cashiers || [];
  const registers = report?.registers || [];
  const sales = (report?.sales || []).filter((row) => withinReportPeriod(row.completed_at, report));
  const scope = `${report?.from || ""} to ${report?.to || ""} · ${report?.branch_name || "Current branch"} · ${report?.cashier_name || "All users"} · ${report?.register_name || "All counters"}`;
  const fileScope = `${report?.from || "from"}-to-${report?.to || "to"}`;

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

      <ResponsiveDataList
        storageKey="eod-sales-collections"
        title="Sales collections"
        subtitle={scope}
        rows={payments}
        filename={`end-of-day-sales-collections-${fileScope}.xls`}
        columns={[
          { label: "Method", width: 120, value: (row) => String(row.method || "other").toUpperCase() },
          { label: "Currency", width: 80, value: "currency" },
          { label: "Transactions", width: 100, value: (row) => count(row.transaction_count) },
          { label: "Amount", width: 120, documentValue: (row) => amount(row.amount, row.currency), render: (row) => <strong>{amount(row.amount, row.currency)}</strong> }
        ]}
      />

      <ResponsiveDataList
        storageKey="eod-cash-activity"
        title="Cash & expense activity"
        subtitle={scope}
        rows={cashActivity}
        filename={`end-of-day-cash-activity-${fileScope}.xls`}
        columns={[
          { label: "Type", width: 100, value: "direction" },
          { label: "Category", width: 180, value: "category_name" },
          { label: "Method", width: 100, value: (row) => String(row.method || "").toUpperCase() },
          { label: "Currency", width: 80, value: "currency" },
          { label: "Entries", width: 80, value: (row) => count(row.transaction_count) },
          { label: "Amount", width: 120, documentValue: (row) => amount(row.amount, row.currency), render: (row) => <strong>{amount(row.amount, row.currency)}</strong> },
          { label: "Affects profit", width: 100, value: (row) => row.affects_profit ? "Yes" : "No" }
        ]}
      />

      <ResponsiveDataList
        storageKey="eod-supplier-payments"
        title="Supplier payments"
        subtitle={scope}
        rows={supplierPayments}
        filename={`end-of-day-supplier-payments-${fileScope}.xls`}
        columns={[
          { label: "Method", width: 120, value: (row) => String(row.method || "").toUpperCase() },
          { label: "Currency", width: 80, value: "currency" },
          { label: "Transactions", width: 100, value: (row) => count(row.transaction_count) },
          { label: "Amount", width: 120, documentValue: (row) => amount(row.amount, row.currency), render: (row) => <strong>{amount(row.amount, row.currency)}</strong> }
        ]}
      />

      <ResponsiveDataList
        storageKey="eod-cashier-performance"
        title="User / cashier performance"
        subtitle={scope}
        rows={cashiers}
        filename={`end-of-day-user-performance-${fileScope}.xls`}
        columns={[
          { label: "User", width: 180, value: (row) => row.cashier_name || "POS Staff" },
          { label: "Currency", width: 80, value: "currency" },
          { label: "Invoices", width: 80, value: (row) => count(row.invoice_count) },
          { label: "Gross", width: 110, documentValue: (row) => amount(row.gross_sales, row.currency), render: (row) => amount(row.gross_sales, row.currency) },
          { label: "Refunds", width: 110, documentValue: (row) => amount(row.refunds, row.currency), render: (row) => amount(row.refunds, row.currency) },
          { label: "Net", width: 110, documentValue: (row) => amount(row.net_sales, row.currency), render: (row) => <strong>{amount(row.net_sales, row.currency)}</strong> },
          { label: "Cash", width: 110, documentValue: (row) => amount(row.cash_sales, row.currency), render: (row) => amount(row.cash_sales, row.currency) },
          { label: "Non-cash", width: 110, documentValue: (row) => amount(row.non_cash_sales, row.currency), render: (row) => amount(row.non_cash_sales, row.currency) }
        ]}
      />

      <ResponsiveDataList
        storageKey="eod-register-reconciliation"
        title="Counter / register reconciliation"
        subtitle={scope}
        rows={registers}
        filename={`end-of-day-registers-${fileScope}.xls`}
        columns={[
          { label: "Counter", width: 130, value: "register_name" },
          { label: "Session", width: 150, value: "session_number" },
          { label: "User", width: 150, value: (row) => row.opened_by_name || "—" },
          { label: "Status", width: 90, value: "status" },
          { label: "Opened", width: 150, documentValue: (row) => formatReportDate(row.opened_at, { time: true }), render: (row) => formatReportDate(row.opened_at, { time: true }) },
          { label: "Expected USD", width: 105, documentValue: (row) => amount(row.expected_cash_usd, "USD"), render: (row) => amount(row.expected_cash_usd, "USD") },
          { label: "Counted USD", width: 105, documentValue: (row) => row.counted_cash_usd == null ? "—" : amount(row.counted_cash_usd, "USD"), render: (row) => row.counted_cash_usd == null ? "—" : amount(row.counted_cash_usd, "USD") },
          { label: "Variance USD", width: 105, documentValue: (row) => row.variance_usd == null ? "—" : amount(row.variance_usd, "USD"), render: (row) => row.variance_usd == null ? "—" : amount(row.variance_usd, "USD") },
          { label: "Expected KHR", width: 115, documentValue: (row) => amount(row.expected_cash_khr, "KHR"), render: (row) => amount(row.expected_cash_khr, "KHR") },
          { label: "Counted KHR", width: 115, documentValue: (row) => row.counted_cash_khr == null ? "—" : amount(row.counted_cash_khr, "KHR"), render: (row) => row.counted_cash_khr == null ? "—" : amount(row.counted_cash_khr, "KHR") },
          { label: "Variance KHR", width: 115, documentValue: (row) => row.variance_khr == null ? "—" : amount(row.variance_khr, "KHR"), render: (row) => row.variance_khr == null ? "—" : amount(row.variance_khr, "KHR") }
        ]}
      />

      <ResponsiveDataList
        storageKey="eod-sale-detail"
        title="Sale detail"
        subtitle={scope}
        rows={sales}
        filename={`end-of-day-sales-${fileScope}.xls`}
        columns={[
          { label: "Invoice", width: 175, documentValue: (row) => row.invoice_number, render: (row) => <strong>{row.invoice_number}</strong> },
          { label: "Date", width: 150, documentValue: (row) => formatReportDate(row.completed_at, { time: true }), render: (row) => formatReportDate(row.completed_at, { time: true }) },
          { label: "Branch", width: 130, value: "branch_name" },
          { label: "Customer", width: 160, value: "customer_name" },
          { label: "User", width: 140, value: "cashier_name" },
          { label: "Counter", width: 130, value: "register_names" },
          { label: "Payment", width: 130, value: "payment_methods" },
          { label: "Currency", width: 80, value: "currency" },
          { label: "Gross", width: 100, documentValue: (row) => amount(row.gross_total, row.currency), render: (row) => amount(row.gross_total, row.currency) },
          { label: "Refund", width: 100, documentValue: (row) => amount(row.refund_total, row.currency), render: (row) => amount(row.refund_total, row.currency) },
          { label: "Net", width: 100, documentValue: (row) => amount(row.net_total, row.currency), render: (row) => <strong>{amount(row.net_total, row.currency)}</strong> },
          { label: "Status", width: 90, value: "status" }
        ]}
        renderCard={(row) => <article className="responsive-data-card eod-sale-card"><header><div><strong>{row.invoice_number}</strong><small>{formatReportDate(row.completed_at, { time: true })}</small></div><span className={`status-pill ${row.status === "completed" ? "active" : "inactive"}`}>{row.status}</span></header><div><span>Customer</span><strong>{row.customer_name}</strong></div><div><span>User / Counter</span><strong>{row.cashier_name}</strong><small>{row.register_names}</small></div><div><span>Payment</span><strong>{row.payment_methods}</strong></div><div><span>Gross / Refund</span><strong>{amount(row.gross_total, row.currency)} / {amount(row.refund_total, row.currency)}</strong></div><div><span>Net</span><strong>{amount(row.net_total, row.currency)}</strong></div></article>}
      />
    </div>
  );
}
