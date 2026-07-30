import {
  CalendarClock,
  Download,
  Eye,
  HandCoins,
  Landmark,
  RefreshCw,
  Search,
  Settings2
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import SupplierPaymentModal from "../components/SupplierPaymentModal";
import SupplierStatementModal from "../components/SupplierStatementModal";
import SupplierTermsModal from "../components/SupplierTermsModal";
import { money } from "../lib/catalog";
import {
  agingClass,
  agingLabel,
  downloadSupplierPayablesCsv,
  loadSupplierPayables,
  loadSupplierStatement,
  payableDate,
  payableDateTime,
  payableMethodLabel,
  recordSupplierPayment,
  saveSupplierTerms
} from "../lib/payables";

function todayString() {
  return new Date()
    .toISOString()
    .slice(0, 10);
}

function statementStartString() {
  const date = new Date();
  date.setDate(date.getDate() - 89);
  return date.toISOString().slice(0, 10);
}

export default function SupplierPayablesPage() {
  const {
    supabase,
    profile,
    shop
  } = useAuth();

  const canManage = [
    "owner",
    "admin",
    "manager"
  ].includes(profile?.role);

  const canAllBranches = [
    "owner",
    "admin"
  ].includes(profile?.role);

  const [allBranches, setAllBranches] =
    useState(false);
  const [asOf, setAsOf] =
    useState(todayString());

  const [workspace, setWorkspace] =
    useState({
      meta: {},
      summary: {
        usd: {},
        khr: {}
      },
      suppliers: [],
      invoices: [],
      recent_payments: []
    });

  const [search, setSearch] =
    useState("");
  const [currency, setCurrency] =
    useState("");
  const [aging, setAging] =
    useState("");

  const [paymentSupplier, setPaymentSupplier] =
    useState(null);
  const [termsSupplier, setTermsSupplier] =
    useState(null);

  const [statement, setStatement] =
    useState(null);
  const [statementLoading, setStatementLoading] =
    useState(false);
  const [statementFrom, setStatementFrom] =
    useState(statementStartString());
  const [statementTo, setStatementTo] =
    useState(todayString());

  const [loading, setLoading] =
    useState(true);
  const [busy, setBusy] =
    useState("");
  const [message, setMessage] =
    useState("");
  const [messageType, setMessageType] =
    useState("success");

  const refresh = useCallback(async () => {
    if (
      !supabase
      || !profile?.organization_id
      || !profile?.branch_id
      || !canManage
    ) {
      return;
    }

    try {
      setLoading(true);
      setMessage("");

      const result =
        await loadSupplierPayables(
          supabase,
          allBranches,
          asOf
        );

      setWorkspace(result);
    } catch (error) {
      setMessageType("error");
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }, [
    supabase,
    profile,
    allBranches,
    asOf,
    canManage
  ]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!canAllBranches && allBranches) {
      setAllBranches(false);
    }
  }, [canAllBranches, allBranches]);

  const visibleSuppliers = useMemo(() => {
    const needle = search
      .trim()
      .toLowerCase();

    return workspace.suppliers.filter(
      (supplier) => {
        if (
          currency === "USD"
          && Number(
            supplier.usd_balance || 0
          ) <= 0
        ) {
          return false;
        }

        if (
          currency === "KHR"
          && Number(
            supplier.khr_balance || 0
          ) <= 0
        ) {
          return false;
        }

        if (
          aging === "overdue"
          && Number(
            supplier.overdue_invoice_count
            || 0
          ) <= 0
        ) {
          return false;
        }

        if (
          aging === "current"
          && (
            Number(
              supplier.usd_current || 0
            ) <= 0
            && Number(
              supplier.khr_current || 0
            ) <= 0
          )
        ) {
          return false;
        }

        if (!needle) return true;

        return [
          supplier.name,
          supplier.supplier_code,
          supplier.contact_name,
          supplier.phone,
          supplier.email,
          supplier.tax_id
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(needle);
      }
    );
  }, [
    workspace.suppliers,
    search,
    currency,
    aging
  ]);

  const visibleInvoices = useMemo(() => {
    const supplierIds = new Set(
      visibleSuppliers.map(
        (supplier) =>
          supplier.supplier_id
      )
    );

    return workspace.invoices.filter(
      (invoice) => {
        if (
          !supplierIds.has(
            invoice.supplier_id
          )
        ) {
          return false;
        }

        if (
          currency
          && invoice.currency !== currency
        ) {
          return false;
        }

        if (
          aging === "overdue"
          && Number(
            invoice.days_overdue || 0
          ) <= 0
        ) {
          return false;
        }

        if (
          aging === "current"
          && invoice.aging_bucket
            !== "current"
        ) {
          return false;
        }

        return true;
      }
    );
  }, [
    workspace.invoices,
    visibleSuppliers,
    currency,
    aging
  ]);

  function announce(type, text) {
    setMessageType(type);
    setMessage(text);
  }

  function currentBranchBalance(
    supplier,
    selectedCurrency
  ) {
    return workspace.invoices
      .filter(
        (invoice) =>
          invoice.supplier_id
            === supplier.supplier_id
          && invoice.branch_id
            === profile.branch_id
          && (
            !selectedCurrency
            || invoice.currency
              === selectedCurrency
          )
      )
      .reduce(
        (sum, invoice) =>
          sum
          + Number(
            invoice.balance_due || 0
          ),
        0
      );
  }

  async function handlePayment(values) {
    try {
      setBusy("payment");

      const result =
        await recordSupplierPayment(
          supabase,
          values
        );

      setPaymentSupplier(null);

      announce(
        "success",
        `${result.payment_number} recorded for ${money(
          result.amount,
          result.currency
        )} and allocated to ${result.allocation_count} purchase${
          result.allocation_count === 1
            ? ""
            : "s"
        }.`
      );

      await refresh();
    } catch (error) {
      announce("error", error.message);
    } finally {
      setBusy("");
    }
  }

  async function handleTerms(values) {
    try {
      setBusy("terms");

      const result =
        await saveSupplierTerms(
          supabase,
          values
        );

      setTermsSupplier(null);

      announce(
        "success",
        `Supplier terms saved. ${result.updated_open_purchases} open purchase${
          result.updated_open_purchases === 1
            ? ""
            : "s"
        } recalculated.`
      );

      await refresh();
    } catch (error) {
      announce("error", error.message);
    } finally {
      setBusy("");
    }
  }

  async function openStatement(supplier) {
    if (statementTo < statementFrom) {
      announce(
        "error",
        "Statement end date must be on or after the start date."
      );
      return;
    }

    try {
      setStatementLoading(true);
      setStatement({
        supplier: {
          name: supplier.name
        }
      });

      const result =
        await loadSupplierStatement(
          supabase,
          {
            supplier_id:
              supplier.supplier_id,
            from: statementFrom,
            to: statementTo,
            all_branches:
              allBranches
          }
        );

      setStatement(result);
    } catch (error) {
      setStatement(null);
      announce("error", error.message);
    } finally {
      setStatementLoading(false);
    }
  }

  if (!canManage) {
    return (
      <section className="panel empty-state">
        <Landmark size={46} />
        <h2>
          Management access required
        </h2>
        <p>
          Only an owner, admin or manager can
          use Supplier Payables.
        </p>
      </section>
    );
  }

  const summary = workspace.summary || {};
  const usd = summary.usd || {};
  const khr = summary.khr || {};

  return (
    <div className="page-stack supplier-payables-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            ACCOUNTS PAYABLE
          </p>
          <h1>Supplier Payables</h1>
          <p className="muted">
            Track due purchases, supplier credits,
            aging, payments and printable
            statements.
          </p>
        </div>

        <div className="page-heading-actions">
          <Link
            to="/purchase-orders"
            className="secondary-button"
          >
            <Landmark size={18} />
            Purchase orders
          </Link>

          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              downloadSupplierPayablesCsv(
                visibleInvoices,
                `supplier-payables-${asOf}.csv`
              )
            }
            disabled={
              visibleInvoices.length === 0
            }
          >
            <Download size={18} />
            Export CSV
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
          onClick={() =>
            setMessage("")
          }
        >
          {message}
        </div>
      )}

      <div className="supplier-payable-metrics">
        <article>
          <span>USD outstanding</span>
          <strong>
            {money(
              usd.total || 0,
              "USD"
            )}
          </strong>
          <small>
            {money(
              usd.current || 0,
              "USD"
            )}
            {" current"}
          </small>
        </article>

        <article className="overdue">
          <span>USD overdue</span>
          <strong>
            {money(
              usd.overdue || 0,
              "USD"
            )}
          </strong>
          <small>
            {money(
              usd.over_90 || 0,
              "USD"
            )}
            {" over 90 days"}
          </small>
        </article>

        <article>
          <span>KHR outstanding</span>
          <strong>
            {money(
              khr.total || 0,
              "KHR"
            )}
          </strong>
          <small>
            {money(
              khr.current || 0,
              "KHR"
            )}
            {" current"}
          </small>
        </article>

        <article className="overdue">
          <span>KHR overdue</span>
          <strong>
            {money(
              khr.overdue || 0,
              "KHR"
            )}
          </strong>
          <small>
            {money(
              khr.over_90 || 0,
              "KHR"
            )}
            {" over 90 days"}
          </small>
        </article>

        <article>
          <span>Open purchases</span>
          <strong>
            {Number(
              summary.open_invoice_count
              || 0
            ).toLocaleString("en-US")}
          </strong>
        </article>

        <article className="overdue">
          <span>Overdue purchases</span>
          <strong>
            {Number(
              summary.overdue_invoice_count
              || 0
            ).toLocaleString("en-US")}
          </strong>
        </article>
      </div>

      <section className="panel supplier-payable-filter-panel">
        <div className="search-box">
          <Search size={18} />
          <input
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value
              )
            }
            placeholder="Search supplier, code, phone, email or tax ID"
          />
        </div>

        <label>
          <span>Currency</span>
          <select
            value={currency}
            onChange={(event) =>
              setCurrency(
                event.target.value
              )
            }
          >
            <option value="">
              USD and KHR
            </option>
            <option value="USD">
              USD
            </option>
            <option value="KHR">
              KHR
            </option>
          </select>
        </label>

        <label>
          <span>Aging status</span>
          <select
            value={aging}
            onChange={(event) =>
              setAging(
                event.target.value
              )
            }
          >
            <option value="">
              All open balances
            </option>
            <option value="current">
              Current
            </option>
            <option value="overdue">
              Overdue
            </option>
          </select>
        </label>

        <label>
          <span>As of</span>
          <input
            type="date"
            value={asOf}
            onChange={(event) =>
              setAsOf(
                event.target.value
              )
            }
          />
        </label>

        {canAllBranches && (
          <label>
            <span>Scope</span>
            <select
              value={
                allBranches
                  ? "all"
                  : "current"
              }
              onChange={(event) =>
                setAllBranches(
                  event.target.value
                    === "all"
                )
              }
            >
              <option value="current">
                Current branch
              </option>
              <option value="all">
                All branches
              </option>
            </select>
          </label>
        )}
      </section>

      <section className="panel supplier-statement-range">
        <div>
          <CalendarClock size={21} />
          <div>
            <strong>
              Statement date range
            </strong>
            <span>
              Used when opening a supplier
              statement.
            </span>
          </div>
        </div>

        <label>
          <span>From</span>
          <input
            type="date"
            value={statementFrom}
            onChange={(event) =>
              setStatementFrom(
                event.target.value
              )
            }
          />
        </label>

        <label>
          <span>To</span>
          <input
            type="date"
            value={statementTo}
            onChange={(event) =>
              setStatementTo(
                event.target.value
              )
            }
          />
        </label>
      </section>

      <section className="panel supplier-balance-panel">
        <div className="panel-title-row">
          <div>
            <p className="eyebrow">
              SUPPLIERS
            </p>
            <h2>Outstanding balances</h2>
            <span className="muted">
              {visibleSuppliers.length}
              {" supplier"}
              {visibleSuppliers.length === 1
                ? ""
                : "s"}
            </span>
          </div>
          <HandCoins size={22} />
        </div>

        {loading ? (
          <div className="empty-state">
            <RefreshCw
              className="spin"
              size={34}
            />
            <p>
              Loading supplier balances...
            </p>
          </div>
        ) : visibleSuppliers.length === 0 ? (
          <div className="empty-state">
            <Landmark size={46} />
            <h2>
              No matching supplier balance
            </h2>
            <p>
              Change the search or filters.
            </p>
          </div>
        ) : (
          <div className="supplier-balance-table-wrap">
            <table className="supplier-balance-table">
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th>Terms</th>
                  <th>Open</th>
                  <th>Oldest due</th>
                  <th>USD balance</th>
                  <th>KHR balance</th>
                  <th>Overdue</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {visibleSuppliers.map(
                  (supplier) => {
                    const currentBalance =
                      currentBranchBalance(
                        supplier
                      );

                    return (
                      <tr
                        key={
                          supplier.supplier_id
                        }
                      >
                        <td data-label="Supplier">
                          <strong>
                            {supplier.name}
                          </strong>
                          <small>
                            {[
                              supplier.supplier_code,
                              supplier.phone,
                              supplier.contact_name
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </small>
                        </td>

                        <td data-label="Terms">
                          <strong>
                            {
                              supplier
                                .default_payment_terms_days
                            }
                            {" days"}
                          </strong>
                        </td>

                        <td data-label="Open">
                          {Number(
                            supplier.open_invoice_count
                            || 0
                          )}
                        </td>

                        <td data-label="Oldest due">
                          {payableDate(
                            supplier.oldest_due_date
                          )}
                        </td>

                        <td data-label="USD balance">
                          <strong>
                            {money(
                              supplier.usd_balance,
                              "USD"
                            )}
                          </strong>
                          <small>
                            {money(
                              supplier.usd_overdue,
                              "USD"
                            )}
                            {" overdue"}
                          </small>
                        </td>

                        <td data-label="KHR balance">
                          <strong>
                            {money(
                              supplier.khr_balance,
                              "KHR"
                            )}
                          </strong>
                          <small>
                            {money(
                              supplier.khr_overdue,
                              "KHR"
                            )}
                            {" overdue"}
                          </small>
                        </td>

                        <td data-label="Overdue">
                          <span
                            className={`payable-overdue-count ${
                              Number(
                                supplier.overdue_invoice_count
                                || 0
                              ) > 0
                                ? "active"
                                : ""
                            }`}
                          >
                            {Number(
                              supplier.overdue_invoice_count
                              || 0
                            )}
                          </span>
                        </td>

                        <td data-label="Actions">
                          <div className="supplier-payable-actions">
                            <button
                              type="button"
                              className="icon-button"
                              onClick={() =>
                                setPaymentSupplier(
                                  supplier
                                )
                              }
                              disabled={
                                currentBalance <= 0
                              }
                              title={
                                currentBalance > 0
                                  ? "Record payment for the current branch"
                                  : "No unpaid balance in your current branch"
                              }
                            >
                              <HandCoins
                                size={18}
                              />
                            </button>

                            <button
                              type="button"
                              className="icon-button"
                              onClick={() =>
                                openStatement(
                                  supplier
                                )
                              }
                              title="View supplier statement"
                            >
                              <Eye size={18} />
                            </button>

                            <button
                              type="button"
                              className="icon-button"
                              onClick={() =>
                                setTermsSupplier(
                                  supplier
                                )
                              }
                              title="Edit payment terms"
                            >
                              <Settings2
                                size={18}
                              />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel supplier-open-invoices-panel">
        <div className="panel-title-row">
          <div>
            <p className="eyebrow">
              AGING DETAIL
            </p>
            <h2>Open purchases</h2>
            <span className="muted">
              {visibleInvoices.length}
              {" record"}
              {visibleInvoices.length === 1
                ? ""
                : "s"}
            </span>
          </div>
          <CalendarClock size={22} />
        </div>

        {visibleInvoices.length === 0 ? (
          <p className="muted">
            No open purchases match the
            current filters.
          </p>
        ) : (
          <div className="supplier-invoice-table-wrap">
            <table className="supplier-invoice-table">
              <thead>
                <tr>
                  <th>Purchase</th>
                  <th>Supplier</th>
                  {allBranches && <th>Branch</th>}
                  <th>Due date</th>
                  <th>Aging</th>
                  <th>Total</th>
                  <th>Paid</th>
                  <th>Return credit</th>
                  <th>Balance</th>
                </tr>
              </thead>

              <tbody>
                {visibleInvoices.map(
                  (invoice) => (
                    <tr key={invoice.id}>
                      <td data-label="Purchase">
                        <strong>
                          {
                            invoice.purchase_number
                          }
                        </strong>
                        <small>
                          {invoice
                            .supplier_invoice_number
                            || "No supplier invoice"}
                        </small>
                      </td>

                      <td data-label="Supplier">
                        {
                          invoice.supplier_name
                        }
                      </td>

                      {allBranches && (
                        <td data-label="Branch">
                          {invoice.branch_name}
                        </td>
                      )}

                      <td data-label="Due date">
                        {payableDate(
                          invoice.due_date
                        )}
                      </td>

                      <td data-label="Aging">
                        <span
                          className={`payable-aging ${agingClass(
                            invoice.aging_bucket
                          )}`}
                        >
                          {agingLabel(
                            invoice.aging_bucket
                          )}
                        </span>

                        {Number(
                          invoice.days_overdue
                          || 0
                        ) > 0 && (
                          <small>
                            {invoice.days_overdue}
                            {" days overdue"}
                          </small>
                        )}
                      </td>

                      <td data-label="Total">
                        {money(
                          invoice.total_amount,
                          invoice.currency
                        )}
                      </td>

                      <td data-label="Paid">
                        {money(
                          invoice.amount_paid,
                          invoice.currency
                        )}
                      </td>

                      <td data-label="Return credit">
                        {money(
                          invoice.return_credit,
                          invoice.currency
                        )}
                      </td>

                      <td data-label="Balance">
                        <strong>
                          {money(
                            invoice.balance_due,
                            invoice.currency
                          )}
                        </strong>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel supplier-recent-payments-panel">
        <div className="panel-title-row">
          <div>
            <p className="eyebrow">
              PAYMENT HISTORY
            </p>
            <h2>Recent allocations</h2>
          </div>
          <HandCoins size={22} />
        </div>

        {(workspace.recent_payments || [])
          .length === 0 ? (
          <p className="muted">
            No supplier payments yet.
          </p>
        ) : (
          <div className="supplier-payment-history-list">
            {workspace.recent_payments
              .slice(0, 30)
              .map((payment) => (
                <article key={payment.id}>
                  <div>
                    <strong>
                      {payment.payment_number
                        || payment.purchase_number}
                    </strong>
                    <span>
                      {payment.supplier_name}
                      {" · "}
                      {payment.purchase_number}
                    </span>
                  </div>

                  <div>
                    <strong>
                      {money(
                        payment.amount,
                        payment.currency
                      )}
                    </strong>
                    <span>
                      {payableMethodLabel(
                        payment.method
                      )}
                      {payment.reference_number
                        ? ` · ${payment.reference_number}`
                        : ""}
                    </span>
                  </div>

                  <div>
                    <strong>
                      {payment.branch_name}
                    </strong>
                    <span>
                      {payableDateTime(
                        payment.paid_at
                      )}
                    </span>
                  </div>
                </article>
              ))}
          </div>
        )}
      </section>

      <SupplierPaymentModal
        supplier={paymentSupplier}
        invoices={workspace.invoices}
        currentBranchId={
          profile?.branch_id
        }
        currentBranchName={
          profile?.branches?.name
        }
        busy={busy === "payment"}
        onClose={() =>
          setPaymentSupplier(null)
        }
        onSubmit={handlePayment}
      />

      <SupplierTermsModal
        supplier={termsSupplier}
        canAllBranches={canAllBranches}
        busy={busy === "terms"}
        onClose={() =>
          setTermsSupplier(null)
        }
        onSave={handleTerms}
      />

      <SupplierStatementModal
        statement={statement}
        loading={statementLoading}
        shop={shop}
        onClose={() => {
          setStatement(null);
          setStatementLoading(false);
        }}
      />
    </div>
  );
}
