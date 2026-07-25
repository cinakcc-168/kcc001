import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { adjustmentReasons } from "../lib/inventory";
import { stockNumber } from "../lib/catalog";

export default function InventoryAdjustmentForm({
  product,
  initialMode = "add",
  busy,
  onCancel,
  onSave
}) {
  const [mode, setMode] = useState(initialMode);
  const [quantity, setQuantity] = useState(initialMode === "set" ? String(product.stock_quantity) : "");
  const [reason, setReason] = useState("count_correction");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setMode(initialMode);
    setQuantity(initialMode === "set" ? String(product.stock_quantity) : "");
  }, [initialMode, product]);

  async function submit(event) {
    event.preventDefault();
    const numericQuantity = Number(quantity);

    if (!Number.isFinite(numericQuantity) || numericQuantity < 0) {
      setError("Enter a valid quantity.");
      return;
    }

    if (mode !== "set" && numericQuantity <= 0) {
      setError("Quantity must be greater than zero.");
      return;
    }

    try {
      await onSave({
        product_id: product.id,
        mode,
        quantity: numericQuantity,
        reason,
        notes
      });
    } catch (saveError) {
      setError(saveError.message);
    }
  }

  return (
    <form className="inventory-form" onSubmit={submit}>
      {error && <div className="notice error">{error}</div>}

      <div className="selected-product-card">
        <div>
          <strong>{product.name}</strong>
          <span>{product.sku || "No product code"} · {product.barcode || "No barcode"}</span>
        </div>
        <div>
          <small>Current stock</small>
          <strong>{stockNumber(product.stock_quantity)} {product.unit_name}</strong>
        </div>
      </div>

      <div className="form-grid two">
        <label>
          <span>Adjustment method</span>
          <select value={mode} onChange={(event) => setMode(event.target.value)}>
            <option value="add">Add quantity</option>
            <option value="remove">Remove quantity</option>
            <option value="set">Set counted stock</option>
          </select>
        </label>

        <label>
          <span>{mode === "set" ? "Counted stock" : "Quantity"}</span>
          <input
            type="number"
            min="0"
            step="0.001"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            autoFocus
          />
        </label>
      </div>

      <label>
        <span>Reason</span>
        <select value={reason} onChange={(event) => setReason(event.target.value)}>
          {adjustmentReasons.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </label>

      <label>
        <span>Remark</span>
        <textarea
          rows="3"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Optional explanation"
        />
      </label>

      <div className="modal-actions">
        <button type="button" className="secondary-button" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="submit" className="primary-button" disabled={busy}>
          <Save size={18} /> {busy ? "Saving..." : "Save adjustment"}
        </button>
      </div>
    </form>
  );
}
