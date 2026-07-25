import { useEffect, useMemo, useState } from "react";
import { Banknote, Building2, CreditCard, QrCode, Wallet } from "lucide-react";
import Modal from "./Modal";
import { money } from "../lib/catalog";

const methods = [
  ["cash", "Cash", Banknote],
  ["bank", "Bank", Building2],
  ["khqr", "KHQR", QrCode],
  ["card", "Card", CreditCard],
  ["other", "Other", Wallet]
];

export default function PaymentModal({
  open,
  busy,
  totals,
  currency,
  customerName,
  onClose,
  onSubmit
}) {
  const [method, setMethod] = useState("cash");
  const [amountReceived, setAmountReceived] = useState("");
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setMethod("cash");
    setAmountReceived(String(totals.total));
    setReference("");
    setError("");
  }, [open, totals.total]);

  useEffect(() => {
    if (method !== "cash") setAmountReceived(String(totals.total));
  }, [method, totals.total]);

  const change = useMemo(
    () => method === "cash"
      ? Math.max(0, Number(amountReceived || 0) - Number(totals.total || 0))
      : 0,
    [method, amountReceived, totals.total]
  );

  if (!open) return null;

  function submit(event) {
    event.preventDefault();
    setError("");
    const received = Number(amountReceived || 0);

    if (!Number.isFinite(received) || received < Number(totals.total)) {
      setError(`Amount received must be at least ${money(totals.total, currency)}.`);
      return;
    }

    onSubmit({
      payment_method: method,
      amount_received: received,
      payment_reference: reference.trim()
    });
  }

  const roundedUp = Math.ceil(Number(totals.total || 0));
  const cashIncrements = currency === "KHR" ? [1000, 5000, 10000] : [10, 20, 50];

  return (
    <Modal title="Complete payment" onClose={() => !busy && onClose()}>
      <form className="payment-form" onSubmit={submit}>
        <div className="payment-total-card">
          <span>Amount due</span>
          <strong>{money(totals.total, currency)}</strong>
          <small>{customerName || "Walk-in customer"}</small>
        </div>

        <div className="payment-method-grid">
          {methods.map(([value, label, Icon]) => (
            <button
              type="button"
              key={value}
              className={method === value ? "active" : ""}
              onClick={() => setMethod(value)}
            >
              <Icon size={22} />
              <span>{label}</span>
            </button>
          ))}
        </div>

        <label>
          <span>{method === "cash" ? "Cash received" : "Amount paid"}</span>
          <input
            type="number"
            min={totals.total}
            step="0.01"
            value={amountReceived}
            onChange={(event) => setAmountReceived(event.target.value)}
            disabled={method !== "cash"}
            autoFocus
          />
        </label>

        {method === "cash" && (
          <div className="cash-shortcuts">
            <button type="button" onClick={() => setAmountReceived(String(totals.total))}>Exact</button>
            {roundedUp > Number(totals.total) && (
              <button type="button" onClick={() => setAmountReceived(String(roundedUp))}>
                {money(roundedUp, currency)}
              </button>
            )}
            {cashIncrements.map((increment) => (
              <button
                type="button"
                key={increment}
                onClick={() => setAmountReceived(String(roundedUp + increment))}
              >
                {money(roundedUp + increment, currency)}
              </button>
            ))}
          </div>
        )}

        {method !== "cash" && (
          <label>
            <span>Reference number</span>
            <input
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="Optional bank, KHQR or card reference"
            />
          </label>
        )}

        <div className="payment-change-row">
          <span>Change</span>
          <strong>{money(change, currency)}</strong>
        </div>

        {error && <div className="notice error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="primary-button" disabled={busy}>
            {busy ? "Completing..." : "Complete sale"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
