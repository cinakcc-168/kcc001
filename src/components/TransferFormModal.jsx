import { ArrowLeftRight, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Modal from "./Modal";
import { stockNumber } from "../lib/catalog";
import { baseProductUnit, findProductUnit, sortedProductUnits } from "../lib/productUnits";

function emptyItem() {
  return { product_id: "", product_unit_id: "", quantity: 1 };
}

function branchStock(product, branchId) {
  if (!product || !branchId) return 0;
  return Number(product.stock_by_branch?.[branchId]?.quantity || 0);
}

export default function TransferFormModal({
  transfer = null,
  branches,
  products,
  currentBranchId,
  canAllBranches = false,
  busy,
  onClose,
  onSubmit
}) {
  const [sourceBranchId, setSourceBranchId] = useState(currentBranchId || "");
  const [destinationBranchId, setDestinationBranchId] = useState("");
  const [items, setItems] = useState([emptyItem()]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (transfer) {
      setSourceBranchId(transfer.source_branch_id || currentBranchId || "");
      setDestinationBranchId(transfer.destination_branch_id || "");
      const existingItems = (transfer.stock_transfer_items || []).map((item) => ({
        product_id: item.product_id,
        product_unit_id: item.requested_product_unit_id || "",
        quantity: Number(item.requested_unit_quantity ?? item.quantity ?? 0)
      }));
      setItems(existingItems.length ? existingItems : [emptyItem()]);
      setNotes(transfer.notes || "");
    } else {
      setSourceBranchId(currentBranchId || "");
      setDestinationBranchId("");
      setItems([emptyItem()]);
      setNotes("");
    }
    setError("");
  }, [transfer, currentBranchId]);

  const branchMap = useMemo(
    () => new Map((branches || []).map((branch) => [branch.id, branch])),
    [branches]
  );

  function updateItem(index, changes) {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item));
    setError("");
  }

  function chooseProduct(index, productId) {
    const product = products.find((row) => row.id === productId);
    const baseUnit = baseProductUnit(product);
    updateItem(index, {
      product_id: productId,
      product_unit_id: baseUnit?.id || "",
      quantity: 1
    });
  }

  function removeItem(index) {
    setItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function changeSource(nextSource) {
    setSourceBranchId(nextSource);
    if (nextSource && nextSource === destinationBranchId) {
      setDestinationBranchId(nextSource !== currentBranchId ? currentBranchId || "" : "");
    } else if (!canAllBranches && nextSource && nextSource !== currentBranchId && destinationBranchId !== currentBranchId) {
      setDestinationBranchId(currentBranchId || "");
    }
    setError("");
  }

  function changeDestination(nextDestination) {
    setDestinationBranchId(nextDestination);
    if (nextDestination && nextDestination === sourceBranchId) {
      setSourceBranchId(nextDestination !== currentBranchId ? currentBranchId || "" : "");
    } else if (!canAllBranches && nextDestination && nextDestination !== currentBranchId && sourceBranchId !== currentBranchId) {
      setSourceBranchId(currentBranchId || "");
    }
    setError("");
  }

  async function submit(event) {
    event.preventDefault();
    setError("");

    if (!sourceBranchId || !destinationBranchId) {
      setError("Choose both From and To branches.");
      return;
    }
    if (sourceBranchId === destinationBranchId) {
      setError("From and To branches must be different.");
      return;
    }
    if (!canAllBranches && sourceBranchId !== currentBranchId && destinationBranchId !== currentBranchId) {
      setError("Your current branch must be either From or To for this transfer.");
      return;
    }

    const prepared = items
      .filter((item) => item.product_id)
      .map((item) => ({
        product_id: item.product_id,
        product_unit_id: item.product_unit_id || null,
        quantity: Number(item.quantity)
      }));

    if (prepared.length === 0) {
      setError("Add at least one product.");
      return;
    }

    const seen = new Set();
    const normalizedItems = [];
    for (const item of prepared) {
      const product = products.find((row) => row.id === item.product_id);
      if (!product) {
        setError("One selected product no longer exists.");
        return;
      }
      if (seen.has(item.product_id)) {
        setError(`${product.name} was selected more than once.`);
        return;
      }
      seen.add(item.product_id);
      if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
        setError(`Enter a valid quantity for ${product.name}.`);
        return;
      }
      const unit = findProductUnit(product, item.product_unit_id);
      if (!unit) {
        setError(`Choose a valid unit for ${product.name}.`);
        return;
      }
      normalizedItems.push({
        product_id: item.product_id,
        product_unit_id: unit.id || null,
        quantity: item.quantity
      });
    }

    await onSubmit({
      transfer_id: transfer?.id || null,
      source_branch_id: sourceBranchId,
      destination_branch_id: destinationBranchId,
      items: normalizedItems,
      notes
    });
  }

  return (
    <Modal title={transfer ? `Edit ${transfer.transfer_number}` : "Create stock transfer"} onClose={onClose} wide>
      <form className="transfer-form" onSubmit={submit}>
        <div className="transfer-branch-route-fields">
          <label>
            <span>From</span>
            <select value={sourceBranchId} onChange={(event) => changeSource(event.target.value)}>
              <option value="">Choose source branch</option>
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name} ({branch.code})</option>)}
            </select>
          </label>
          <ArrowLeftRight size={22} aria-hidden="true" />
          <label>
            <span>To</span>
            <select value={destinationBranchId} onChange={(event) => changeDestination(event.target.value)}>
              <option value="">Choose destination branch</option>
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name} ({branch.code})</option>)}
            </select>
          </label>
        </div>

        <div className="transfer-request-note">
          <strong>{branchMap.get(sourceBranchId)?.name || "Source branch"} → {branchMap.get(destinationBranchId)?.name || "Destination branch"}</strong>
          <span>A transfer can be requested even when the source does not currently have the full requested quantity. The actual amount is confirmed in Count before approval.</span>
        </div>

        <div className="transfer-item-list">
          {items.map((item, index) => {
            const selected = products.find((product) => product.id === item.product_id);
            const units = sortedProductUnits(selected);
            const selectedUnit = findProductUnit(selected, item.product_unit_id);
            const availableBase = branchStock(selected, sourceBranchId);
            const requestedBase = Number(item.quantity || 0) * Number(selectedUnit?.conversion_factor || 1);
            return (
              <div className="transfer-item-row transfer-item-row-with-unit" key={`${index}-${item.product_id}`}>
                <label className="transfer-product-field">
                  <span>Product</span>
                  <select value={item.product_id} onChange={(event) => chooseProduct(index, event.target.value)}>
                    <option value="">Choose product</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} · {product.sku || "No code"} · Source stock {stockNumber(branchStock(product, sourceBranchId))} {product.unit_name || "pcs"}
                      </option>
                    ))}
                  </select>
                  {selected && (
                    <small className={requestedBase > availableBase ? "transfer-stock-warning" : "muted"}>
                      Available: {stockNumber(availableBase)} {selected.unit_name || "pcs"} · Request: {stockNumber(requestedBase)} {selected.unit_name || "pcs"} base
                    </small>
                  )}
                </label>
                <label>
                  <span>Quantity</span>
                  <input type="number" min="0.001" step="0.001" value={item.quantity} onChange={(event) => updateItem(index, { quantity: event.target.value })} inputMode="decimal" />
                </label>
                <label>
                  <span>Unit</span>
                  <select value={selectedUnit?.id || ""} onChange={(event) => updateItem(index, { product_unit_id: event.target.value })} disabled={!selected}>
                    {units.length === 0 && <option value="">{selected?.unit_name || "Base"}</option>}
                    {units.map((unit) => (
                      <option value={unit.id} key={unit.id}>{unit.short_name || unit.name}</option>
                    ))}
                  </select>
                </label>
                <button type="button" className="icon-button danger-icon" onClick={() => removeItem(index)} disabled={items.length === 1} title="Remove product">
                  <Trash2 size={19} />
                </button>
              </div>
            );
          })}
        </div>

        <button type="button" className="secondary-button transfer-add-item" onClick={() => setItems((current) => [...current, emptyItem()])}>
          <Plus size={17} /> Add another product
        </button>

        <label>
          <span>Transfer notes</span>
          <textarea rows="3" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional packing, delivery, request, or handling notes" />
        </label>

        {error && <div className="notice error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="primary-button" disabled={busy}>
            {busy ? "Saving transfer..." : transfer ? "Save transfer" : "Create pending transfer"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
