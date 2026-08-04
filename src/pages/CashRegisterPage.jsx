import {
  Banknote,
  CalendarDays,
  CircleDollarSign,
  Eye,
  LockKeyhole,
  RefreshCw,
  Scale,
  UnlockKeyhole,
  WalletCards
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import CashRegisterCloseModal from "../components/CashRegisterCloseModal";
import CashRegisterReportModal from "../components/CashRegisterReportModal";
import { money } from "../lib/catalog";
import {
  closeCashRegister,
  defaultRegisterDates,
  getCashRegisterSessionSummary,
  loadCashRegisterWorkspace,
  openCashRegister
} from "../lib/cashRegister";
import { notifyTelegramEvent } from "../lib/telegram";

function dateTime(value) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function value(summary, currency, field) {
  return Number(summary?.totals?.[currency]?.[field] || 0);
}

function DrawerBreakdown({ summary, currency }) {
  const rows = [
    ["Opening cash", "opening", "plus"],
    ["Cash sales", "cash_sales", "plus"],
    ["Cash refunds", "cash_refunds", "minus"],
    ["Other cash in", "cash_income", "plus"],
    ["Cash expenses", "cash_expenses", "minus"],
    ["Supplier payments", "supplier_payments", "minus"]
  ];

  return (
    <section className="register-drawer-panel panel">
      <div className="panel-title-row">
        <div>
          <p className="eyebrow">{currency} DRAWER</p>
          <h2>{money(value(summary, currency, "expected"), currency)}</h2>
          <span className="muted">Expected cash now</span>
        </div>
        <Banknote size={24} />
      </div>

      <div className="register-breakdown">
        {rows.map(([label, field, type]) => (
          <div key={field}>
            <span>{label}</span>
            <strong className={type}>
              {type === "minus" ? "−" : "+"}
              {money(Math.abs(value(summary, currency, field)), currency)}
            </strong>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function CashRegisterPage() {
  const { supabase, session, profile, shop, canAny } = useAuth();
  const canOperate = canAny([
    "cash_register.use",
    "cash_register.close"
  ]);

  const [filters, setFilters] = useState(defaultRegisterDates);
  const [openSummary, setOpenSummary] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [opening, setOpening] = useState({
    register_name: "Main Register",
    opening_cash_usd: "0",
    opening_cash_khr: "0",
    opening_note: ""
  });
  const [closeOpen, setCloseOpen] = useState(false);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");

  const refresh = useCallback(async () => {
    if (!supabase || !profile?.organization_id || !profile?.branch_id) {
      return;
    }

    try {
      setLoading(true);
      const workspace = await loadCashRegisterWorkspace(
        supabase,
        profile,
        filters
      );

      setOpenSummary(workspace.openSummary);
      setSessions(workspace.sessions);
    } catch (error) {
      setMessageType("error");
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }, [supabase, profile, filters]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const activeSession = openSummary?.session || null;

  const historyTotals = useMemo(() => {
    const closed = sessions.filter(
      (session) => session.status === "closed"
    );

    return {
      sessions: closed.length,
      varianceUsd: closed.reduce(
        (sum, session) =>
          sum + Number(session.variance_usd || 0),
        0
      ),
      varianceKhr: closed.reduce(
        (sum, session) =>
          sum + Number(session.variance_khr || 0),
        0
      )
    };
  }, [sessions]);

  function announce(type, text) {
    setMessageType(type);
    setMessage(text);
  }

  async function handleOpen(event) {
    event.preventDefault();

    if (!opening.register_name.trim()) {
      announce("error", "Register name is required.");
      return;
    }

    try {
      setBusy("open");
      const result = await openCashRegister(
        supabase,
        opening
      );

      setOpenSummary(result);
      void notifyTelegramEvent(session, "cash_register_opened", result.session.id);
      setOpening({
        register_name: "Main Register",
        opening_cash_usd: "0",
        opening_cash_khr: "0",
        opening_note: ""
      });
      announce(
        "success",
        `${result.session.session_number} opened. Cash payments are now available.`
      );
      await refresh();
    } catch (error) {
      announce("error", error.message);
    } finally {
      setBusy("");
    }
  }

  async function handleClose(values) {
    try {
      setBusy("close");
      const result = await closeCashRegister(
        supabase,
        values
      );

      setCloseOpen(false);
      void notifyTelegramEvent(session, "cash_register_closed", result.session.id);
      setReport(result);
      setOpenSummary(null);
      announce(
        "success",
        `${result.session.session_number} closed successfully.`
      );
      await refresh();
    } catch (error) {
      announce("error", error.message);
    } finally {
      setBusy("");
    }
  }

  async function viewSession(sessionId) {
    try {
      setBusy(`view-${sessionId}`);
      const result = await getCashRegisterSessionSummary(
        supabase,
        sessionId
      );
      setReport(result);
    } catch (error) {
      announce("error", error.message);
    } finally {
      setBusy("");
    }
  }

  if (!canOperate) {
    return (
      <section className="panel empty-state">
        <WalletCards size={46} />
        <h2>Cash register access is restricted</h2>
        <p>
          Only an owner, admin, manager or cashier can operate a
          register.
        </p>
      </section>
    );
  }

  return (
    <div className="page-stack cash-register-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">CASH CONTROL</p>
          <h1>Cash Register</h1>
          <p className="muted">
            Open the drawer, track expected cash and close the shift
            with a counted balance.
          </p>
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={refresh}
          disabled={loading}
        >
          <RefreshCw
            size={18}
            className={loading ? "spin" : ""}
          />
          Refresh
        </button>
      </div>

      {message && (
        <div className={`notice ${messageType}`}>
          {message}
        </div>
      )}

      {activeSession ? (
        <>
          <section className="panel open-register-banner">
            <div className="open-register-icon">
              <UnlockKeyhole size={26} />
            </div>
            <div>
              <p className="eyebrow">REGISTER OPEN</p>
              <h2>{activeSession.session_number}</h2>
              <span>
                {activeSession.register_name}
                {" · Opened "}
                {dateTime(activeSession.opened_at)}
              </span>
            </div>

            <div className="open-register-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setReport(openSummary)}
              >
                <Eye size={18} />
                View report
              </button>
              <button
                type="button"
                className="danger-button"
                onClick={() => setCloseOpen(true)}
              >
                <LockKeyhole size={18} />
                Close register
              </button>
            </div>
          </section>

          <div className="register-metrics">
            <article>
              <CircleDollarSign size={22} />
              <span>Cash sales</span>
              <strong>
                {money(value(openSummary, "USD", "cash_sales"), "USD")}
              </strong>
              <small>
                {money(value(openSummary, "KHR", "cash_sales"), "KHR")}
              </small>
            </article>
            <article>
              <Scale size={22} />
              <span>Cash refunds</span>
              <strong>
                {money(value(openSummary, "USD", "cash_refunds"), "USD")}
              </strong>
              <small>
                {money(value(openSummary, "KHR", "cash_refunds"), "KHR")}
              </small>
            </article>
            <article>
              <WalletCards size={22} />
              <span>Cash expenses</span>
              <strong>
                {money(value(openSummary, "USD", "cash_expenses"), "USD")}
              </strong>
              <small>
                {money(value(openSummary, "KHR", "cash_expenses"), "KHR")}
              </small>
            </article>
            <article>
              <Banknote size={22} />
              <span>Expected drawers</span>
              <strong>
                {money(value(openSummary, "USD", "expected"), "USD")}
              </strong>
              <small>
                {money(value(openSummary, "KHR", "expected"), "KHR")}
              </small>
            </article>
          </div>

          <div className="register-drawer-grid">
            <DrawerBreakdown
              summary={openSummary}
              currency="USD"
            />
            <DrawerBreakdown
              summary={openSummary}
              currency="KHR"
            />
          </div>
        </>
      ) : (
        <section className="panel register-open-panel">
          <div className="register-open-heading">
            <div className="open-register-icon closed">
              <LockKeyhole size={26} />
            </div>
            <div>
              <p className="eyebrow">REGISTER CLOSED</p>
              <h2>Open a cash register</h2>
              <p className="muted">
                Cash payments are disabled until a register is open.
                Bank, KHQR, card and other payment methods still work.
              </p>
            </div>
          </div>

          <form className="register-open-form" onSubmit={handleOpen}>
            <label>
              <span>Register name</span>
              <input
                value={opening.register_name}
                onChange={(event) =>
                  setOpening((current) => ({
                    ...current,
                    register_name: event.target.value
                  }))
                }
                placeholder="Main Register"
              />
            </label>

            <label>
              <span>Opening USD cash</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={opening.opening_cash_usd}
                onChange={(event) =>
                  setOpening((current) => ({
                    ...current,
                    opening_cash_usd: event.target.value
                  }))
                }
              />
            </label>

            <label>
              <span>Opening KHR cash</span>
              <input
                type="number"
                min="0"
                step="1"
                value={opening.opening_cash_khr}
                onChange={(event) =>
                  setOpening((current) => ({
                    ...current,
                    opening_cash_khr: event.target.value
                  }))
                }
              />
            </label>

            <label className="register-opening-note">
              <span>Opening note</span>
              <textarea
                rows="3"
                value={opening.opening_note}
                onChange={(event) =>
                  setOpening((current) => ({
                    ...current,
                    opening_note: event.target.value
                  }))
                }
                placeholder="Optional handover or drawer note"
              />
            </label>

            <button
              type="submit"
              className="primary-button"
              disabled={busy === "open"}
            >
              <UnlockKeyhole size={18} />
              {busy === "open"
                ? "Opening register..."
                : "Open register"}
            </button>
          </form>
        </section>
      )}

      <section className="panel register-history-panel">
        <div className="panel-title-row">
          <div>
            <p className="eyebrow">SHIFT HISTORY</p>
            <h2>Cash register sessions</h2>
          </div>
          <CalendarDays size={22} />
        </div>

        <div className="register-history-summary">
          <div>
            <span>Closed sessions</span>
            <strong>{historyTotals.sessions}</strong>
          </div>
          <div>
            <span>Total USD variance</span>
            <strong>{money(historyTotals.varianceUsd, "USD")}</strong>
          </div>
          <div>
            <span>Total KHR variance</span>
            <strong>{money(historyTotals.varianceKhr, "KHR")}</strong>
          </div>
        </div>

        <div className="register-history-filters">
          <label>
            <span>From</span>
            <input
              type="date"
              value={filters.from}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  from: event.target.value
                }))
              }
            />
          </label>
          <label>
            <span>To</span>
            <input
              type="date"
              value={filters.to}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  to: event.target.value
                }))
              }
            />
          </label>
        </div>

        {loading ? (
          <div className="empty-state">
            <RefreshCw className="spin" />
            <p>Loading register history...</p>
          </div>
        ) : sessions.length === 0 ? (
          <div className="empty-state">
            <WalletCards size={44} />
            <h2>No register sessions</h2>
            <p>Open the first cash register to begin shift tracking.</p>
          </div>
        ) : (
          <div className="register-history-table-wrap">
            <table className="register-history-table">
              <thead>
                <tr>
                  <th>Session</th>
                  <th>Opened</th>
                  <th>Closed</th>
                  <th>Opened by</th>
                  <th>Status</th>
                  <th>Expected USD</th>
                  <th>Variance USD</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <tr key={session.id}>
                    <td data-label="Session">
                      <strong>{session.session_number}</strong>
                      <small>{session.register_name}</small>
                    </td>
                    <td data-label="Opened">
                      {dateTime(session.opened_at)}
                    </td>
                    <td data-label="Closed">
                      {dateTime(session.closed_at)}
                    </td>
                    <td data-label="Opened by">
                      {session.opened_by_profile?.full_name || "POS Staff"}
                    </td>
                    <td data-label="Status">
                      <span
                        className={`status-pill ${
                          session.status === "open"
                            ? "active"
                            : "inactive"
                        }`}
                      >
                        {session.status}
                      </span>
                    </td>
                    <td data-label="Expected USD">
                      {money(session.expected_cash_usd || 0, "USD")}
                    </td>
                    <td data-label="Variance USD">
                      <strong
                        className={
                          Number(session.variance_usd || 0) === 0
                            ? "variance-balanced"
                            : Number(session.variance_usd || 0) > 0
                              ? "variance-over"
                              : "variance-short"
                        }
                      >
                        {session.status === "closed"
                          ? money(session.variance_usd || 0, "USD")
                          : "—"}
                      </strong>
                    </td>
                    <td data-label="Report">
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => viewSession(session.id)}
                        disabled={busy === `view-${session.id}`}
                        title="View report"
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
      </section>

      <CashRegisterCloseModal
        summary={closeOpen ? openSummary : null}
        busy={busy === "close"}
        onClose={() => setCloseOpen(false)}
        onSubmit={handleClose}
      />

      <CashRegisterReportModal
        report={report}
        shop={shop}
        onClose={() => setReport(null)}
      />
    </div>
  );
}
