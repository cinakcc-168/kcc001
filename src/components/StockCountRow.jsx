import {
  Check,
  RotateCcw
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState
} from "react";
import {
  money,
  stockNumber
} from "../lib/catalog";

export default function StockCountRow({
  item,
  blind,
  busy,
  onSave
}) {
  const [quantity, setQuantity] =
    useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    setQuantity(
      item.counted_quantity === null
        ? ""
        : String(item.counted_quantity)
    );
    setNote(item.note || "");
  }, [
    item.id,
    item.counted_quantity,
    item.note
  ]);

  const counted =
    quantity.trim() === ""
      ? null
      : Number(quantity);

  const variance = useMemo(() => {
    if (
      counted === null
      || !Number.isFinite(counted)
    ) {
      return null;
    }

    return counted
      - Number(item.expected_quantity || 0);
  }, [
    counted,
    item.expected_quantity
  ]);

  const changed =
    (
      item.counted_quantity === null
        ? quantity.trim() !== ""
        : Number(quantity)
          !== Number(item.counted_quantity)
    )
    || note.trim() !== String(
      item.note || ""
    ).trim();

  const product = item.products || {};
  const valueVariance =
    variance === null
      ? null
      : variance
        * Number(
          item.unit_cost_snapshot || 0
        );

  async function save() {
    if (
      counted !== null
      && (
        !Number.isFinite(counted)
        || counted < 0
      )
    ) {
      window.alert(
        "Counted quantity must be zero or greater."
      );
      return;
    }

    await onSave(item, counted, note);
  }

  async function clear() {
    setQuantity("");
    setNote("");
    await onSave(item, null, "");
  }

  return (
    <tr
      className={
        variance === null
          ? ""
          : variance === 0
            ? "stock-count-balanced"
            : variance > 0
              ? "stock-count-over"
              : "stock-count-short"
      }
    >
      <td data-label="Product">
        <strong>{product.name}</strong>
        <small>
          {[
            product.sku,
            product.barcode,
            product.categories?.name
          ]
            .filter(Boolean)
            .join(" · ")
            || "No product code"}
        </small>
      </td>

      <td data-label="Base unit">
        {product.unit_name || "pcs"}
      </td>

      <td data-label="System stock">
        {blind ? (
          <span className="stock-count-hidden">
            Hidden
          </span>
        ) : (
          <strong>
            {stockNumber(
              item.expected_quantity
            )}
          </strong>
        )}
      </td>

      <td data-label="Counted">
        <input
          className="stock-count-input"
          type="number"
          min="0"
          step="0.001"
          value={quantity}
          onChange={(event) =>
            setQuantity(event.target.value)
          }
          placeholder="Not counted"
        />
      </td>

      <td data-label="Variance">
        {blind ? (
          <span className="stock-count-hidden">
            Hidden
          </span>
        ) : variance === null ? (
          <span className="muted">—</span>
        ) : (
          <strong>
            {variance > 0 ? "+" : ""}
            {stockNumber(variance)}
          </strong>
        )}
      </td>

      <td data-label="Value variance">
        {blind ? (
          <span className="stock-count-hidden">
            Hidden
          </span>
        ) : valueVariance === null ? (
          <span className="muted">—</span>
        ) : (
          <strong>
            {money(
              valueVariance,
              product.currency || "USD"
            )}
          </strong>
        )}
      </td>

      <td data-label="Note">
        <input
          className="stock-count-note-input"
          value={note}
          onChange={(event) =>
            setNote(event.target.value)
          }
          placeholder="Optional note"
        />
      </td>

      <td data-label="Actions">
        <div className="stock-count-row-actions">
          <button
            type="button"
            className="icon-button"
            onClick={save}
            disabled={
              busy
              || !changed
              || (
                counted !== null
                && (
                  !Number.isFinite(counted)
                  || counted < 0
                )
              )
            }
            title="Save count"
          >
            <Check size={18} />
          </button>

          <button
            type="button"
            className="icon-button"
            onClick={clear}
            disabled={
              busy
              || (
                item.counted_quantity === null
                && !item.note
              )
            }
            title="Clear count"
          >
            <RotateCcw size={17} />
          </button>
        </div>
      </td>
    </tr>
  );
}
