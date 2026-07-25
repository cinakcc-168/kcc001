import { useEffect, useMemo, useState } from "react";
import { RotateCcw, Undo2 } from "lucide-react";
import Modal from "./Modal";
import { money, stockNumber } from "../lib/catalog";
import { estimateRefund } from "../lib/returns";

const paymentMethods = [
  ["cash", "Cash"],
  ["bank", "Bank"],
  ["khqr", "KHQR"],
  ["card", "Card"],
  ["other", "Other"]
];

export default function RefundModal({
  sale,
  busy,
  onClose,
  onSubmit
}) {
  const [items, setItems] = useState([]);
  const [refundMethod, setRefundMethod] = useState(
    sale?.payments?.[0]?.method || "cash"
  );
  const [refundReference, setRefundReference] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!sale) return;

    setItems(
      (sale.sale_items || []).map((item) => ({
        sale_item_id: item.id,
        quantity: 0,
        restock: Boolean(item.product_id),
        available: Number(item.returnable_quantity || 0),
        product_name: item.product_name,
        unit_name: "pcs"
      }))
    );
    setRefundMethod(sale.payments?.[0]?.method || "cash");
    setRefundReference("");
    setReason("");
    setError("");
  }, [sale]);

  const selectedItems = useMemo(
    () =>
      items
        .filter((item) => Number(item.quantity || 0) > 0)
        .map((item) => ({
          sale_item_id: item.sale_item_id,
          quantity: Number(item.quantity),
          restock: item.restock
        })),
    [items]
  );

  const estimate = useMemo(
    () => estimateRefund(sale, selectedItems),
    [sale, selectedItems]
  );

  if (!sale) return null;

  function updateItem(saleItemId, changes) {
    setItems((current) =>
      current.map((item) =>
        item.sale_item_id === saleItemId
          ? { ...item, ...changes }
          : item
      )
    );
    setError("");
  }

  function selectAll() {
    setItems((current) =>
      current.map((item) => ({
        ...item,
        quantity: item.available
      }))
    );
  }

  function clearAll() {
    setItems((current) =>
      current.map((item) => ({
        ...item,
        quantity: 0
      }))
    );
  }

  async function submit(event) {
    event.preventDefault();
    setError("");

    if (selectedItems.length === 0) {
      setError("Choose at least one item and quantity to refund.");
      return;
    }

    for (const selected of selectedItems) {
      const source = items.find(
        (item) => item.sale_item_id === selected.sale_item_id
      );

      if (
        !Number.isFinite(selected.quantity)
        || selected.quantity <= 0
        || selected.quantity > source.available
      ) {
        setError(
          `Refund quantity for ${source.product_name} is not valid.`
        );
        return;
      }
    }

    if (reason.trim().length < 3) {
      setError("Enter a refund reason.");
      return;
    }

    await onSubmit({
      sale_id: sale.id,
      items: selectedItems,
      refund_method: refundMethod,
      refund_reference: refundReference,
      reason
    });
  }

  return (
    <Modal
      title={`Refund ${sale.invoice_number}`}
      onClose={onClose}
      wide
    >
      <form className="refund-form" onSubmit={submit}>
        <div className="refund-sale-summary">
          <div>
            <span>Customer</span>
            <strong>{sale.customers?.name || "Walk-in"}</strong>
          </div>
          <div>
            <span>Sale total</span>
            <strong>{money(sale.total_amount, sale.currency)}</strong>
          </div>
          <div>
            <span>Already refunded</span>
            <strong>{money(sale.refunded_amount, sale.currency)}</strong>
          </div>
          <div>
            <span>Status</span>
            <strong>{String(sale.status).replaceAll("_", " ")}</strong>
          </div>
        </div>

        <div className="refund-toolbar">
          <p className="muted">
            Enter only the quantity being returned now.
          </p>
          <div>
            <button
              type="button"
              className="secondary-button"
              onClick={clearAll}
            >
              Clear
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={selectAll}
            >
              <Undo2 size={17} />
              Select all remaining
            </button>
          </div>
        </div>

        <div className="refund-items">
          {(sale.sale_items || []).map((saleItem) => {
            const current = items.find(
              (item) => item.sale_item_id === saleItem.id
            );
            const available = Number(
              saleItem.returnable_quantity || 0
            );

            return (
              <article
                className={`refund-item ${available <= 0 ? "fully-refunded" : ""}`}
                key={saleItem.id}
              >
                <div className="refund-item-name">
                  <strong>{saleItem.product_name}</strong>
                  <span>
                    Sold {stockNumber(saleItem.quantity)}
                    {" · "}
                    Returned {stockNumber(saleItem.returned_quantity)}
                    {" · "}
                    Available {stockNumber(available)}
                  </span>
                </div>

                <label>
                  <span>Refund quantity</span>
                  <input
                    type="number"
                    min="0"
                    max={available}
                    step="0.001"
                    disabled={available <= 0}
                    value={current?.quantity ?? 0}
                    onChange={(event) =>
                      updateItem(saleItem.id, {
                        quantity: event.target.value
                      })
                    }
                  />
                </label>

                <label className="refund-restock">
                  <span>Return to stock</span>
                  <input
                    type="checkbox"
                    disabled={
                      available <= 0 || !saleItem.product_id
                    }
                    checked={Boolean(current?.restock)}
                    onChange={(event) =>
                      updateItem(saleItem.id, {
                        restock: event.target.checked
                      })
                    }
                  />
                </label>

                <div className="refund-line-value">
                  <span>Original line</span>
                  <strong>
                    {money(saleItem.line_total, sale.currency)}
                  </strong>
                </div>
              </article>
            );
          })}
        </div>

        <div className="refund-details-grid">
          <label>
            <span>Refund method</span>
            <select
              value={refundMethod}
              onChange={(event) => setRefundMethod(event.target.value)}
            >
              {paymentMethods.map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Reference number</span>
            <input
              value={refundReference}
              onChange={(event) =>
                setRefundReference(event.target.value)
              }
              placeholder="Optional bank or payment reference"
            />
          </label>

          <label className="refund-reason-field">
            <span>Reason</span>
            <textarea
              rows="3"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Why is the customer returning these items?"
            />
          </label>
        </div>

        <div className="refund-estimate">
          <div>
            <span>Net merchandise refund</span>
            <strong>{money(estimate.netRefund, sale.currency)}</strong>
          </div>
          <div>
            <span>Tax refund</span>
            <strong>{money(estimate.taxRefund, sale.currency)}</strong>
          </div>
          <div className="refund-estimate-total">
            <span>Estimated refund</span>
            <strong>{money(estimate.totalRefund, sale.currency)}</strong>
          </div>
        </div>

        {error && <div className="notice error">{error}</div>}

        <div className="modal-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="danger-button refund-submit"
            disabled={busy || selectedItems.length === 0}
          >
            <RotateCcw size={18} />
            {busy ? "Processing refund..." : "Process refund"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
