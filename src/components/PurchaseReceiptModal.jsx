import {
  Box,
  CheckCircle2,
  PackageCheck
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState
} from "react";
import Modal from "./Modal";
import BatchAllocationEditor, { createBatchAllocation } from "./BatchAllocationEditor";
import {
  money,
  stockNumber
} from "../lib/catalog";
import {
  purchaseBalance,
  purchaseItemRemainingQuantity
} from "../lib/purchaseOrders";

const paymentMethods = [
  "cash",
  "bank",
  "khqr",
  "card",
  "other"
];

function localDateTimeValue() {
  const now = new Date();
  const local = new Date(
    now.getTime()
    - now.getTimezoneOffset() * 60000
  );
  return local.toISOString().slice(0, 16);
}

export default function PurchaseReceiptModal({
  purchase,
  busy,
  onClose,
  onSubmit
}) {
  const [quantities, setQuantities] =
    useState({});
  const [amountPaid, setAmountPaid] =
    useState("0");
  const [method, setMethod] =
    useState("cash");
  const [reference, setReference] =
    useState("");
  const [supplierInvoice, setSupplierInvoice] =
    useState("");
  const [receivedAt, setReceivedAt] =
    useState(localDateTimeValue());
  const [notes, setNotes] =
    useState("");
  const [batchAllocations, setBatchAllocations] =
    useState({});
  const [error, setError] =
    useState("");

  useEffect(() => {
    if (!purchase) return;

    setQuantities({});
    setAmountPaid("0");
    setMethod("cash");
    setReference("");
    setSupplierInvoice(
      purchase.supplier_invoice_number || ""
    );
    setReceivedAt(localDateTimeValue());
    setNotes("");
    setBatchAllocations({});
    setError("");
  }, [purchase]);

  const rows = useMemo(
    () =>
      (purchase?.purchase_items || [])
        .map((item) => ({
          item,
          remaining:
            purchaseItemRemainingQuantity(item),
          quantity: Number(
            quantities[item.id] || 0
          )
        }))
        .filter((row) => row.remaining > 0),
    [purchase, quantities]
  );

  const selectedRows = useMemo(
    () => rows.filter((row) => row.quantity > 0),
    [rows]
  );

  const receiptValue = useMemo(
    () =>
      selectedRows.reduce(
        (sum, row) =>
          sum
          + row.quantity
            * Number(row.item.unit_cost || 0),
        0
      ),
    [selectedRows]
  );

  if (!purchase) return null;

  const balance = purchaseBalance(purchase);
  const allRemainingSelected =
    rows.length > 0
    && rows.every(
      (row) =>
        Math.abs(
          row.quantity - row.remaining
        ) < 0.0005
    );

  function updateQuantity(itemId, value) {
    setQuantities((current) => ({ ...current, [itemId]: value }));
    const item = purchase.purchase_items.find((row) => row.id === itemId);
    if (item?.products?.batch_tracking && Number(value || 0) > 0 && !(batchAllocations[itemId] || []).length) {
      setBatchAllocations((current) => ({ ...current, [itemId]: [createBatchAllocation(item.products, receivedAt, value)] }));
    }
    setError("");
  }

  function receiveAllRemaining() {
    const next = {};

    for (const row of rows) {
      next[row.item.id] = String(row.remaining);
    }

    setQuantities(next);
    const nextBatches = {};
    for (const row of rows) {
      if (row.item.products?.batch_tracking) {
        nextBatches[row.item.id] = [createBatchAllocation(row.item.products, receivedAt, row.remaining)];
      }
    }
    setBatchAllocations(nextBatches);
    setError("");
  }

  function clearQuantities() {
    setQuantities({});
    setBatchAllocations({});
    setError("");
  }

  async function submit(event) {
    event.preventDefault();
    setError("");

    if (selectedRows.length === 0) {
      setError(
        "Enter a received quantity for at least one product."
      );
      return;
    }

    for (const row of selectedRows) {
      if (
        !Number.isFinite(row.quantity)
        || row.quantity <= 0
      ) {
        setError(
          `Enter a valid quantity for ${row.item.products?.name || "Product"}.`
        );
        return;
      }

      if (row.quantity > row.remaining + 0.0005) {
        setError(
          `${row.item.products?.name || "Product"} has only ${stockNumber(
            row.remaining
          )} ${row.item.purchase_unit_name || "units"} remaining.`
        );
        return;
      }
    }

    for (const row of selectedRows) {
      if (!row.item.products?.batch_tracking) continue;
      const batchRows = batchAllocations[row.item.id] || [];
      const batchTotal = batchRows.reduce((sum, batch) => sum + Number(batch.quantity || 0), 0);
      if (batchRows.length === 0 || Math.abs(batchTotal - row.quantity) > 0.0005) {
        setError(`Batch quantities for ${row.item.products?.name || "Product"} must total ${stockNumber(row.quantity)} ${row.item.purchase_unit_name}.`);
        return;
      }
      for (const batch of batchRows) {
        if (!batch.batch_number.trim() || !(Number(batch.quantity) > 0)) { setError(`Every batch for ${row.item.products?.name || "Product"} needs a lot number and quantity.`); return; }
        if (row.item.products.expiry_tracking && !batch.expiry_date) { setError(`Expiry date is required for ${row.item.products?.name || "Product"}.`); return; }
      }
    }

    const payment = Number(amountPaid || 0);

    if (
      !Number.isFinite(payment)
      || payment < 0
      || payment > balance + 0.005
    ) {
      setError(
        `Payment must be between ${money(
          0,
          purchase.currency
        )} and ${money(
          balance,
          purchase.currency
        )}.`
      );
      return;
    }

    if (!receivedAt) {
      setError("Choose the received date and time.");
      return;
    }

    const parsedDate = new Date(receivedAt);

    if (
      Number.isNaN(parsedDate.getTime())
      || parsedDate > new Date(Date.now() + 5 * 60000)
    ) {
      setError(
        "Received date and time are invalid or in the future."
      );
      return;
    }

    await onSubmit({
      purchase_id: purchase.id,
      items: selectedRows.map((row) => ({
        purchase_item_id: row.item.id,
        quantity: row.quantity,
        batches: batchAllocations[row.item.id] || []
      })),
      amount_paid: payment,
      payment_method: method,
      payment_reference: reference,
      supplier_invoice_number:
        supplierInvoice,
      received_at:
        parsedDate.toISOString(),
      notes
    });
  }

  return (
    <Modal
      title={`Receive ${purchase.purchase_number}`}
      onClose={onClose}
      wide
    >
      <form
        className="partial-receipt-form"
        onSubmit={submit}
      >
        <section className="partial-receipt-summary">
          <div>
            <span>Supplier</span>
            <strong>
              {purchase.suppliers?.name || "—"}
            </strong>
          </div>

          <div>
            <span>Order total</span>
            <strong>
              {money(
                purchase.total_amount,
                purchase.currency
              )}
            </strong>
          </div>

          <div>
            <span>Balance due</span>
            <strong>
              {money(
                balance,
                purchase.currency
              )}
            </strong>
          </div>

          <div>
            <span>Previous receipts</span>
            <strong>
              {(purchase.purchase_receipts || []).length}
            </strong>
          </div>
        </section>

        <div className="partial-receipt-toolbar">
          <div>
            <Box size={20} />
            <span>
              Enter quantities using each line's
              original purchasing unit.
            </span>
          </div>

          <div>
            <button
              type="button"
              className="secondary-button compact"
              onClick={clearQuantities}
              disabled={busy}
            >
              Clear
            </button>

            <button
              type="button"
              className="secondary-button compact"
              onClick={receiveAllRemaining}
              disabled={busy || rows.length === 0}
            >
              <CheckCircle2 size={17} />
              Receive all remaining
            </button>
          </div>
        </div>

        <div className="partial-receipt-items">
          {rows.length === 0 ? (
            <div className="empty-state compact">
              <PackageCheck size={40} />
              <p>
                Every purchase-order line is already
                fully received.
              </p>
            </div>
          ) : (
            rows.map(({ item, remaining, quantity }) => {
              const factor = Number(
                item.unit_factor || 1
              );

              const baseReceipt =
                quantity * factor;

              return (
                <article key={item.id}>
                  <div>
                    <strong>
                      {item.products?.name || "Product"}
                    </strong>

                    <span>
                      Ordered {stockNumber(item.quantity)}{" "}
                      {item.purchase_unit_name || "units"}
                      {" · Received "}
                      {stockNumber(
                        item.received_quantity
                      )}
                      {" · Remaining "}
                      {stockNumber(remaining)}
                    </span>

                    <small>
                      1 {item.purchase_unit_name || "unit"}
                      {" = "}
                      {stockNumber(factor)}{" "}
                      {item.products?.unit_name || "base units"}
                    </small>
                  </div>

                  <div>
                    <span>Cost per purchase unit</span>
                    <strong>
                      {money(
                        item.unit_cost,
                        purchase.currency
                      )}
                    </strong>
                  </div>

                  <label>
                    <span>
                      Receive {item.purchase_unit_name || "quantity"}
                    </span>
                    <input
                      type="number"
                      min="0"
                      max={remaining}
                      step="0.001"
                      value={quantities[item.id] || ""}
                      onChange={(event) =>
                        updateQuantity(
                          item.id,
                          event.target.value
                        )
                      }
                      placeholder="0"
                    />
                    <small>
                      Adds {stockNumber(baseReceipt)}{" "}
                      {item.products?.unit_name || "base units"}
                    </small>
                  </label>

                  <BatchAllocationEditor
                    item={item}
                    receiptQuantity={quantity}
                    receivedAt={receivedAt}
                    allocations={batchAllocations[item.id] || []}
                    onChange={(next) => setBatchAllocations((current) => ({ ...current, [item.id]: next }))}
                  />
                </article>
              );
            })
          )}
        </div>

        <section className="partial-receipt-value">
          <span>Goods-received value</span>
          <strong>
            {money(
              receiptValue,
              purchase.currency
            )}
          </strong>
          <small>
            {allRemainingSelected
              ? "This receipt will complete the purchase order."
              : "Unreceived quantities remain as backorders."}
          </small>
        </section>

        <div className="form-grid three">
          <label>
            <span>Received date and time</span>
            <input
              type="datetime-local"
              value={receivedAt}
              onChange={(event) =>
                setReceivedAt(event.target.value)
              }
            />
          </label>

          <label>
            <span>Supplier invoice number</span>
            <input
              value={supplierInvoice}
              onChange={(event) =>
                setSupplierInvoice(
                  event.target.value
                )
              }
              placeholder="Optional"
            />
          </label>

          <label>
            <span>Payment now</span>
            <input
              type="number"
              min="0"
              max={balance}
              step="0.01"
              value={amountPaid}
              onChange={(event) =>
                setAmountPaid(event.target.value)
              }
            />
          </label>

          <label>
            <span>Payment method</span>
            <select
              value={method}
              onChange={(event) =>
                setMethod(event.target.value)
              }
              disabled={Number(amountPaid || 0) <= 0}
            >
              {paymentMethods.map((value) => (
                <option value={value} key={value}>
                  {value.toUpperCase()}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Payment reference</span>
            <input
              value={reference}
              onChange={(event) =>
                setReference(event.target.value)
              }
              disabled={Number(amountPaid || 0) <= 0}
              placeholder="Optional"
            />
          </label>

          <label>
            <span>Receiving note</span>
            <textarea
              rows="3"
              value={notes}
              onChange={(event) =>
                setNotes(event.target.value)
              }
              placeholder="Damage, short shipment, batch, delivery note..."
            />
          </label>
        </div>

        {Number(amountPaid || 0) > 0
          && method === "cash" && (
          <div className="notice warning">
            A cash supplier payment requires an open
            Cash Register for this branch.
          </div>
        )}

        {error && (
          <div className="notice error">
            {error}
          </div>
        )}

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
            className="primary-button"
            disabled={
              busy
              || selectedRows.length === 0
            }
          >
            <PackageCheck size={18} />
            {busy
              ? "Receiving stock..."
              : allRemainingSelected
                ? "Receive and complete order"
                : "Receive partial delivery"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
