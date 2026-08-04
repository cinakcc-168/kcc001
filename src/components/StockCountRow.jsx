import { useEffect, useMemo, useState } from "react";
import { money, stockNumber } from "../lib/catalog";

export default function StockCountRow({
  item,
  blind,
  busy,
  onDraftChange,
  asCard = false
}) {
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    setQuantity(item.counted_quantity === null ? "" : String(item.counted_quantity));
    setNote(item.note || "");
  }, [item.id, item.counted_quantity, item.note]);

  const counted = quantity.trim() === "" ? null : Number(quantity);
  const variance = useMemo(() => {
    if (counted === null || !Number.isFinite(counted)) return null;
    return counted - Number(item.expected_quantity || 0);
  }, [counted, item.expected_quantity]);

  const changed = (
    item.counted_quantity === null
      ? quantity.trim() !== ""
      : Number(quantity) !== Number(item.counted_quantity)
  ) || note.trim() !== String(item.note || "").trim();

  const product = item.products || {};
  const valueVariance = variance === null
    ? null
    : variance * Number(item.unit_cost_snapshot || 0);
  const tone = variance === null
    ? ""
    : variance === 0
      ? "stock-count-balanced"
      : variance > 0
        ? "stock-count-over"
        : "stock-count-short";

  function updateQuantity(value) {
    setQuantity(value);
    const parsed = value.trim() === "" ? null : Number(value);
    onDraftChange(item, parsed, note);
  }

  function updateNote(value) {
    setNote(value);
    const parsed = quantity.trim() === "" ? null : Number(quantity);
    onDraftChange(item, parsed, value);
  }

  if (asCard) {
    return (
      <article className={`responsive-data-card stock-count-item-card ${tone}`}>
        <header>
          <div>
            <strong>{product.name}</strong>
            <small>{[product.sku, product.barcode, product.categories?.name].filter(Boolean).join(" · ") || "No product code"}</small>
          </div>
          <span className={`status-pill ${changed ? "pending" : "active"}`}>{changed ? "Unsaved" : "Saved"}</span>
        </header>
        <div><span>Base unit</span><strong>{product.unit_name || "pcs"}</strong></div>
        <div><span>System stock</span><strong>{blind ? "Hidden" : stockNumber(item.expected_quantity)}</strong></div>
        <label><span>Counted</span><input className="stock-count-input" type="number" min="0" step="0.001" value={quantity} onChange={(event) => updateQuantity(event.target.value)} disabled={busy} placeholder="Not counted" /></label>
        <div><span>Variance</span><strong>{blind ? "Hidden" : variance === null ? "—" : `${variance > 0 ? "+" : ""}${stockNumber(variance)}`}</strong></div>
        <div><span>Value variance</span><strong>{blind ? "Hidden" : valueVariance === null ? "—" : money(valueVariance, product.currency || "USD")}</strong></div>
        <label className="stock-count-card-note"><span>Note</span><input className="stock-count-note-input" value={note} onChange={(event) => updateNote(event.target.value)} disabled={busy} placeholder="Optional note" /></label>
      </article>
    );
  }

  return (
    <tr className={tone}>
      <td data-label="Product"><strong>{product.name}</strong><small>{[product.sku, product.barcode, product.categories?.name].filter(Boolean).join(" · ") || "No product code"}</small></td>
      <td data-label="Base unit">{product.unit_name || "pcs"}</td>
      <td data-label="System stock">{blind ? <span className="stock-count-hidden">Hidden</span> : <strong>{stockNumber(item.expected_quantity)}</strong>}</td>
      <td data-label="Counted"><input className="stock-count-input" type="number" min="0" step="0.001" value={quantity} onChange={(event) => updateQuantity(event.target.value)} disabled={busy} placeholder="Not counted" /></td>
      <td data-label="Variance">{blind ? <span className="stock-count-hidden">Hidden</span> : variance === null ? <span className="muted">—</span> : <strong>{variance > 0 ? "+" : ""}{stockNumber(variance)}</strong>}</td>
      <td data-label="Value variance">{blind ? <span className="stock-count-hidden">Hidden</span> : valueVariance === null ? <span className="muted">—</span> : <strong>{money(valueVariance, product.currency || "USD")}</strong>}</td>
      <td data-label="Note"><input className="stock-count-note-input" value={note} onChange={(event) => updateNote(event.target.value)} disabled={busy} placeholder="Optional note" /></td>
      <td data-label="Status"><span className={`status-pill ${changed ? "pending" : "active"}`}>{changed ? "Unsaved" : "Saved"}</span></td>
    </tr>
  );
}
