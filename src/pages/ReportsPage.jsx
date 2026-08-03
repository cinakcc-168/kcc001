import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeDollarSign,
  BarChart3,
  Boxes,
  CalendarRange,
  CircleDollarSign,
  Download,
  PackageSearch,
  Percent,
  Printer,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  ShoppingBasket,
  TrendingUp,
  UserRoundCheck,
  UsersRound,
  WalletCards,
  Warehouse,
  Landmark,
  TrendingDown,
  ClipboardCheck
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { money, stockNumber } from "../lib/catalog";
import {
  defaultReportRange,
  exportCsv,
  formatPercent,
  formatReportDate,
  loadReports
} from "../lib/reports";
import ReportMetricCard from "../components/ReportMetricCard";
import ReportBarChart from "../components/ReportBarChart";
import EndOfDayReport from "../components/EndOfDayReport";
import { exportEndOfDayCsv, loadEndOfDay } from "../lib/endOfDay";

const tabs = [
  ["sales", "Sales Summary", ReceiptText],
  ["profit", "Profit & Loss", TrendingUp],
  ["stock", "Stock Analysis", Warehouse],
  ["customers", "Customer Analysis", UsersRound],
  ["endofday", "End of Day", ClipboardCheck]
];

function number(value, maximumFractionDigits = 2) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits
  }).format(Number(value || 0));
}

function reportMoney(value, currency) {
  return money(Number(value || 0), currency || "USD");
}

function titlePeriod(data) {
  if (!data?.from || !data?.to) return "";
  return `${formatReportDate(data.from, { short: true })} – ${formatReportDate(data.to, { short: true })}`;
}

export default function ReportsPage() {
  const { supabase, profile, shop, can } = useAuth();
  const [filters, setFilters] = useState(() => ({
    ...defaultReportRange(),
    branchId: profile?.branch_id || "",
    cashierId: "",
    registerName: ""
  }));
  const [branches, setBranches] = useState([]);
  const [staff, setStaff] = useState([]);
  const [registerNames, setRegisterNames] = useState([]);
  const [activeTab, setActiveTab] = useState("sales");
  const [data, setData] = useState(null);
  const [endOfDay, setEndOfDay] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const canAllBranches = can("branches.all");
  const currency = data?.base_currency || shop?.base_currency || "USD";
  const summary = data?.summary || {};
  const stockSummary = data?.stock_summary || {};
  const customerSummary = data?.customer_summary || {};
  const cashReport = data?.cash_report || {};
  const cashSummary = cashReport?.summary || {};
  const netProfit =
    Number(summary.gross_profit || 0)
    + Number(cashSummary.other_income || 0)
    - Number(cashSummary.operating_expenses || 0);

  useEffect(() => {
    setFilters((current) => ({
      ...current,
      branchId: current.branchId || profile?.branch_id || ""
    }));
  }, [profile?.branch_id]);

  useEffect(() => {
    if (!supabase || !profile?.organization_id || !canAllBranches) {
      setBranches([]);
      return;
    }

    let active = true;

    (async () => {
      const { data: branchData, error } = await supabase
        .from("branches")
        .select("id,name,code,is_active")
        .eq("organization_id", profile.organization_id)
        .eq("is_active", true)
        .order("name");

      if (!active || error) return;
      setBranches(branchData || []);
    })();

    return () => {
      active = false;
    };
  }, [supabase, profile?.organization_id, canAllBranches]);

  useEffect(() => {
    if (!supabase || !profile?.organization_id) {
      setStaff([]);
      setRegisterNames([]);
      return;
    }

    let active = true;
    const selectedBranch = filters.allBranches
      ? null
      : filters.branchId || profile.branch_id;

    (async () => {
      let staffQuery = supabase
        .from("profiles")
        .select("id,full_name,email,role,branch_id,is_active")
        .eq("organization_id", profile.organization_id)
        .eq("is_active", true)
        .order("full_name");
      let registerQuery = supabase
        .from("cash_register_sessions")
        .select("register_name,branch_id")
        .eq("organization_id", profile.organization_id)
        .order("register_name");

      if (selectedBranch) {
        staffQuery = staffQuery.or(`branch_id.eq.${selectedBranch},branch_id.is.null`);
        registerQuery = registerQuery.eq("branch_id", selectedBranch);
      }

      const [staffResult, registerResult] = await Promise.all([
        staffQuery,
        registerQuery
      ]);

      if (!active) return;
      if (!staffResult.error) setStaff(staffResult.data || []);
      if (!registerResult.error) {
        setRegisterNames([...new Set(
          (registerResult.data || [])
            .map((row) => row.register_name)
            .filter(Boolean)
        )]);
      }
    })();

    return () => { active = false; };
  }, [
    supabase,
    profile?.organization_id,
    profile?.branch_id,
    filters.branchId,
    filters.allBranches
  ]);

  const refresh = useCallback(async () => {
    if (!supabase || !profile?.branch_id) return;

    try {
      setLoading(true);
      setMessage("");
      const resolvedFilters = { ...filters, branchId: filters.branchId || profile.branch_id };
      const [report, eod] = await Promise.all([
        loadReports(supabase, resolvedFilters),
        loadEndOfDay(supabase, resolvedFilters)
      ]);
      setData(report);
      setEndOfDay(eod);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }, [supabase, profile?.branch_id, filters]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const trendForChart = useMemo(
    () => (data?.trend || []).map((row) => ({
      ...row,
      label: data?.granularity === "month"
        ? new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${row.period}T00:00:00Z`))
        : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${row.period}T00:00:00Z`))
    })),
    [data]
  );

  function updateFilter(name, value) {
    setFilters((current) => ({
      ...current,
      [name]: value
    }));
  }

  function exportCurrentTab() {
    if (activeTab === "endofday") {
      exportEndOfDayCsv(endOfDay || {}, `tiny-pos-end-of-day-${filters.from}-to-${filters.to}.csv`);
      return;
    }
    const scope = data?.scope?.all_branches
      ? "all-branches"
      : String(data?.scope?.branch_name || "branch").toLowerCase().replaceAll(/[^a-z0-9]+/g, "-");
    const period = `${filters.from}-to-${filters.to}`;

    if (activeTab === "sales") {
      exportCsv(
        `tiny-pos-sales-${scope}-${period}.csv`,
        [
          { label: "Invoice", value: "invoice_number" },
          { label: "Date", value: (row) => formatReportDate(row.completed_at, { time: true }) },
          { label: "Branch", value: "branch_name" },
          { label: "Customer", value: "customer_name" },
          { label: "Cashier", value: "cashier_name" },
          { label: "Payment", value: "payment_methods" },
          { label: `Gross (${currency})`, value: "gross_total" },
          { label: `Refund (${currency})`, value: "refund_total" },
          { label: `Net (${currency})`, value: "net_total" },
          { label: `COGS (${currency})`, value: "cost" },
          { label: `Gross Profit (${currency})`, value: "gross_profit" },
          { label: "Status", value: "status" }
        ],
        data?.sales_rows || []
      );
      return;
    }

    if (activeTab === "profit") {
      exportCsv(
        `tiny-pos-expenses-${scope}-${period}.csv`,
        [
          { label: "Code", value: "entry_number" },
          { label: "Date", value: (row) => formatReportDate(row.entry_at, { time: true }) },
          { label: "Branch", value: "branch_name" },
          { label: "Category", value: "category_name" },
          { label: "Payment", value: "method" },
          { label: "Currency", value: "currency" },
          { label: "Original Amount", value: "amount" },
          { label: `Base Amount (${currency})`, value: "base_amount" },
          { label: "Affects Profit", value: (row) => row.affects_profit ? "Yes" : "No" },
          { label: "User", value: "created_by_name" },
          { label: "Reference", value: "reference_number" },
          { label: "Remark", value: "remark" }
        ],
        (cashReport?.entries || []).filter((row) => row.direction === "expense")
      );
      return;
    }

    if (activeTab === "stock") {
      exportCsv(
        `tiny-pos-stock-${scope}.csv`,
        [
          { label: "Product", value: "product_name" },
          { label: "Product Code", value: "sku" },
          { label: "Barcode", value: "barcode" },
          { label: "Category", value: "category_name" },
          { label: "Quantity", value: "quantity" },
          { label: `Cost Value (${currency})`, value: "cost_value" },
          { label: `Retail Value (${currency})`, value: "retail_value" },
          { label: `Potential Margin (${currency})`, value: "potential_margin" },
          { label: "Last Stock In", value: (row) => formatReportDate(row.last_inbound_at) },
          { label: "Age Days", value: "age_days" },
          { label: "Status", value: "stock_status" }
        ],
        data?.stock_rows || []
      );
      return;
    }

    exportCsv(
      `tiny-pos-customers-${scope}-${period}.csv`,
      [
        { label: "Customer Code", value: "customer_code" },
        { label: "Customer", value: "customer_name" },
        { label: "Type", value: "customer_type" },
        { label: "Phone", value: "phone" },
        { label: "Sales", value: "sale_count" },
        { label: "Refunds", value: "refund_count" },
        { label: `Gross Spend (${currency})`, value: "gross_spend" },
        { label: `Refunded (${currency})`, value: "refunds" },
        { label: `Net Spend (${currency})`, value: "net_spend" },
        { label: `Average Sale (${currency})`, value: "average_sale" },
        { label: "Loyalty Points", value: "loyalty_points" },
        { label: "Last Purchase", value: (row) => formatReportDate(row.last_purchase) }
      ],
      data?.top_customers || []
    );
  }

  function SalesReport() {
    return (
      <div className="report-section-stack">
        <div className="report-metric-grid">
          <ReportMetricCard icon={CircleDollarSign} label="Gross sales" value={reportMoney(summary.gross_sales, currency)} detail={`${number(summary.sale_count, 0)} completed sales`} />
          <ReportMetricCard icon={RotateCcw} label="Refunds" value={reportMoney(summary.refunds, currency)} detail={`${number(summary.refund_count, 0)} refunds`} tone="danger" />
          <ReportMetricCard icon={BadgeDollarSign} label="Net sales" value={reportMoney(summary.net_sales, currency)} detail={`Average ${reportMoney(summary.average_sale, currency)}`} tone="success" />
          <ReportMetricCard icon={ShoppingBasket} label="Net units" value={stockNumber(summary.net_units)} detail={`${stockNumber(summary.units_returned)} units returned`} />
          <ReportMetricCard icon={Percent} label="Discounts" value={reportMoney(summary.discounts, currency)} detail={`Tax collected ${reportMoney(summary.tax_collected, currency)}`} />
          <ReportMetricCard icon={TrendingUp} label="Gross profit" value={reportMoney(summary.gross_profit, currency)} detail={`${formatPercent(summary.gross_margin_percent)} gross margin`} tone="success" />
        </div>

        <div className="report-two-column">
          <section className="panel report-panel">
            <div className="report-panel-heading">
              <div><h2>Net sales trend</h2><p>{data?.granularity === "month" ? "Monthly" : "Daily"} sales after refunds</p></div>
            </div>
            <ReportBarChart data={trendForChart} labelKey="label" valueKey="net_sales" valueFormatter={(value) => reportMoney(value, currency)} />
          </section>

          <section className="panel report-panel">
            <div className="report-panel-heading"><div><h2>Payment methods</h2><p>Collections minus refunds</p></div></div>
            <ReportBarChart data={(data?.payment_methods || []).map((row) => ({ ...row, label: String(row.method).toUpperCase() }))} labelKey="label" valueKey="net" valueFormatter={(value) => reportMoney(value, currency)} />
          </section>
        </div>

        <div className="report-two-column">
          <section className="panel report-panel">
            <div className="report-panel-heading"><div><h2>Top products</h2><p>Ranked by net revenue</p></div></div>
            <div className="report-table-wrap"><table className="report-table"><thead><tr><th>Product</th><th>Net qty</th><th>Net revenue</th><th>Profit</th></tr></thead><tbody>{(data?.top_products || []).map((row) => <tr key={`${row.product_id}-${row.product_name}`}><td>{row.product_name}</td><td>{stockNumber(row.net_quantity)}</td><td>{reportMoney(row.net_revenue, currency)}</td><td>{reportMoney(row.gross_profit, currency)}</td></tr>)}</tbody></table></div>
          </section>

          <section className="panel report-panel">
            <div className="report-panel-heading"><div><h2>Top categories</h2><p>Net sales by category</p></div></div>
            <ReportBarChart data={data?.top_categories || []} labelKey="category_name" valueKey="net_revenue" valueFormatter={(value) => reportMoney(value, currency)} />
          </section>
        </div>

        <section className="panel report-panel report-detail-panel">
          <div className="report-panel-heading"><div><h2>Sales detail</h2><p>Latest 500 invoices in this period</p></div><span>{number(data?.sales_rows?.length, 0)} rows</span></div>
          <div className="report-table-wrap"><table className="report-table wide"><thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th>Cashier</th><th>Payment</th><th>Gross</th><th>Refund</th><th>Net</th><th>Profit</th><th>Status</th></tr></thead><tbody>{(data?.sales_rows || []).map((row) => <tr key={row.invoice_number}><td><strong>{row.invoice_number}</strong><small>{row.branch_name}</small></td><td>{formatReportDate(row.completed_at, { time: true })}</td><td>{row.customer_name}</td><td>{row.cashier_name}</td><td>{row.payment_methods}</td><td>{reportMoney(row.gross_total, currency)}</td><td>{reportMoney(row.refund_total, currency)}</td><td><strong>{reportMoney(row.net_total, currency)}</strong></td><td>{reportMoney(row.gross_profit, currency)}</td><td><span className={`status-pill ${row.status === "completed" ? "active" : "inactive"}`}>{String(row.status).replaceAll("_", " ")}</span></td></tr>)}</tbody></table></div>
        </section>
      </div>
    );
  }

  function ProfitReport() {
    const expenses = (cashReport?.entries || []).filter(
      (row) => row.direction === "expense"
    );

    return (
      <div className="report-section-stack">
        <div className="report-metric-grid">
          <ReportMetricCard icon={CircleDollarSign} label="Net sales" value={reportMoney(summary.net_sales, currency)} detail={`Gross ${reportMoney(summary.gross_sales, currency)}`} />
          <ReportMetricCard icon={WalletCards} label="Net COGS" value={reportMoney(summary.net_cogs, currency)} detail={`Returned cost ${reportMoney(summary.returned_cogs, currency)}`} />
          <ReportMetricCard icon={TrendingUp} label="Gross profit" value={reportMoney(summary.gross_profit, currency)} detail={`${formatPercent(summary.gross_margin_percent)} margin`} tone="success" />
          <ReportMetricCard icon={BadgeDollarSign} label="Other income" value={reportMoney(cashSummary.other_income, currency)} detail="Profit-affecting cash-in entries" />
          <ReportMetricCard icon={TrendingDown} label="Operating expenses" value={reportMoney(cashSummary.operating_expenses, currency)} detail={`${number(cashSummary.expense_count, 0)} expense entries`} tone="danger" />
          <ReportMetricCard icon={Landmark} label="Net profit" value={reportMoney(netProfit, currency)} detail="Gross profit + other income − expenses" tone={netProfit < 0 ? "danger" : "success"} />
          <ReportMetricCard icon={PackageSearch} label="Purchases received" value={reportMoney(summary.purchase_total, currency)} detail={`${number(summary.purchase_count, 0)} purchases`} />
          <ReportMetricCard icon={BadgeDollarSign} label="Purchase paid" value={reportMoney(summary.purchase_paid, currency)} detail={`Balance ${reportMoney(Number(summary.purchase_total || 0) - Number(summary.purchase_paid || 0), currency)}`} />
          <ReportMetricCard icon={RotateCcw} label="Profit reversed" value={reportMoney(summary.profit_reversal, currency)} detail="Gross profit removed by refunds" tone="danger" />
        </div>

        <div className="report-accounting-note">
          <strong>Profit & Loss:</strong> purchases increase inventory and become cost of goods when products are sold. Therefore purchases are not subtracted again from net profit. Only categories marked “Affects Profit & Loss” are included as other income or operating expenses.
        </div>

        <div className="report-two-column">
          <section className="panel report-panel"><div className="report-panel-heading"><div><h2>Gross profit trend</h2><p>Sales profit after refund reversals</p></div></div><ReportBarChart data={trendForChart} labelKey="label" valueKey="gross_profit" valueFormatter={(value) => reportMoney(value, currency)} /></section>
          <section className="panel report-panel"><div className="report-panel-heading"><div><h2>Expense categories</h2><p>All cash-out categories in this period</p></div></div><ReportBarChart data={cashReport?.expense_categories || []} labelKey="category_name" valueKey="total" valueFormatter={(value) => reportMoney(value, currency)} /></section>
        </div>

        <div className="report-two-column">
          <section className="panel report-panel"><div className="report-panel-heading"><div><h2>Top suppliers</h2><p>Purchases received in this period</p></div></div><div className="report-table-wrap"><table className="report-table"><thead><tr><th>Supplier</th><th>Purchases</th><th>Total</th><th>Balance</th></tr></thead><tbody>{(data?.top_suppliers || []).map((row) => <tr key={row.supplier_name}><td>{row.supplier_name}</td><td>{number(row.purchase_count, 0)}</td><td>{reportMoney(row.purchase_total, currency)}</td><td>{reportMoney(row.balance, currency)}</td></tr>)}</tbody></table></div></section>
          <section className="panel report-panel"><div className="report-panel-heading"><div><h2>Profit bridge</h2><p>How net profit is calculated</p></div></div><div className="report-bridge"><div><span>Gross sales</span><strong>{reportMoney(summary.gross_sales, currency)}</strong></div><div className="minus"><span>Customer refunds</span><strong>-{reportMoney(summary.refunds, currency)}</strong></div><div><span>Net sales</span><strong>{reportMoney(summary.net_sales, currency)}</strong></div><div className="minus"><span>Net cost of goods</span><strong>-{reportMoney(summary.net_cogs, currency)}</strong></div><div><span>Gross profit</span><strong>{reportMoney(summary.gross_profit, currency)}</strong></div><div><span>Other income</span><strong>+{reportMoney(cashSummary.other_income, currency)}</strong></div><div className="minus"><span>Operating expenses</span><strong>-{reportMoney(cashSummary.operating_expenses, currency)}</strong></div><div className="total"><span>Net profit</span><strong>{reportMoney(netProfit, currency)}</strong></div></div></section>
        </div>

        <section className="panel report-panel report-detail-panel"><div className="report-panel-heading"><div><h2>Expense detail</h2><p>Active cash-out records in this period</p></div><span>{number(expenses.length, 0)} rows</span></div><div className="report-table-wrap"><table className="report-table wide"><thead><tr><th>Code</th><th>Date</th><th>Branch</th><th>Category</th><th>Payment</th><th>Amount</th><th>Profit & Loss</th><th>User</th><th>Remark</th></tr></thead><tbody>{expenses.map((row) => <tr key={row.id}><td><strong>{row.entry_number}</strong><small>{row.reference_number || "No reference"}</small></td><td>{formatReportDate(row.entry_at, { time: true })}</td><td>{row.branch_name}</td><td>{row.category_name}</td><td>{String(row.method).toUpperCase()}</td><td><strong>{reportMoney(row.base_amount, currency)}</strong><small>{row.currency !== currency ? reportMoney(row.amount, row.currency) : ""}</small></td><td>{row.affects_profit ? "Included" : "Cash only"}</td><td>{row.created_by_name}</td><td>{row.remark || "—"}</td></tr>)}</tbody></table></div></section>

        <section className="panel report-panel report-detail-panel"><div className="report-panel-heading"><div><h2>Purchase detail</h2><p>Latest 500 received purchases</p></div><span>{number(data?.purchase_rows?.length, 0)} rows</span></div><div className="report-table-wrap"><table className="report-table wide"><thead><tr><th>Purchase</th><th>Date</th><th>Supplier</th><th>Supplier invoice</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th></tr></thead><tbody>{(data?.purchase_rows || []).map((row) => <tr key={row.purchase_number}><td><strong>{row.purchase_number}</strong><small>{row.branch_name}</small></td><td>{formatReportDate(row.received_at, { time: true })}</td><td>{row.supplier_name}</td><td>{row.supplier_invoice_number || "—"}</td><td>{reportMoney(row.total, currency)}</td><td>{reportMoney(row.amount_paid, currency)}</td><td>{reportMoney(row.balance, currency)}</td><td>{row.status}</td></tr>)}</tbody></table></div></section>
      </div>
    );
  }

  function StockReport() {
    return (
      <div className="report-section-stack">
        <div className="report-metric-grid">
          <ReportMetricCard icon={Boxes} label="Tracked products" value={number(stockSummary.product_count, 0)} detail={`${stockNumber(stockSummary.stock_units)} units`} />
          <ReportMetricCard icon={Warehouse} label="Stock cost value" value={reportMoney(stockSummary.stock_cost_value, currency)} detail="Current average cost" />
          <ReportMetricCard icon={BadgeDollarSign} label="Retail value" value={reportMoney(stockSummary.stock_retail_value, currency)} detail={`Potential margin ${reportMoney(stockSummary.potential_margin, currency)}`} />
          <ReportMetricCard icon={PackageSearch} label="Low stock" value={number(stockSummary.low_stock_count, 0)} detail={`${number(stockSummary.out_of_stock_count, 0)} out of stock`} tone="danger" />
          <ReportMetricCard icon={BarChart3} label="Negative stock" value={number(stockSummary.negative_stock_count, 0)} detail="Needs immediate correction" tone={Number(stockSummary.negative_stock_count || 0) > 0 ? "danger" : "default"} />
          <ReportMetricCard icon={CalendarRange} label="Stock-aging basis" value="Last stock in" detail="Not FIFO batch aging" />
        </div>

        <div className="report-accounting-note"><strong>Stock-aging note:</strong> {data?.stock_age_note}</div>

        <section className="panel report-panel"><div className="report-panel-heading"><div><h2>Stock age by cost value</h2><p>Current stock grouped by the latest positive stock movement</p></div></div><ReportBarChart data={data?.stock_age || []} labelKey="bucket" valueKey="stock_value" valueFormatter={(value) => reportMoney(value, currency)} /></section>

        <section className="panel report-panel report-detail-panel"><div className="report-panel-heading"><div><h2>Current stock analysis</h2><p>Up to 1,000 active tracked products</p></div><span>{number(data?.stock_rows?.length, 0)} rows</span></div><div className="report-table-wrap"><table className="report-table wide"><thead><tr><th>Product</th><th>Category</th><th>Quantity</th><th>Cost value</th><th>Retail value</th><th>Margin</th><th>Last stock in</th><th>Age</th><th>Status</th></tr></thead><tbody>{(data?.stock_rows || []).map((row) => <tr key={row.product_id}><td><strong>{row.product_name}</strong><small>{row.sku || row.barcode || "No code"}</small></td><td>{row.category_name}</td><td>{stockNumber(row.quantity)}</td><td>{reportMoney(row.cost_value, currency)}</td><td>{reportMoney(row.retail_value, currency)}</td><td>{reportMoney(row.potential_margin, currency)}</td><td>{formatReportDate(row.last_inbound_at)}</td><td>{number(row.age_days, 0)} days</td><td><span className={`report-stock-status ${row.stock_status}`}>{row.stock_status}</span></td></tr>)}</tbody></table></div></section>
      </div>
    );
  }

  function CustomerReport() {
    return (
      <div className="report-section-stack">
        <div className="report-metric-grid">
          <ReportMetricCard icon={UsersRound} label="Customers" value={number(customerSummary.total_customers, 0)} detail={`${number(customerSummary.active_customers, 0)} active`} />
          <ReportMetricCard icon={UserRoundCheck} label="Customers who bought" value={number(customerSummary.customers_with_sales, 0)} detail={`${number(customerSummary.repeat_customers, 0)} repeat customers`} />
          <ReportMetricCard icon={CalendarRange} label="New customers" value={number(customerSummary.new_customers, 0)} detail={titlePeriod(data)} />
          <ReportMetricCard icon={CircleDollarSign} label="Customer net spend" value={reportMoney(customerSummary.customer_net_spend, currency)} detail={`Refunds ${reportMoney(customerSummary.customer_refunds, currency)}`} />
          <ReportMetricCard icon={WalletCards} label="Loyalty outstanding" value={number(customerSummary.loyalty_points_outstanding)} detail="Current active-customer points" />
          <ReportMetricCard icon={Percent} label="Repeat rate" value={formatPercent(Number(customerSummary.customers_with_sales || 0) > 0 ? Number(customerSummary.repeat_customers || 0) * 100 / Number(customerSummary.customers_with_sales) : 0)} detail="2 or more sales in period" />
        </div>

        <div className="report-two-column">
          <section className="panel report-panel"><div className="report-panel-heading"><div><h2>Top customers</h2><p>Ranked by net spending</p></div></div><ReportBarChart data={data?.top_customers || []} labelKey="customer_name" valueKey="net_spend" valueFormatter={(value) => reportMoney(value, currency)} /></section>
          <section className="panel report-panel"><div className="report-panel-heading"><div><h2>Customer types</h2><p>Active profiles by type</p></div></div><ReportBarChart data={(data?.customer_types || []).map((row) => ({ ...row, label: String(row.customer_type).replaceAll("_", " ") }))} labelKey="label" valueKey="customer_count" valueFormatter={(value) => number(value, 0)} /></section>
        </div>

        <section className="panel report-panel report-detail-panel"><div className="report-panel-heading"><div><h2>Customer performance</h2><p>Top 20 customers in this period</p></div><span>{number(data?.top_customers?.length, 0)} rows</span></div><div className="report-table-wrap"><table className="report-table wide"><thead><tr><th>Customer</th><th>Type</th><th>Sales</th><th>Refunds</th><th>Gross spend</th><th>Net spend</th><th>Average sale</th><th>Points</th><th>Last purchase</th></tr></thead><tbody>{(data?.top_customers || []).map((row) => <tr key={row.customer_id}><td><strong>{row.customer_name}</strong><small>{row.customer_code}{row.phone ? ` · ${row.phone}` : ""}</small></td><td>{row.customer_type}</td><td>{number(row.sale_count, 0)}</td><td>{number(row.refund_count, 0)}</td><td>{reportMoney(row.gross_spend, currency)}</td><td><strong>{reportMoney(row.net_spend, currency)}</strong></td><td>{reportMoney(row.average_sale, currency)}</td><td>{number(row.loyalty_points)}</td><td>{formatReportDate(row.last_purchase)}</td></tr>)}</tbody></table></div></section>
      </div>
    );
  }

  if (!can("reports.view")) {
    return <section className="panel empty-state"><BarChart3 size={46} /><h2>Reports access is restricted</h2><p>Your role cannot open management reports.</p></section>;
  }

  return (
    <div className="page-stack reports-page">
      <div className="page-heading reports-heading">
        <div><p className="eyebrow">BUSINESS INTELLIGENCE</p><h1>Reports</h1><p className="muted">Sales, net profit, expenses, purchases, stock, and customer performance.</p></div>
        <div className="heading-actions report-heading-actions"><button type="button" className="secondary-button" onClick={() => window.print()} disabled={!data}><Printer size={18} />Print</button><button type="button" className="secondary-button" onClick={exportCurrentTab} disabled={!data}><Download size={18} />Export CSV</button><button type="button" className="primary-button" onClick={refresh} disabled={loading}><RefreshCw size={18} className={loading ? "spin" : ""} />Refresh</button></div>
      </div>

      {message && <div className="notice error">{message}</div>}

      <section className="panel report-filters">
        <label><span>From</span><input type="date" value={filters.from} onChange={(event) => updateFilter("from", event.target.value)} /></label>
        <label><span>To</span><input type="date" value={filters.to} onChange={(event) => updateFilter("to", event.target.value)} /></label>
        {canAllBranches && <label><span>Branch scope</span><select value={filters.allBranches ? "all" : filters.branchId} onChange={(event) => { if (event.target.value === "all") setFilters((current) => ({ ...current, allBranches: true, registerName: "" })); else setFilters((current) => ({ ...current, allBranches: false, branchId: event.target.value, registerName: "" })); }}><option value="all">All branches</option>{branches.map((branch) => <option value={branch.id} key={branch.id}>{branch.name}</option>)}</select></label>}
        {activeTab === "endofday" && <label><span>Sale user / cashier</span><select value={filters.cashierId} onChange={(event) => updateFilter("cashierId", event.target.value)}><option value="">All users</option>{staff.map((member) => <option value={member.id} key={member.id}>{member.full_name || member.email || "POS Staff"} · {String(member.role || "staff").replaceAll("_", " ")}</option>)}</select></label>}
        {activeTab === "endofday" && <label><span>Counter / register</span><select value={filters.registerName} onChange={(event) => updateFilter("registerName", event.target.value)}><option value="">All counters</option>{registerNames.map((name) => <option value={name} key={name}>{name}</option>)}</select></label>}
        <div className="report-filter-summary"><span>Report scope</span><strong>{activeTab === "endofday" ? (endOfDay?.branch_name || profile?.branches?.name || "Current branch") : (data?.scope?.branch_name || profile?.branches?.name || "Current branch")}</strong><small>{data ? titlePeriod(data) : "Choose dates"}</small></div>
      </section>

      <div className="report-tabs">{tabs.map(([key, label, Icon]) => <button type="button" key={key} className={activeTab === key ? "active" : ""} onClick={() => setActiveTab(key)}><Icon size={18} />{label}</button>)}</div>

      {loading && !data ? <section className="panel empty-state"><RefreshCw className="spin" /><h2>Loading reports…</h2></section> : null}
      {data && activeTab === "sales" && <SalesReport />}
      {data && activeTab === "profit" && <ProfitReport />}
      {data && activeTab === "stock" && <StockReport />}
      {data && activeTab === "customers" && <CustomerReport />}
      {endOfDay && activeTab === "endofday" && <EndOfDayReport report={endOfDay} />}
    </div>
  );
}
