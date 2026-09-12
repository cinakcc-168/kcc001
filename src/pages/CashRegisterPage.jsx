import {
  Banknote,
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
import { useLanguage } from "../context/LanguageContext";
import CashRegisterCloseModal from "../components/CashRegisterCloseModal";
import CashRegisterReportModal from "../components/CashRegisterReportModal";
import ResponsiveDataList from "../components/ResponsiveDataList";
import DateRangePresetFields from "../components/DateRangePresetFields";
import { money } from "../lib/catalog";
import {
  closeCashRegister,
  defaultRegisterDates,
  getCashRegisterSessionSummary,
  loadCashRegisterWorkspace,
  openCashRegister
} from "../lib/cashRegister";
import { notifyTelegramEvent } from "../lib/telegram";

function dateTime(value, language = "en") {
  if (!value) return "—";

  return new Intl.DateTimeFormat(language === "km" ? "km-KH" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function value(summary, currency, field) {
  return Number(summary?.totals?.[currency]?.[field] || 0);
}

function DrawerBreakdown({ summary, currency, t }) {
  const rows = [
    [t("Opening cash"), "opening", "plus"],
    [t("Cash sales"), "cash_sales", "plus"],
    [t("Cash refunds"), "cash_refunds", "minus"],
    [t("Other cash in"), "cash_income", "plus"],
    [t("Cash expenses"), "cash_expenses", "minus"],
    [t("Supplier payments"), "supplier_payments", "minus"]
  ];

  return (
    <section className="register-drawer-panel panel">
      <div className="panel-title-row">
        <div>
          <p className="eyebrow">{t(`${currency} DRAWER`)}</p>
          <h2>{money(value(summary, currency, "expected"), currency)}</h2>
          <span className="muted">{t("Expected cash now")}</span>
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
  const { supabase, session, profile, shop, canAny, can } = useAuth();
  const { t, language } = useLanguage();
  const canOverride = can("cash_register.override");
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
      announce("error", t("Register name is required."));
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
        `${result.session.session_number} ${t("opened. Cash payments are now available.")}`
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
        `${result.session.session_number} ${t("closed successfully.")}`
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

  async function openOverrideClose(sessionId) {
    if (!canOverride) {
      announce("error", t("Cash-register override permission is required."));
      return;
    }

    try {
      setBusy(`prepare-close-${sessionId}`);
      const result = await getCashRegisterSessionSummary(
        supabase,
        sessionId
      );
      if (!result?.session || result.session.status !== "open") {
        announce("error", t("That register session is no longer open."));
        await refresh();
        return;
      }
      setOpenSummary(result);
      setCloseOpen(true);
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
        <h2>{t("Cash register access is restricted")}</h2>
        <p>
          {t("Only an owner, admin, manager or cashier can operate a register.")}
        </p>
      </section>
    );
  }

  return (
    <div className="page-stack cash-register-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t("CASH CONTROL")}</p>
          <h1>{t("Cash Register")}</h1>
          <p className="muted">
            {t("Open the drawer, track expected cash and close the shift with a counted balance.")}
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
          {t("Refresh")}
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
              <p className="eyebrow">{t("REGISTER OPEN")}</p>
              <h2>{activeSession.session_number}</h2>
              <span>
                {activeSession.register_name}
                {" · "}
                {t("Opened")}
                {" "}
                {dateTime(activeSession.opened_at, language)}
              </span>
            </div>

            <div className="open-register-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setReport(openSummary)}
              >
                <Eye size={18} />
                {t("View report")}
              </button>
              <button
                type="button"
                className="danger-button"
                onClick={() => setCloseOpen(true)}
              >
                <LockKeyhole size={18} />
                {t("Close register")}
              </button>
            </div>
          </section>

          <div className="register-metrics">
            <article>
              <CircleDollarSign size={22} />
              <span>{t("Cash sales")}</span>
              <strong>
                {money(value(openSummary, "USD", "cash_sales"), "USD")}
              </strong>
              <small>
                {money(value(openSummary, "KHR", "cash_sales"), "KHR")}
              </small>
            </article>
            <article>
              <Scale size={22} />
              <span>{t("Cash refunds")}</span>
              <strong>
                {money(value(openSummary, "USD", "cash_refunds"), "USD")}
              </strong>
              <small>
                {money(value(openSummary, "KHR", "cash_refunds"), "KHR")}
              </small>
            </article>
            <article>
              <WalletCards size={22} />
              <span>{t("Cash expenses")}</span>
              <strong>
                {money(value(openSummary, "USD", "cash_expenses"), "USD")}
              </strong>
              <small>
                {money(value(openSummary, "KHR", "cash_expenses"), "KHR")}
              </small>
            </article>
            <article>
              <Banknote size={22} />
              <span>{t("Expected drawers")}</span>
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
              t={t}
            />
            <DrawerBreakdown
              summary={openSummary}
              currency="KHR"
              t={t}
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
              <p className="eyebrow">{t("REGISTER CLOSED")}</p>
              <h2>{t("Open a cash register")}</h2>
              <p className="muted">
                {t("Cash payments are disabled until a register is open. Bank, KHQR, card and other payment methods still work.")}
              </p>
            </div>
          </div>

          <form className="register-open-form" onSubmit={handleOpen}>
            <label>
              <span>{t("Register name")}</span>
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
              <span>{t("Opening USD cash")}</span>
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
              <span>{t("Opening KHR cash")}</span>
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
              <span>{t("Opening note")}</span>
              <textarea
                rows="3"
                value={opening.opening_note}
                onChange={(event) =>
                  setOpening((current) => ({
                    ...current,
                    opening_note: event.target.value
                  }))
                }
                placeholder={t("Optional handover or drawer note")}
              />
            </label>

            <button
              type="submit"
              className="primary-button"
              disabled={busy === "open"}
            >
              <UnlockKeyhole size={18} />
              {busy === "open"
                ? t("Opening register...")
                : t("Open register")}
            </button>
          </form>
        </section>
      )}

      <section className="panel register-history-filters-panel">
        <div className="register-history-summary">
          <div><span>{t("Closed sessions")}</span><strong>{historyTotals.sessions}</strong></div>
          <div><span>{t("Total USD variance")}</span><strong>{money(historyTotals.varianceUsd, "USD")}</strong></div>
          <div><span>{t("Total KHR variance")}</span><strong>{money(historyTotals.varianceKhr, "KHR")}</strong></div>
        </div>
        <div className="register-history-filters">
          <DateRangePresetFields
            from={filters.from}
            to={filters.to}
            onChange={(range) =>
              setFilters((current) => ({
                ...current,
                from: range.from,
                to: range.to
              }))
            }
          />
        </div>
      </section>

      <ResponsiveDataList
        storageKey="cash-register-sessions"
        title={t("Cash register sessions")}
        subtitle={`${filters.from} to ${filters.to} · ${profile?.branches?.name || t("Current branch")}`}
        rows={sessions}
        filename={`tiny-pos-cash-register-${filters.from}-to-${filters.to}.xls`}
        summary={[
          { label: t("Closed sessions"), value: historyTotals.sessions },
          { label: t("Total USD variance"), value: money(historyTotals.varianceUsd, "USD") },
          { label: t("Total KHR variance"), value: money(historyTotals.varianceKhr, "KHR") }
        ]}
        emptyTitle={loading ? t("Loading register history...") : t("No register sessions")}
        emptyText={t("Open the first cash register to begin shift tracking.")}
        columns={[
          { label: t("Session"), width: 170, documentValue: (row) => row.session_number, render: (row) => <><strong>{row.session_number}</strong><small>{row.register_name}</small></> },
          { label: t("Opened"), width: 150, documentValue: (row) => dateTime(row.opened_at, language), render: (row) => dateTime(row.opened_at, language) },
          { label: t("Closed"), width: 150, documentValue: (row) => dateTime(row.closed_at, language), render: (row) => dateTime(row.closed_at, language) },
          { label: t("Opened by"), width: 150, value: (row) => row.opened_by_profile?.full_name || t("POS Staff") },
          { label: t("Status"), width: 90, documentValue: (row) => t(row.status), render: (row) => <span className={`status-pill ${row.status === "open" ? "active" : "inactive"}`}>{t(row.status)}</span> },
          { label: t("Expected USD"), width: 110, documentValue: (row) => money(row.expected_cash_usd || 0, "USD"), render: (row) => money(row.expected_cash_usd || 0, "USD") },
          { label: t("Expected KHR"), width: 120, documentValue: (row) => money(row.expected_cash_khr || 0, "KHR"), render: (row) => money(row.expected_cash_khr || 0, "KHR") },
          { label: t("Variance USD"), width: 110, documentValue: (row) => row.status === "closed" ? money(row.variance_usd || 0, "USD") : "—", render: (row) => <strong className={Number(row.variance_usd || 0) === 0 ? "variance-balanced" : Number(row.variance_usd || 0) > 0 ? "variance-over" : "variance-short"}>{row.status === "closed" ? money(row.variance_usd || 0, "USD") : "—"}</strong> },
          { label: t("Variance KHR"), width: 120, documentValue: (row) => row.status === "closed" ? money(row.variance_khr || 0, "KHR") : "—", render: (row) => <strong className={Number(row.variance_khr || 0) === 0 ? "variance-balanced" : Number(row.variance_khr || 0) > 0 ? "variance-over" : "variance-short"}>{row.status === "closed" ? money(row.variance_khr || 0, "KHR") : "—"}</strong> },
          { label: t("Report"), actionsOnly: true, excludeDocument: true, render: (row) => (
            <div className="register-session-row-actions">
              <button type="button" className="icon-button" onClick={() => viewSession(row.id)} disabled={busy === `view-${row.id}`} title={t("View report")}><Eye size={18} /></button>
              {canOverride && row.status === "open" && (
                <button type="button" className="icon-button danger-text" onClick={() => openOverrideClose(row.id)} disabled={busy === `prepare-close-${row.id}`} title={t("Override close register")}><LockKeyhole size={18} /></button>
              )}
            </div>
          ) }
        ]}
        renderCard={(row) => <article className="responsive-data-card register-session-card"><header><div><strong>{row.session_number}</strong><small>{row.register_name}</small></div><span className={`status-pill ${row.status === "open" ? "active" : "inactive"}`}>{t(row.status)}</span></header><div><span>{t("Opened")}</span><strong>{dateTime(row.opened_at, language)}</strong></div><div><span>{t("Closed")}</span><strong>{dateTime(row.closed_at, language)}</strong></div><div><span>{t("Opened by")}</span><strong>{row.opened_by_profile?.full_name || t("POS Staff")}</strong></div><div><span>{t("Expected")}</span><strong>{money(row.expected_cash_usd || 0, "USD")}</strong><small>{money(row.expected_cash_khr || 0, "KHR")}</small></div><div><span>{t("Variance")}</span><strong>{row.status === "closed" ? money(row.variance_usd || 0, "USD") : "—"}</strong><small>{row.status === "closed" ? money(row.variance_khr || 0, "KHR") : "—"}</small></div><footer><button type="button" className="secondary-button compact-button" onClick={() => viewSession(row.id)} disabled={busy === `view-${row.id}`}><Eye size={18} />{t("View report")}</button>{canOverride && row.status === "open" && <button type="button" className="danger-button compact-button" onClick={() => openOverrideClose(row.id)} disabled={busy === `prepare-close-${row.id}`}><LockKeyhole size={17} />{t("Override close")}</button>}</footer></article>}
      />

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
