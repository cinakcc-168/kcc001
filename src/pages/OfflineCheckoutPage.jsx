import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, CloudDownload, CloudOff, RefreshCw } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { money } from "../lib/catalog";
import {
  getOfflineDevice,
  listOfflineSales,
  loadOfflineCheckoutBundle,
  offlineBundleExpired,
  prepareOfflineCheckout,
  setOfflineDeviceName,
  subscribeOfflineQueue,
  synchronizeOfflineSale
} from "../lib/offlineCheckout";

function dateTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function OfflineCheckoutPage() {
  const { supabase, profile, can } = useAuth();
  const { t } = useLanguage();
  const device = useMemo(() => getOfflineDevice(), []);
  const [deviceName, setDeviceName] = useState(device.name);
  const [validHours, setValidHours] = useState("24");
  const [bundle, setBundle] = useState(null);
  const [sales, setSales] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");

  const refresh = useCallback(async () => {
    if (!profile?.id) return;
    const [nextBundle, nextSales] = await Promise.all([
      loadOfflineCheckoutBundle(profile),
      listOfflineSales(profile)
    ]);
    setBundle(nextBundle);
    setSales(nextSales);
  }, [profile]);

  useEffect(() => {
    const unsubscribe = subscribeOfflineQueue(refresh);
    refresh();
    return unsubscribe;
  }, [refresh]);

  function announce(type, text) {
    setMessageType(type);
    setMessage(text);
  }

  async function handlePrepare() {
    if (!navigator.onLine) {
      announce("error", t("Reconnect before preparing a new offline bundle."));
      return;
    }
    try {
      setBusy(true);
      setOfflineDeviceName(deviceName);
      await prepareOfflineCheckout(supabase, profile, {
        device_name: deviceName,
        valid_hours: Number(validHours)
      });
      await refresh();
      announce("success", t("This device is ready for offline checkout."));
    } catch (error) {
      announce("error", error.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleSync(sale) {
    if (!navigator.onLine) {
      announce("error", t("Reconnect before synchronizing."));
      return;
    }
    try {
      setBusy(true);
      const result = await synchronizeOfflineSale(supabase, sale);
      await refresh();
      announce(result?.ok ? "success" : "error", result?.ok
        ? `${sale.local_receipt_number} → ${result.invoice_number}`
        : result?.error_message || t("The offline sale requires review."));
    } catch (error) {
      announce("error", error.message);
    } finally {
      setBusy(false);
    }
  }



  const pending = sales.filter((sale) => ["pending", "syncing"].includes(sale.status)).length;
  const conflicts = sales.filter((sale) => sale.status === "conflict").length;
  const synced = sales.filter((sale) => sale.status === "synced").length;

  return (
    <div className="page-stack offline-center-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t("SAFE OFFLINE SALES")}</span>
          <h1>{t("Offline Checkout Center")}</h1>
          <p>{t("Prepare this device while online, complete restricted sales without a connection, then synchronize safely.")}</p>
        </div>
      </div>

      {message && <div className={`notice ${messageType}`} onClick={() => setMessage("")}>{message}</div>}

      <div className="offline-metric-grid">
        <div className="metric-card"><span>{t("Pending sync")}</span><strong className="viz-stat-value">{pending}</strong></div>
        <div className="metric-card"><span>{t("Conflicts")}</span><strong className="viz-stat-value">{conflicts}</strong></div>
        <div className="metric-card"><span>{t("Synced on device")}</span><strong className="viz-stat-value">{synced}</strong></div>
        <div className="metric-card"><span>{t("Connection")}</span><strong>{navigator.onLine ? t("Online") : t("Offline")}</strong></div>
      </div>

      <section className="card offline-prepare-card">
        <div className="section-heading">
          <div><h2>{t("Prepare this device")}</h2><p>{t("Downloads a trusted product, customer, stock and receipt snapshot for the current branch.")}</p></div>
          {bundle && !offlineBundleExpired(bundle) ? <span className="status-pill success"><CheckCircle2 size={15} />{t("Ready")}</span> : <span className="status-pill warning"><CloudOff size={15} />{t("Not ready")}</span>}
        </div>

        <div className="form-grid three">
          <label><span>{t("Device name")}</span><input value={deviceName} onChange={(e) => setDeviceName(e.target.value)} /></label>
          <label><span>{t("Valid for")}</span><select value={validHours} onChange={(e) => setValidHours(e.target.value)}><option value="8">8 hours</option><option value="24">24 hours</option><option value="48">48 hours</option><option value="72">72 hours</option></select></label>
          <label><span>{t("Device ID")}</span><input value={device.id} readOnly /></label>
        </div>

        <div className="button-row">
          <button type="button" className="primary-button" disabled={busy || !navigator.onLine} onClick={handlePrepare}><CloudDownload size={18} />{busy ? t("Preparing…") : t("Prepare Offline Checkout")}</button>
        </div>

        {bundle && (
          <div className="offline-bundle-details">
            <div><span>{t("Prepared")}</span><strong>{dateTime(bundle.session?.prepared_at)}</strong></div>
            <div><span>{t("Expires")}</span><strong>{dateTime(bundle.session?.expires_at)}</strong></div>
            <div><span>{t("Products")}</span><strong>{bundle.catalog?.products?.length || 0}</strong></div>
            <div><span>{t("Customers")}</span><strong>{bundle.catalog?.customers?.length || 0}</strong></div>
            <div><span>{t("Cash register")}</span><strong>{bundle.settings?.cash_register_open ? t("Open at preparation") : t("Not open")}</strong></div>
          </div>
        )}
      </section>

      <section className="card">
        <div className="section-heading"><div><h2>{t("Device sale queue")}</h2><p>{t("A pending receipt is not a final server invoice until synchronization succeeds.")}</p></div></div>
        {sales.length === 0 ? (
          <div className="empty-state">{t("No offline sales are stored on this device.")}</div>
        ) : (
          <div className="table-wrap"><table><thead><tr><th>{t("Local receipt")}</th><th>{t("Created")}</th><th>{t("Payment")}</th><th>{t("Total")}</th><th>{t("Status")}</th><th>{t("Server invoice")}</th><th>{t("Action")}</th></tr></thead><tbody>
            {sales.map((sale) => (
              <tr key={sale.offline_sale_id}>
                <td data-label={t("Local receipt")}><strong>{sale.local_receipt_number}</strong></td>
                <td data-label={t("Created")}>{dateTime(sale.offline_created_at)}</td>
                <td data-label={t("Payment")}>{t(sale.payload?.payment_method || "—")}</td>
                <td data-label={t("Total")}>{money(sale.payload?.total_amount || 0, sale.payload?.currency || "USD")}</td>
                <td data-label={t("Status")}><span className={`status-pill ${sale.status === "synced" ? "success" : sale.status === "conflict" ? "danger" : "warning"}`}>{t(sale.status)}</span>{sale.error_message && <small className="offline-error"><AlertTriangle size={14} />{sale.error_message}</small>}</td>
                <td data-label={t("Server invoice")}>{sale.invoice_number || "—"}</td>
                <td data-label={t("Action")}><div className="icon-button-row">
                  {sale.status !== "synced" && <button type="button" className="icon-button" title={t("Synchronize now")} disabled={busy || !navigator.onLine} onClick={() => handleSync(sale)}><RefreshCw size={17} /></button>}
                </div></td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </section>

      <div className="notice warning offline-restriction-note">
        <AlertTriangle size={20} />
        <span>{t("Offline checkout supports cached products, cached customers and cash/bank/KHQR/card/other payments. Coupons, manual discounts, credit sales, new customers, quotations and Sales Order deliveries remain online-only. Stock and register rules are checked again during synchronization.")}</span>
      </div>
    </div>
  );
}
