import {
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileSearch,
  RefreshCw,
  Search
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import InvoiceDetailModal from "../components/InvoiceDetailModal";
import ReceiptModal from "../components/ReceiptModal";
import { money } from "../lib/catalog";
import {
  buildInvoiceReceipt,
  defaultInvoiceDateRange,
  downloadInvoiceCsv,
  invoiceDateTime,
  invoiceStatusLabel,
  loadInvoiceCenter,
  paymentMethodLabel
} from "../lib/invoices";

const emptySummary = {
  invoice_count: 0,
  gross_sales: 0,
  refunds: 0,
  net_sales: 0,
  paid_amount: 0,
  credit_outstanding: 0,
  gross_profit: 0,
  net_profit: 0
};

export default function InvoicesPage() {
  const {
    supabase,
    profile,
    shop,
    can
  } = useAuth();

  const navigate = useNavigate();

  const canView = can("invoices.view");

  const canRefund = can(
    "returns.process"
  );

  const defaults = defaultInvoiceDateRange();

  const [filters, setFilters] = useState({
    from: defaults.from,
    to: defaults.to,
    search: "",
    sale_status: "",
    payment_status: "",
    payment_method: "",
    currency: "",
    cashier_id: "",
    branch_id: profile?.branch_id || "",
    page: 1,
    page_size: 25
  });

  const [staffOptions, setStaffOptions] = useState([]);
  const [result, setResult] = useState({
    meta: {},
    summary: {
      USD: emptySummary,
      KHR: emptySummary
    },
    rows: []
  });

  const [searchInput, setSearchInput] =
    useState("");
  const [selected, setSelected] =
    useState(null);
  const [receipt, setReceipt] =
    useState(null);
  const [loading, setLoading] =
    useState(true);
  const [exporting, setExporting] =
    useState(false);
  const [message, setMessage] =
    useState("");
  const [messageType, setMessageType] =
    useState("success");

  const refresh = useCallback(async () => {
    if (
      !supabase
      || !profile?.organization_id
      || !profile?.branch_id
      || !canView
    ) {
      return;
    }

    try {
      setLoading(true);

      const data = await loadInvoiceCenter(
        supabase,
        filters
      );

      setResult(data);

      setSelected((current) => {
        if (!current) return null;

        return data.rows.find(
          (invoice) =>
            invoice.id === current.id
        ) || null;
      });
    } catch (error) {
      setMessageType("error");
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }, [
    supabase,
    profile,
    filters,
    canView
  ]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!supabase || !profile?.organization_id) return;
    let active = true;
    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,full_name,email,role,is_active")
        .eq("organization_id", profile.organization_id)
        .eq("is_active", true)
        .order("full_name");
      if (active && !error) setStaffOptions(data || []);
    })();
    return () => { active = false; };
  }, [supabase, profile?.organization_id]);


  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilters((current) => {
        if (current.search === searchInput) {
          return current;
        }

        return {
          ...current,
          search: searchInput,
          page: 1
        };
      });
    }, 350);

    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (
      !result.meta?.can_view_all_branches
      && filters.branch_id !== profile?.branch_id
    ) {
      setFilters((current) => ({
        ...current,
        branch_id: profile?.branch_id || "",
        page: 1
      }));
    }
  }, [
    result.meta?.can_view_all_branches,
    filters.branch_id,
    profile?.branch_id
  ]);

  const usd = {
    ...emptySummary,
    ...(result.summary?.USD || {})
  };

  const khr = {
    ...emptySummary,
    ...(result.summary?.KHR || {})
  };

  const totalRows = Number(
    result.meta?.total_rows || 0
  );

  const totalPages = Math.max(
    1,
    Number(result.meta?.total_pages || 1)
  );

  const currentPage = Math.min(
    Math.max(
      1,
      Number(result.meta?.page || filters.page)
    ),
    totalPages
  );

  useEffect(() => {
    if (filters.page <= totalPages) return;

    setFilters((current) => ({
      ...current,
      page: totalPages
    }));
  }, [filters.page, totalPages]);

  const rangeLabel = useMemo(() => {
    if (totalRows === 0) return "0 invoices";

    const start =
      (currentPage - 1)
      * Number(filters.page_size)
      + 1;

    const end = Math.min(
      currentPage
        * Number(filters.page_size),
      totalRows
    );

    return `${start}–${end} of ${totalRows}`;
  }, [
    totalRows,
    currentPage,
    filters.page_size
  ]);

  function updateFilter(field, value) {
    setFilters((current) => ({
      ...current,
      [field]: value,
      page: 1
    }));
  }

  function announce(type, text) {
    setMessageType(type);
    setMessage(text);
  }

  async function openReceipt(invoice) {
    try {
      const { data, error } = await supabase
        .from("payments")
        .select(`
          id,
          method,
          currency,
          amount,
          tendered_amount,
          change_amount,
          reference_number,
          paid_at,
          notes,
          credit_payment_id,
          tender_currency,
          tender_amount,
          tender_change_amount,
          exchange_rate
        `)
        .eq("sale_id", invoice.id)
        .order("paid_at")
        .order("id");
      if (error) throw error;
      setReceipt(buildInvoiceReceipt({
        ...invoice,
        payments: (data || []).map((payment) => ({
          ...payment,
          is_credit_collection: Boolean(payment.credit_payment_id)
        }))
      }, shop));
    } catch (error) {
      announce("error", error.message);
    }
  }

  function openReturn(invoice) {
    setSelected(null);

    const date = String(
      invoice.completed_at
      || invoice.created_at
      || ""
    ).slice(0, 10);

    const params = new URLSearchParams({
      invoice: invoice.invoice_number
    });

    if (date) {
      params.set("date", date);
    }

    navigate(`/returns?${params.toString()}`);
  }

  async function exportCsv() {
    try {
      setExporting(true);

      const exportResult =
        await loadInvoiceCenter(
          supabase,
          {
            ...filters,
            page: 1,
            page_size: 1000
          }
        );

      downloadInvoiceCsv(
        exportResult.rows,
        `tiny-pos-invoices-${filters.from}-to-${filters.to}.csv`
      );

      announce(
        "success",
        exportResult.meta.total_rows > 1000
          ? "Exported the first 1,000 matching invoices. Narrow the filters for a complete file."
          : `Exported ${exportResult.rows.length} invoice${exportResult.rows.length === 1 ? "" : "s"}.`
      );
    } catch (error) {
      announce("error", error.message);
    } finally {
      setExporting(false);
    }
  }

  if (!canView) {
    return (
      <section className="panel empty-state">
        <FileSearch size={46} />
        <h2>Invoice access required</h2>
        <p>
          Your role cannot view sales history.
        </p>
      </section>
    );
  }

  return (
    <div className="page-stack invoice-center-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            SALES HISTORY
          </p>
          <h1>Invoice Center</h1>
          <p className="muted">
            Search, inspect, export and reprint
            completed sales and refunds.
          </p>
        </div>

        <div className="page-heading-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={exportCsv}
            disabled={
              exporting
              || loading
              || totalRows === 0
            }
          >
            <Download size={18} />
            {exporting
              ? "Exporting..."
              : "Export CSV"}
          </button>

          <button
            type="button"
            className="secondary-button"
            onClick={refresh}
            disabled={loading}
          >
            <RefreshCw
              size={18}
              className={
                loading ? "spin" : ""
              }
            />
            Refresh
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`notice ${messageType}`}
          onClick={() => setMessage("")}
        >
          {message}
        </div>
      )}

      <div className="invoice-summary-grid">
        <article>
          <span>Matching invoices</span>
          <strong>
            {totalRows.toLocaleString("en-US")}
          </strong>
          <small>{rangeLabel}</small>
        </article>

        <article>
          <span>USD net sales</span>
          <strong>
            {money(usd.net_sales, "USD")}
          </strong>
          <small>
            {usd.invoice_count} USD invoices
          </small>
        </article>

        <article>
          <span>KHR net sales</span>
          <strong>
            {money(khr.net_sales, "KHR")}
          </strong>
          <small>
            {khr.invoice_count} KHR invoices
          </small>
        </article>

        <article>
          <span>Refunds</span>
          <strong>
            {money(usd.refunds, "USD")}
          </strong>
          <small>
            {money(khr.refunds, "KHR")}
          </small>
        </article>

        <article>
          <span>Credit outstanding</span>
          <strong>
            {money(
              usd.credit_outstanding,
              "USD"
            )}
          </strong>
          <small>
            {money(
              khr.credit_outstanding,
              "KHR"
            )}
          </small>
        </article>

        <article>
          <span>
            {result.meta?.can_view_profit
              ? "Net profit"
              : "Paid amount"}
          </span>
          <strong>
            {money(
              result.meta?.can_view_profit
                ? usd.net_profit
                : usd.paid_amount,
              "USD"
            )}
          </strong>
          <small>
            {money(
              result.meta?.can_view_profit
                ? khr.net_profit
                : khr.paid_amount,
              "KHR"
            )}
          </small>
        </article>
      </div>

      <section className="panel invoice-filter-panel">
        <div className="search-box">
          <Search size={18} />
          <input
            value={searchInput}
            onChange={(event) =>
              setSearchInput(
                event.target.value
              )
            }
            placeholder="Invoice, customer, phone, product, barcode, quotation, return or payment reference"
          />
        </div>

        <label>
          <span>From</span>
          <input
            type="date"
            value={filters.from}
            onChange={(event) =>
              updateFilter(
                "from",
                event.target.value
              )
            }
          />
        </label>

        <label>
          <span>To</span>
          <input
            type="date"
            value={filters.to}
            onChange={(event) =>
              updateFilter(
                "to",
                event.target.value
              )
            }
          />
        </label>

        {result.meta?.can_view_all_branches && (
          <label>
            <span>Branch</span>
            <select
              value={filters.branch_id}
              onChange={(event) =>
                updateFilter(
                  "branch_id",
                  event.target.value
                )
              }
            >
              <option value="">
                All branches
              </option>

              {(result.meta.branches || [])
                .map((branch) => (
                  <option
                    value={branch.id}
                    key={branch.id}
                  >
                    {branch.name}
                  </option>
                ))}
            </select>
          </label>
        )}


        <label>
          <span>Sold by / User</span>
          <select value={filters.cashier_id} onChange={(event) => updateFilter("cashier_id", event.target.value)}>
            <option value="">All users</option>
            {staffOptions.map((member) => <option value={member.id} key={member.id}>{member.full_name || member.email || "POS Staff"} · {member.role}</option>)}
          </select>
        </label>

        <label>
          <span>Sale status</span>
          <select
            value={filters.sale_status}
            onChange={(event) =>
              updateFilter(
                "sale_status",
                event.target.value
              )
            }
          >
            <option value="">
              All sale statuses
            </option>
            <option value="completed">
              Completed
            </option>
            <option value="partially_refunded">
              Partially refunded
            </option>
            <option value="refunded">
              Refunded
            </option>
            <option value="voided">
              Voided
            </option>
          </select>
        </label>

        <label>
          <span>Payment status</span>
          <select
            value={filters.payment_status}
            onChange={(event) =>
              updateFilter(
                "payment_status",
                event.target.value
              )
            }
          >
            <option value="">
              All payment statuses
            </option>
            <option value="unpaid">
              Unpaid
            </option>
            <option value="partial">
              Partial
            </option>
            <option value="paid">
              Paid
            </option>
            <option value="refunded">
              Refunded
            </option>
          </select>
        </label>

        <label>
          <span>Payment method</span>
          <select
            value={filters.payment_method}
            onChange={(event) =>
              updateFilter(
                "payment_method",
                event.target.value
              )
            }
          >
            <option value="">
              All payment methods
            </option>
            <option value="cash">Cash</option>
            <option value="bank">Bank</option>
            <option value="khqr">KHQR</option>
            <option value="card">Card</option>
            <option value="other">Other</option>
            <option value="credit">
              Customer credit
            </option>
          </select>
        </label>

        <label>
          <span>Currency</span>
          <select
            value={filters.currency}
            onChange={(event) =>
              updateFilter(
                "currency",
                event.target.value
              )
            }
          >
            <option value="">
              USD and KHR
            </option>
            <option value="USD">USD</option>
            <option value="KHR">KHR</option>
          </select>
        </label>
      </section>

      <section className="panel invoice-table-panel">
        {loading ? (
          <div className="empty-state">
            <RefreshCw
              className="spin"
              size={36}
            />
            <p>Loading invoices...</p>
          </div>
        ) : result.rows.length === 0 ? (
          <div className="empty-state">
            <FileSearch size={48} />
            <h2>No matching invoices</h2>
            <p>
              Change the date range, filters or
              search phrase.
            </p>
          </div>
        ) : (
          <div className="invoice-table-wrap">
            <table className="invoice-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Date</th>
                  <th>Customer</th>
                  {result.meta?.all_branches && (
                    <th>Branch</th>
                  )}
                  <th>Payment</th>
                  <th>Status</th>
                  <th>Gross</th>
                  <th>Refund</th>
                  <th>Net</th>
                  <th />
                </tr>
              </thead>

              <tbody>
                {result.rows.map((invoice) => (
                  <tr key={invoice.id}>
                    <td data-label="Invoice">
                      <strong>
                        {invoice.invoice_number}
                      </strong>

                      {invoice.source_quote_number && (
                        <small>
                          Quote {invoice.source_quote_number}
                        </small>
                      )}
                    </td>

                    <td data-label="Date">
                      {invoiceDateTime(
                        invoice.completed_at
                        || invoice.created_at
                      )}
                    </td>

                    <td data-label="Customer">
                      <strong>
                        {invoice.customer?.name
                          || "Walk-in"}
                      </strong>
                      <small>
                        {invoice.customer?.phone
                          || invoice.customer
                            ?.customer_code
                          || "No profile"}
                      </small>
                    </td>

                    {result.meta?.all_branches && (
                      <td data-label="Branch">
                        {invoice.branch_name}
                      </td>
                    )}

                    <td data-label="Payment">
                      <strong>
                        {paymentMethodLabel(
                          invoice.payment_method
                        )}
                      </strong>
                      <small>
                        {invoiceStatusLabel(
                          invoice.payment_status
                        )}
                      </small>
                    </td>

                    <td data-label="Status">
                      <span
                        className={`invoice-status ${invoice.status}`}
                      >
                        {invoiceStatusLabel(
                          invoice.status
                        )}
                      </span>
                    </td>

                    <td data-label="Gross">
                      {money(
                        invoice.total_amount,
                        invoice.currency
                      )}
                    </td>

                    <td data-label="Refund">
                      {money(
                        invoice.refunded_amount,
                        invoice.currency
                      )}
                    </td>

                    <td data-label="Net">
                      <strong>
                        {money(
                          invoice.net_total,
                          invoice.currency
                        )}
                      </strong>

                      {Number(
                        invoice.credit_outstanding
                      ) > 0 && (
                        <small>
                          {money(
                            invoice.credit_outstanding,
                            invoice.currency
                          )}
                          {" due"}
                        </small>
                      )}
                    </td>

                    <td data-label="View">
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() =>
                          setSelected(invoice)
                        }
                        title="View invoice details"
                      >
                        <Eye size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="invoice-pagination">
          <span>{rangeLabel}</span>

          <label>
            <span>Rows</span>
            <select
              value={filters.page_size}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  page_size: Number(
                    event.target.value
                  ),
                  page: 1
                }))
              }
            >
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
          </label>

          <button
            type="button"
            className="icon-button"
            onClick={() =>
              setFilters((current) => ({
                ...current,
                page: Math.max(
                  1,
                  current.page - 1
                )
              }))
            }
            disabled={
              loading || currentPage <= 1
            }
            title="Previous page"
          >
            <ChevronLeft size={19} />
          </button>

          <strong>
            Page {currentPage} of {totalPages}
          </strong>

          <button
            type="button"
            className="icon-button"
            onClick={() =>
              setFilters((current) => ({
                ...current,
                page: Math.min(
                  totalPages,
                  current.page + 1
                )
              }))
            }
            disabled={
              loading
              || currentPage >= totalPages
            }
            title="Next page"
          >
            <ChevronRight size={19} />
          </button>
        </div>
      </section>

      <InvoiceDetailModal
        invoice={selected}
        canViewProfit={Boolean(
          result.meta?.can_view_profit
        )}
        canRefund={canRefund}
        onClose={() => setSelected(null)}
        onPrint={(invoice) => {
          setSelected(null);
          openReceipt(invoice);
        }}
        onOpenReturn={openReturn}
      />

      <ReceiptModal
        receipt={receipt}
        onClose={() => setReceipt(null)}
      />
    </div>
  );
}
