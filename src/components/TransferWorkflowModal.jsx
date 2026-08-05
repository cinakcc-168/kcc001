import { CheckCircle2, Clock3, PackageCheck, RotateCcw, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Modal from "./Modal";
import { stockNumber } from "../lib/catalog";

export default function TransferWorkflowModal({
  transfer,
  mode,
  busy,
  onClose,
  onSaveCount,
  onApprove,
  onReopen
}) {
  const [counts, setCounts] = useState({});
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!transfer) return;
    setCounts(Object.fromEntries((transfer.stock_transfer_items || []).map((item) => [item.product_id, {
      quantity: item.counted_quantity === null || item.counted_quantity === undefined ? "" : String(item.counted_quantity),
      note: item.count_note || ""
    }])));
    setNotes(transfer.count_notes || transfer.approval_note || "");
    setError("");
  }, [transfer, mode]);

  const totals = useMemo(() => {
    const rows = transfer?.stock_transfer_items || [];
    return {
      requested: rows.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
      counted: rows.reduce((sum, item) => sum + Number(counts[item.product_id]?.quantity || 0), 0)
    };
  }, [transfer, counts]);

  if (!transfer) return null;

  function preparedItems(requireAll) {
    const rows = (transfer.stock_transfer_items || []).map((item) => {
      const value = counts[item.product_id]?.quantity;
      const number = value === "" ? null : Number(value);
      return {
        product_id: item.product_id,
        counted_quantity: number,
        note: counts[item.product_id]?.note || ""
      };
    });
    if (rows.some((row) => row.counted_quantity !== null && (!Number.isFinite(row.counted_quantity) || row.counted_quantity < 0))) {
      throw new Error("Every counted quantity must be zero or greater.");
    }
    if (requireAll && rows.some((row) => row.counted_quantity === null)) {
      throw new Error("Count every product before submitting for approval.");
    }
    return rows;
  }

  async function saveCount(submit) {
    setError("");
    try {
      await onSaveCount({
        transfer_id: transfer.id,
        items: preparedItems(submit),
        notes,
        submit
      });
    } catch (saveError) {
      setError(saveError?.message || "The transfer count could not be saved.");
    }
  }

  async function approve() {
    setError("");
    try {
      await onApprove(transfer.id, notes);
    } catch (approveError) {
      setError(approveError?.message || "The transfer could not be approved.");
    }
  }

  async function reopen() {
    setError("");
    try {
      await onReopen(transfer.id, notes);
    } catch (reopenError) {
      setError(reopenError?.message || "The transfer could not be returned to counting.");
    }
  }

  return (
    <Modal
      title={mode === "view" ? transfer.transfer_number : mode === "approve" ? `Approve ${transfer.transfer_number}` : `Count ${transfer.transfer_number}`}
      onClose={onClose}
      wide={mode !== "view"}
    >
      <div className="transfer-workflow-modal">
        <section className="transfer-workflow-summary">
          <div><span>From</span><strong>{transfer.source_branch?.name || "Source"}</strong></div>
          <div><span>To</span><strong>{transfer.destination_branch?.name || "Destination"}</strong></div>
          <div><span>Status</span><strong>{transfer.display_status || transfer.status}</strong></div>
          <div><span>Units</span><strong>{stockNumber(totals.requested)} requested · {stockNumber(totals.counted)} counted</strong></div>
        </section>

        <div className="responsive-wide-table-wrap transfer-product-detail-wrap">
          <table className="responsive-wide-table transfer-product-detail-table">
            <thead><tr><th>Product</th><th>Requested</th>{mode !== "view" && <th>Exact received</th>}<th>Variance</th><th>Note</th></tr></thead>
            <tbody>
              {(transfer.stock_transfer_items || []).map((item) => {
                const value = counts[item.product_id]?.quantity;
                const counted = value === "" ? null : Number(value);
                const variance = counted === null ? null : counted - Number(item.quantity || 0);
                return (
                  <tr key={item.id || item.product_id}>
                    <td><strong>{item.products?.name || "Product"}</strong><small>{item.products?.sku || item.products?.barcode || "No code"}</small></td>
                    <td>{stockNumber(item.quantity)} {item.products?.unit_name || "pcs"}</td>
                    {mode !== "view" && (
                      <td>
                        <input
                          className="transfer-count-input"
                          type="number"
                          min="0"
                          step="0.001"
                          value={value ?? ""}
                          disabled={mode === "approve"}
                          placeholder="Count"
                          onChange={(event) => setCounts((current) => ({ ...current, [item.product_id]: { ...current[item.product_id], quantity: event.target.value } }))}
                        />
                      </td>
                    )}
                    <td>{variance === null ? "—" : `${variance > 0 ? "+" : ""}${stockNumber(variance)}`}</td>
                    <td>
                      {mode === "count" ? (
                        <input value={counts[item.product_id]?.note || ""} placeholder="Optional item note" onChange={(event) => setCounts((current) => ({ ...current, [item.product_id]: { ...current[item.product_id], note: event.target.value } }))} />
                      ) : (item.count_note || "—")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {mode !== "view" && (
          <label>
            <span>{mode === "approve" ? "Approval note" : "Counting / delivery note"}</span>
            <textarea rows="3" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional note" disabled={mode === "approve" && busy} />
          </label>
        )}

        {mode === "count" && (
          <div className="notice info"><Clock3 size={18} /> Save Pending keeps the count open so the stock user can continue later. Submit Count sends it to the branch manager for final approval.</div>
        )}
        {mode === "approve" && (
          <div className="notice warning"><PackageCheck size={18} /> Stock is deducted from the source and added to the destination only after final approval.</div>
        )}
        {error && <div className="notice error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>Close</button>
          {mode === "count" && <>
            <button type="button" className="secondary-button" onClick={() => saveCount(false)} disabled={busy}><Save size={18} />Save Pending</button>
            <button type="button" className="primary-button" onClick={() => saveCount(true)} disabled={busy}><CheckCircle2 size={18} />Submit Count</button>
          </>}
          {mode === "approve" && <>
            <button type="button" className="secondary-button" onClick={reopen} disabled={busy}><RotateCcw size={18} />Return to counting</button>
            <button type="button" className="primary-button" onClick={approve} disabled={busy}><PackageCheck size={18} />Approve transfer</button>
          </>}
        </div>
      </div>
    </Modal>
  );
}
