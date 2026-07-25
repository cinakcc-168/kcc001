import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import Modal from "./Modal";
import { stockNumber } from "../lib/catalog";

function emptyItem() {
  return {
    product_id: "",
    quantity: 1
  };
}

export default function TransferFormModal({
  branches,
  products,
  currentBranchId,
  busy,
  onClose,
  onSubmit
}) {
  const [destinationBranchId, setDestinationBranchId] = useState("");
  const [items, setItems] = useState([emptyItem()]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  const destinations = useMemo(
    () => branches.filter((branch) => branch.id !== currentBranchId),
    [branches, currentBranchId]
  );

  function updateItem(index, field, value) {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      )
    );
    setError("");
  }

  function removeItem(index) {
    setItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function submit(event) {
    event.preventDefault();
    setError("");

    if (!destinationBranchId) {
      setError("Choose a destination branch.");
      return;
    }

    const prepared = items
      .filter((item) => item.product_id)
      .map((item) => ({
        product_id: item.product_id,
        quantity: Number(item.quantity)
      }));

    if (prepared.length === 0) {
      setError("Add at least one product.");
      return;
    }

    const seen = new Set();

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

      if (item.quantity > Number(product.stock_quantity || 0)) {
        setError(
          `${product.name} has only ${stockNumber(product.stock_quantity)} available.`
        );
        return;
      }
    }

    await onSubmit({
      destination_branch_id: destinationBranchId,
      items: prepared,
      notes
    });
  }

  return (
    <Modal title="Create stock transfer" onClose={onClose} wide>
      <form className="transfer-form" onSubmit={submit}>
        <label>
          <span>Destination branch</span>
          <select
            value={destinationBranchId}
            onChange={(event) => setDestinationBranchId(event.target.value)}
          >
            <option value="">Choose destination</option>
            {destinations.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name} ({branch.code})
              </option>
            ))}
          </select>
        </label>

        <div className="transfer-item-list">
          {items.map((item, index) => {
            const selected = products.find(
              (product) => product.id === item.product_id
            );

            return (
              <div className="transfer-item-row" key={`${index}-${item.product_id}`}>
                <label>
                  <span>Product</span>
                  <select
                    value={item.product_id}
                    onChange={(event) =>
                      updateItem(index, "product_id", event.target.value)
                    }
                  >
                    <option value="">Choose product</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} · {product.sku || "No code"} · Stock {stockNumber(product.stock_quantity)}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Quantity</span>
                  <input
                    type="number"
                    min="0.001"
                    step="0.001"
                    max={selected?.stock_quantity || undefined}
                    value={item.quantity}
                    onChange={(event) =>
                      updateItem(index, "quantity", event.target.value)
                    }
                  />
                </label>

                <button
                  type="button"
                  className="icon-button danger-icon"
                  onClick={() => removeItem(index)}
                  disabled={items.length === 1}
                  title="Remove product"
                >
                  <Trash2 size={19} />
                </button>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          className="secondary-button transfer-add-item"
          onClick={() => setItems((current) => [...current, emptyItem()])}
        >
          <Plus size={17} />
          Add another product
        </button>

        <label>
          <span>Transfer notes</span>
          <textarea
            rows="3"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Optional packing, delivery, or handling notes"
          />
        </label>

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
          <button type="submit" className="primary-button" disabled={busy}>
            {busy ? "Creating transfer..." : "Send stock transfer"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
