import {
  CheckCircle2,
  Clock3,
  Eye,
  FilePlus2,
  FileText,
  RefreshCw,
  Search,
  Send,
  ShoppingCart,
  XCircle
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";
import {
  Link,
  useNavigate
} from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import QuotePrintModal from "../components/QuotePrintModal";
import { money } from "../lib/catalog";
import {
  effectiveQuoteStatus,
  loadSalesQuotes,
  prepareQuoteForSale,
  quoteCanConvert,
  quoteCanEdit,
  quoteDate,
  quoteDateTime,
  quoteStatusLabel,
  updateSalesQuoteStatus
} from "../lib/quotes";

function monthRange() {
  const now = new Date();

  const first = new Date(
    now.getFullYear(),
    now.getMonth(),
    1
  );

  return {
    from: first.toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10)
  };
}

export default function QuotesPage() {
  const {
    supabase,
    profile,
    shop
  } = useAuth();

  const navigate = useNavigate();

  const canManage = [
    "owner",
    "admin",
    "manager",
    "cashier"
  ].includes(profile?.role);

  const defaults = monthRange();

  const [quotes, setQuotes] =
    useState([]);
  const [from, setFrom] =
    useState(defaults.from);
  const [to, setTo] =
    useState(defaults.to);
  const [search, setSearch] =
    useState("");
  const [status, setStatus] =
    useState("");
  const [selected, setSelected] =
    useState(null);
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

      const rows = await loadSalesQuotes(
        supabase,
        profile,
        { from, to }
      );

      setQuotes(rows);

      setSelected((current) => {
        if (!current) return null;

        return rows.find(
          (quote) =>
            quote.id === current.id
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
    from,
    to,
    canManage
  ]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const visible = useMemo(() => {
    const needle = search
      .trim()
      .toLowerCase();

    return quotes.filter((quote) => {
      const effective =
        effectiveQuoteStatus(quote);

      if (
        status
        && effective !== status
      ) {
        return false;
      }

      if (!needle) return true;

      return [
        quote.quote_number,
        quote.customers?.name,
        quote.customers?.customer_code,
        quote.customers?.phone,
        quote.coupon_code,
        ...(quote.sales_quote_items || [])
          .flatMap((item) => [
            item.product_name,
            item.sku,
            item.barcode
          ])
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [
    quotes,
    search,
    status
  ]);

  const metrics = useMemo(() => {
    const result = {
      draft: 0,
      sent: 0,
      accepted: 0,
      expired: 0,
      converted: 0,
      openUsd: 0,
      openKhr: 0
    };

    for (const quote of quotes) {
      const effective =
        effectiveQuoteStatus(quote);

      if (
        Object.prototype.hasOwnProperty.call(
          result,
          effective
        )
      ) {
        result[effective] += 1;
      }

      if (
        ["draft", "sent", "accepted"]
          .includes(effective)
      ) {
        if (quote.currency === "KHR") {
          result.openKhr += quote.total_amount;
        } else {
          result.openUsd += quote.total_amount;
        }
      }
    }

    return result;
  }, [quotes]);

  function announce(type, text) {
    setMessageType(type);
    setMessage(text);
  }

  function openInSale(quote) {
    try {
      prepareQuoteForSale(
        profile,
        quote
      );
      navigate("/sales");
    } catch (error) {
      announce("error", error.message);
    }
  }

  async function changeStatus(
    quote,
    nextStatus
  ) {
    let reason = "";

    if (nextStatus === "cancelled") {
      const answer = window.prompt(
        `Why are you cancelling ${quote.quote_number}?`
      );

      if (answer === null) return;

      if (answer.trim().length < 3) {
        announce(
          "error",
          "A cancellation reason is required."
        );
        return;
      }

      reason = answer;
    }

    try {
      setBusy(
        `${nextStatus}-${quote.id}`
      );

      await updateSalesQuoteStatus(
        supabase,
        quote.id,
        nextStatus,
        reason
      );

      announce(
        "success",
        `${quote.quote_number} marked ${quoteStatusLabel(
          nextStatus
        )}.`
      );

      await refresh();
    } catch (error) {
      announce("error", error.message);
    } finally {
      setBusy("");
    }
  }

  if (!canManage) {
    return (
      <section className="panel empty-state">
        <FileText size={46} />
        <h2>
          Sales access required
        </h2>
        <p>
          Your role cannot manage quotations.
        </p>
      </section>
    );
  }

  return (
    <div className="page-stack quotes-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            PRE-SALE DOCUMENTS
          </p>
          <h1>
            Quotations & Proforma
          </h1>
          <p className="muted">
            Prepare, print, approve and convert
            customer quotations without changing
            stock.
          </p>
        </div>

        <div className="page-heading-actions">
          <Link
            to="/sales"
            className="primary-button"
          >
            <FilePlus2 size={18} />
            New quotation
          </Link>

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

      <div className="quote-metrics">
        <article>
          <FileText size={21} />
          <span>Draft</span>
          <strong>{metrics.draft}</strong>
        </article>

        <article>
          <Send size={21} />
          <span>Sent</span>
          <strong>{metrics.sent}</strong>
        </article>

        <article>
          <CheckCircle2 size={21} />
          <span>Accepted</span>
          <strong>{metrics.accepted}</strong>
        </article>

        <article>
          <Clock3 size={21} />
          <span>Expired</span>
          <strong>{metrics.expired}</strong>
        </article>

        <article>
          <ShoppingCart size={21} />
          <span>Converted</span>
          <strong>{metrics.converted}</strong>
        </article>

        <article className="quote-open-value">
          <span>Open quotation value</span>
          <strong>
            {money(
              metrics.openUsd,
              "USD"
            )}
          </strong>
          <small>
            {money(
              metrics.openKhr,
              "KHR"
            )}
          </small>
        </article>
      </div>

      <section className="panel quote-filter-panel">
        <div className="search-box">
          <Search size={18} />
          <input
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value
              )
            }
            placeholder="Search quotation, customer, phone, product or code"
          />
        </div>

        <label>
          <span>From</span>
          <input
            type="date"
            value={from}
            onChange={(event) =>
              setFrom(event.target.value)
            }
          />
        </label>

        <label>
          <span>To</span>
          <input
            type="date"
            value={to}
            onChange={(event) =>
              setTo(event.target.value)
            }
          />
        </label>

        <label>
          <span>Status</span>
          <select
            value={status}
            onChange={(event) =>
              setStatus(
                event.target.value
              )
            }
          >
            <option value="">
              All statuses
            </option>
            <option value="draft">
              Draft
            </option>
            <option value="sent">
              Sent
            </option>
            <option value="accepted">
              Accepted
            </option>
            <option value="expired">
              Expired
            </option>
            <option value="converted">
              Converted
            </option>
            <option value="cancelled">
              Cancelled
            </option>
          </select>
        </label>
      </section>

      <section className="panel quote-list-panel">
        {loading ? (
          <div className="empty-state">
            <RefreshCw
              className="spin"
              size={35}
            />
            <p>Loading quotations...</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="empty-state">
            <FileText size={48} />
            <h2>No quotations found</h2>
            <p>
              Create a bill in New Sale and press
              Save Quote.
            </p>
          </div>
        ) : (
          <div className="quote-table-wrap">
            <table className="quote-table">
              <thead>
                <tr>
                  <th>Quotation</th>
                  <th>Customer</th>
                  <th>Created</th>
                  <th>Valid until</th>
                  <th>Status</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {visible.map((quote) => {
                  const effective =
                    effectiveQuoteStatus(quote);

                  return (
                    <tr key={quote.id}>
                      <td data-label="Quotation">
                        <strong>
                          {quote.quote_number}
                        </strong>

                        {quote.coupon_code && (
                          <small>
                            Coupon{" "}
                            {quote.coupon_code}
                          </small>
                        )}
                      </td>

                      <td data-label="Customer">
                        <strong>
                          {quote.customers?.name
                            || "Walk-in"}
                        </strong>

                        <small>
                          {quote.customers?.phone
                            || quote.customers
                              ?.customer_code
                            || "No customer contact"}
                        </small>
                      </td>

                      <td data-label="Created">
                        {quoteDateTime(
                          quote.created_at
                        )}
                      </td>

                      <td data-label="Valid until">
                        {quoteDate(
                          quote.valid_until
                        )}
                      </td>

                      <td data-label="Status">
                        <span
                          className={`quote-status ${effective}`}
                        >
                          {quoteStatusLabel(
                            effective
                          )}
                        </span>
                      </td>

                      <td data-label="Items">
                        {(
                          quote.sales_quote_items
                          || []
                        ).length}
                      </td>

                      <td data-label="Total">
                        <strong>
                          {money(
                            quote.total_amount,
                            quote.currency
                          )}
                        </strong>
                      </td>

                      <td data-label="Actions">
                        <div className="quote-row-actions">
                          <button
                            type="button"
                            className="icon-button"
                            onClick={() =>
                              setSelected(quote)
                            }
                            title="View and print"
                          >
                            <Eye size={18} />
                          </button>

                          {quoteCanConvert(quote) && (
                            <button
                              type="button"
                              className="icon-button"
                              onClick={() =>
                                openInSale(quote)
                              }
                              title={
                                quoteCanEdit(quote)
                                  ? "Edit or convert in New Sale"
                                  : "Convert in New Sale"
                              }
                            >
                              <ShoppingCart
                                size={18}
                              />
                            </button>
                          )}

                          {effective === "draft" && (
                            <button
                              type="button"
                              className="icon-button"
                              onClick={() =>
                                changeStatus(
                                  quote,
                                  "sent"
                                )
                              }
                              disabled={
                                busy
                                  === `sent-${quote.id}`
                              }
                              title="Mark sent"
                            >
                              <Send size={18} />
                            </button>
                          )}

                          {["draft", "sent"]
                            .includes(effective) && (
                            <button
                              type="button"
                              className="icon-button"
                              onClick={() =>
                                changeStatus(
                                  quote,
                                  "accepted"
                                )
                              }
                              disabled={
                                busy
                                  === `accepted-${quote.id}`
                              }
                              title="Mark accepted"
                            >
                              <CheckCircle2
                                size={18}
                              />
                            </button>
                          )}

                          {["draft", "sent", "accepted"]
                            .includes(effective) && (
                            <button
                              type="button"
                              className="icon-button danger-icon"
                              onClick={() =>
                                changeStatus(
                                  quote,
                                  "cancelled"
                                )
                              }
                              disabled={
                                busy
                                  === `cancelled-${quote.id}`
                              }
                              title="Cancel quotation"
                            >
                              <XCircle size={18} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <QuotePrintModal
        quote={selected}
        shop={shop}
        branch={profile?.branches}
        onClose={() =>
          setSelected(null)
        }
        onConvert={(quote) => {
          setSelected(null);
          openInSale(quote);
        }}
      />
    </div>
  );
}
