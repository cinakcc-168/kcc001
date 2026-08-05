import { Download, ExternalLink, ReceiptText } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  cloudinaryDownloadUrl,
  onlineDate,
  onlineDateTime,
  onlineMoney,
  onlineStatusLabel
} from "../lib/onlineStore";

const nextStatuses = [
  ["preparing", "Preparing"],
  ["ready", "Ready for customer"],
  ["partially_fulfilled", "Partially fulfilled"],
  ["fulfilled", "Fulfilled"],
  ["cancelled", "Cancelled"],
  ["rejected", "Rejected"]
];

export default function OnlineOrderDetailModal({
  order,
  busy,
  canReceive,
  canManage,
  canFulfill,
  onClose,
  onConfirm,
  onStatus,
  onOpenSalesOrder
}) {
  const [note, setNote] = useState("");
  const [status, setStatus] = useState(order?.status === "confirmed" ? "preparing" : "ready");
  const closed = useMemo(
    () => ["fulfilled", "cancelled", "rejected"].includes(order?.status),
    [order?.status]
  );

  useEffect(() => {
    if (!order) return;
    setNote("");
    setStatus(order.status === "confirmed" ? "preparing" : "ready");
  }, [order?.id, order?.status]);

  if (!order) return null;

  async function changeStatus() {
    await onStatus(order.id, status, note);
    setNote("");
  }

  return (
    <div className="modal-backdrop">
      <div className="modal wide online-order-detail">
        <div className="modal-head">
          <div>
            <p className="eyebrow">CUSTOMER WEB ORDER</p>
            <h2>{order.order_number}</h2>
            <span className={`status-badge ${order.status}`}>{onlineStatusLabel(order.status)}</span>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="online-order-summary-grid">
          <div><small>Customer</small><strong>{order.customer_name}</strong><span>{order.customer_phone}</span>{order.customer_email && <span>{order.customer_email}</span>}</div>
          <div><small>Fulfilment</small><strong>{order.fulfilment_type === "delivery" ? "Delivery" : "Branch pickup"}</strong><span>Requested: {onlineDate(order.requested_date)}</span></div>
          <div><small>Payment</small><strong>{String(order.payment_method).replaceAll("_", " ")}</strong><span>{String(order.payment_status).replaceAll("_", " ")}</span>{order.bank_reference && <span>Ref: {order.bank_reference}</span>}</div>
          <div><small>Created</small><strong>{onlineDateTime(order.created_at)}</strong><span>{order.branches?.name || "Current branch"}</span></div>
        </div>

        {order.bank_slip_url && (
          <section className="online-bank-slip-card">
            <img src={order.bank_slip_url} alt="Customer bank slip" />
            <div>
              <p className="eyebrow">BANK TRANSFER EVIDENCE</p>
              <h3>Customer payment slip</h3>
              <p>Review this evidence before receiving the order. The payment remains pending confirmation until staff verifies it.</p>
              <div className="button-row">
                <a className="secondary-button" href={order.bank_slip_url} target="_blank" rel="noreferrer"><ExternalLink size={17} />View slip</a>
                <a className="secondary-button" href={cloudinaryDownloadUrl(order.bank_slip_url)} target="_blank" rel="noreferrer"><Download size={17} />Download</a>
              </div>
            </div>
          </section>
        )}

        {order.delivery_address && <section className="online-order-note"><strong>Delivery address</strong><p>{order.delivery_address}</p></section>}
        {order.customer_note && <section className="online-order-note"><strong>Customer note</strong><p>{order.customer_note}</p></section>}

        <div className="table-wrap online-order-items-wrap">
          <table>
            <thead><tr><th>Product</th><th>Unit</th><th className="right">Qty</th><th className="right">Price</th><th className="right">Total</th></tr></thead>
            <tbody>
              {(order.online_order_items || []).map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.product_name}</strong><small>{item.sku || item.barcode || ""}</small></td>
                  <td>{item.unit_name}</td>
                  <td className="right">{item.quantity}</td>
                  <td className="right">{onlineMoney(item.unit_price, order.currency)}</td>
                  <td className="right">{onlineMoney(item.line_total, order.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="online-order-totals">
          <div><span>Subtotal</span><strong>{onlineMoney(order.subtotal, order.currency)}</strong></div>
          <div><span>Delivery fee</span><strong>{onlineMoney(order.delivery_fee, order.currency)}</strong></div>
          <div className="grand"><span>Total</span><strong>{onlineMoney(order.total_amount, order.currency)}</strong></div>
        </div>

        {(order.online_order_status_history || []).length > 0 && (
          <section className="online-status-history">
            <h3>Status history</h3>
            {(order.online_order_status_history || []).map((entry) => (
              <div key={entry.id}><span className={`status-dot ${entry.to_status}`} /><div><strong>{onlineStatusLabel(entry.to_status)}</strong><small>{onlineDateTime(entry.changed_at)}</small>{entry.note && <p>{entry.note}</p>}</div></div>
            ))}
          </section>
        )}

        {(canReceive || (canFulfill && order.sales_order_id) || canManage) && !closed && (
          <section className="online-order-actions">
            {canReceive && order.status === "pending" && (
              <button type="button" onClick={() => onConfirm(order.id)} disabled={busy}>
                <ReceiptText size={18} /> Receive order & reserve stock
              </button>
            )}

            {canFulfill && order.sales_order_id && (
              <button type="button" className="secondary" onClick={() => onOpenSalesOrder(order.sales_order_id)}>
                Open Sales Order / issue receipt
              </button>
            )}

            {canManage && (
              <div className="online-status-editor">
                <select value={status} onChange={(event) => setStatus(event.target.value)}>
                  {nextStatuses.filter(([value]) => value !== order.status).map(([value, itemLabel]) => <option value={value} key={value}>{itemLabel}</option>)}
                </select>
                <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Status note or cancellation reason" />
                <button type="button" className="secondary" onClick={changeStatus} disabled={busy}>Update status</button>
              </div>
            )}
          </section>
        )}

        <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}
