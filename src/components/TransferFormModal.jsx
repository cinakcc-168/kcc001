import { ArrowLeftRight, ChevronDown, Search, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import Modal from "./Modal";
import { stockNumber } from "../lib/catalog";
import { baseProductUnit, findProductUnit, sortedProductUnits } from "../lib/productUnits";

function branchStock(product, branchId) {
  if (!product || !branchId) return 0;
  return Number(product.stock_by_branch?.[branchId]?.quantity || 0);
}

function getProductBatches(product, branchId) {
  if (!product) return [];
  return (product.inventory_batches || []).filter(
    (b) => (!b.branch_id || !branchId || b.branch_id === branchId) && (b.status === "active" || b.status === "expiring" || b.quantity > 0 || !b.status)
  );
}

export default function TransferFormModal({
  transfer = null,
  branches = [],
  products = [],
  currentBranchId,
  canAllBranches = false,
  busy = false,
  onClose,
  onSubmit
}) {
  const [sourceBranchId, setSourceBranchId] = useState(currentBranchId || "");
  const [destinationBranchId, setDestinationBranchId] = useState("");
  const [items, setItems] = useState([]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const searchContainerRef = useRef(null);

  useEffect(() => {
    if (transfer) {
      setSourceBranchId(transfer.source_branch_id || currentBranchId || "");
      setDestinationBranchId(transfer.destination_branch_id || "");
      const existingItems = (transfer.stock_transfer_items || []).map((item) => {
        const firstBatch = item.stock_transfer_item_batches?.[0];
        return {
          product_id: item.product_id,
          product_unit_id: item.requested_product_unit_id || "",
          quantity: Number(item.requested_unit_quantity ?? item.quantity ?? 0),
          batch_number: firstBatch?.batch_number || item.batch_number || "",
          expiry_date: firstBatch?.expiry_date || item.expiry_date || "",
          source_batch_id: firstBatch?.source_batch_id || item.source_batch_id || "",
          is_custom_batch: false
        };
      });
      setItems(existingItems);
      setNotes(transfer.notes || "");
    } else {
      setSourceBranchId(currentBranchId || (branches[0]?.id || ""));
      const otherBranch = branches.find((b) => b.id !== (currentBranchId || branches[0]?.id));
      setDestinationBranchId(otherBranch?.id || "");
      setItems([]);
      setNotes("");
    }
    setError("");
    setProductSearch("");
    setCategoryFilter("all");
    setIsDropdownOpen(false);
  }, [transfer, currentBranchId, branches]);

  // Handle clicking outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const branchMap = useMemo(
    () => new Map((branches || []).map((branch) => [branch.id, branch])),
    [branches]
  );

  const categories = useMemo(() => {
    const map = new Map();
    for (const product of products || []) {
      const category = product.categories?.name || product.category_name || "Uncategorized";
      const categoryId = product.category_id || category;
      if (!map.has(categoryId)) map.set(categoryId, { id: categoryId, name: category });
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [products]);

  const filteredProductOptions = useMemo(() => {
    const needle = productSearch.trim().toLowerCase();
    return (products || []).filter((product) => {
      const categoryId = product.category_id || product.categories?.id || product.category_name || product.categories?.name || "Uncategorized";
      if (categoryFilter !== "all" && String(categoryId) !== String(categoryFilter)) return false;
      if (!needle) return true;
      return [product.name, product.name_km, product.sku, product.barcode]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    }).slice(0, 40);
  }, [products, productSearch, categoryFilter]);

  function updateItem(index, changes) {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item));
    setError("");
  }

  function addProduct(productId) {
    const product = products.find((row) => row.id === productId);
    if (!product) return;
    const existingIndex = items.findIndex((item) => item.product_id === productId);
    if (existingIndex >= 0) {
      updateItem(existingIndex, { quantity: Number(items[existingIndex].quantity || 0) + 1 });
    } else {
      const baseUnit = baseProductUnit(product);
      const batches = getProductBatches(product, sourceBranchId);
      const defaultBatch = batches.length === 1 ? batches[0] : null;

      setItems((current) => [
        ...current,
        {
          product_id: productId,
          product_unit_id: baseUnit?.id || "",
          quantity: 1,
          batch_number: defaultBatch?.batch_number || "",
          expiry_date: defaultBatch?.expiry_date || "",
          source_batch_id: defaultBatch?.id || "",
          is_custom_batch: false
        }
      ]);
    }
    setProductSearch("");
    setIsDropdownOpen(false);
    setError("");
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
        quantity: Number(item.quantity),
        batch_number: item.batch_number?.trim() || null,
        expiry_date: item.expiry_date || null,
        source_batch_id: item.source_batch_id || null
      }));

    if (prepared.length === 0) {
      setError("Add at least one product to the transfer.");
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
        quantity: item.quantity,
        batch_number: item.batch_number,
        expiry_date: item.expiry_date,
        source_batch_id: item.source_batch_id
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
    <Modal
      title={transfer ? `Edit ${transfer.transfer_number}` : "Create stock transfer"}
      onClose={onClose}
      wide
      className="transfer-modal-dialog"
    >
      <form className="transfer-form" onSubmit={submit}>
        {/* Branch Routing Header */}
        <div className="transfer-branch-route-fields">
          <label className="transfer-branch-select-field">
            <span className="transfer-field-caption">From (Source)</span>
            <select
              value={sourceBranchId}
              onChange={(event) => changeSource(event.target.value)}
              className="transfer-branch-select"
            >
              <option value="">Choose source branch</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name} ({branch.code})
                </option>
              ))}
            </select>
          </label>

          <div className="transfer-route-arrow-wrap" aria-hidden="true">
            <ArrowLeftRight size={20} />
          </div>

          <label className="transfer-branch-select-field">
            <span className="transfer-field-caption">To (Destination)</span>
            <select
              value={destinationBranchId}
              onChange={(event) => changeDestination(event.target.value)}
              className="transfer-branch-select"
            >
              <option value="">Choose destination branch</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name} ({branch.code})
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Informative Note */}
        <div className="transfer-request-note">
          <strong>
            {branchMap.get(sourceBranchId)?.name || "Source branch"} → {branchMap.get(destinationBranchId)?.name || "Destination branch"}
          </strong>
          <span>
            Requested items are transferred from source to destination. The actual count is verified upon sending and receiving.
          </span>
        </div>

        {/* Product Search & Dropdown Input */}
        <div className="transfer-product-search-row">
          <div className="transfer-search-wrapper" ref={searchContainerRef}>
            <span className="transfer-field-caption">Search & Add Product</span>
            <div className="transfer-search-input-box">
              <Search size={18} className="transfer-search-icon" />
              <input
                type="text"
                value={productSearch}
                onFocus={() => setIsDropdownOpen(true)}
                onChange={(event) => {
                  setProductSearch(event.target.value);
                  setIsDropdownOpen(true);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && filteredProductOptions.length > 0) {
                    event.preventDefault();
                    addProduct(filteredProductOptions[0].id);
                  } else if (event.key === "Escape") {
                    setIsDropdownOpen(false);
                  }
                }}
                placeholder="Type product name, code or scan barcode..."
                autoComplete="off"
                inputMode="search"
                className="transfer-search-input"
              />
              {productSearch && (
                <button
                  type="button"
                  className="transfer-search-clear-btn"
                  onClick={() => {
                    setProductSearch("");
                    setIsDropdownOpen(false);
                  }}
                  title="Clear search"
                >
                  <X size={15} />
                </button>
              )}
              <button
                type="button"
                className="transfer-search-toggle-btn"
                onClick={() => setIsDropdownOpen((prev) => !prev)}
                title="Toggle product dropdown"
              >
                <ChevronDown size={17} className={isDropdownOpen ? "rotate-180" : ""} />
              </button>

              {/* Floating Dropdown */}
              {isDropdownOpen && (
                <div className="transfer-search-dropdown" role="listbox">
                  {filteredProductOptions.length === 0 ? (
                    <div className="transfer-search-empty">
                      <span>No products found matching &ldquo;{productSearch}&rdquo;</span>
                    </div>
                  ) : (
                    filteredProductOptions.map((product) => {
                      const avail = branchStock(product, sourceBranchId);
                      return (
                        <button
                          type="button"
                          className="transfer-search-option-item"
                          key={product.id}
                          onClick={() => addProduct(product.id)}
                        >
                          <div className="transfer-option-info">
                            <strong className="transfer-option-name">{product.name}</strong>
                            {product.name_km && <span className="transfer-option-km">{product.name_km}</span>}
                            <span className="transfer-option-code">
                              {product.sku || "No code"}
                              {product.barcode ? ` · ${product.barcode}` : ""}
                            </span>
                          </div>
                          <div className="transfer-option-stock">
                            <span className={`transfer-stock-tag ${avail <= 0 ? "out" : ""}`}>
                              Available {stockNumber(avail)} {product.unit_name || "pcs"}
                            </span>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>

          <label className="transfer-category-filter">
            <span className="transfer-field-caption">Category Filter</span>
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="transfer-category-select"
            >
              <option value="all">All categories ({products.length})</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Selected Items List */}
        <div className="transfer-item-section">
          <div className="transfer-item-section-header">
            <span className="transfer-field-caption">
              Selected Transfer Items ({items.length})
            </span>
          </div>

          <div className="transfer-selected-items-container">
            {items.length === 0 ? (
              <div className="transfer-empty-selection">
                <Search size={24} className="transfer-empty-icon" />
                <p>No products added yet.</p>
                <small>Use the search input above to pick products and add them to this transfer list.</small>
              </div>
            ) : (
              items.map((item, index) => {
                const selected = products.find((product) => product.id === item.product_id);
                const units = sortedProductUnits(selected);
                const selectedUnit = findProductUnit(selected, item.product_unit_id);
                const availableBatches = getProductBatches(selected, sourceBranchId);
                const availableBase = branchStock(selected, sourceBranchId);
                const requestedBase = Number(item.quantity || 0) * Number(selectedUnit?.conversion_factor || 1);
                const isOverStock = selected && requestedBase > availableBase;

                return (
                  <div className="transfer-selected-item-row" key={`${item.product_id}-${index}`}>
                    {/* 1 Cambodia beer */}
                    <div className="transfer-item-col-name">
                      <span className="transfer-item-index">{index + 1}</span>
                      <div className="transfer-item-name-details">
                        <strong className="transfer-item-name-text">
                          {selected?.name || "Unknown Product"}
                        </strong>
                        {selected?.name_km && (
                          <small className="transfer-item-km-text">{selected.name_km}</small>
                        )}
                      </div>
                    </div>

                    {/* code (showing only code, without "[]") */}
                    <div className="transfer-item-col-code">
                      <span className="transfer-code-pill" title={selected?.barcode || selected?.sku || ""}>
                        {selected?.sku || selected?.barcode || "No code"}
                      </span>
                    </div>

                    {/* [qty] */}
                    <div className="transfer-item-col-qty">
                      <label className="transfer-compact-field">
                        <span className="transfer-compact-label">Qty</span>
                        <input
                          type="number"
                          min="0.001"
                          step="any"
                          value={item.quantity}
                          onChange={(event) => updateItem(index, { quantity: event.target.value })}
                          inputMode="decimal"
                          className="transfer-qty-input"
                          placeholder="1"
                        />
                      </label>
                    </div>

                    {/* [unit base] (removed the word "(Base)") */}
                    <div className="transfer-item-col-unit">
                      <label className="transfer-compact-field">
                        <span className="transfer-compact-label">Unit base</span>
                        <select
                          value={selectedUnit?.id || ""}
                          onChange={(event) => updateItem(index, { product_unit_id: event.target.value })}
                          disabled={!selected}
                          className="transfer-unit-select"
                        >
                          {units.length === 0 && (
                            <option value="">{selected?.unit_name || "Base"}</option>
                          )}
                          {units.map((unit) => (
                            <option value={unit.id} key={unit.id}>
                              {unit.short_name || unit.name}
                              {unit.is_base ? "" : ` (x${unit.conversion_factor})`}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    {/* Batch field with dropdown support when more than 1 batch exists */}
                    <div className="transfer-item-col-batch">
                      <label className="transfer-compact-field">
                        <span className="transfer-compact-label">Batch</span>
                        {availableBatches.length > 1 && !item.is_custom_batch ? (
                          <select
                            value={item.source_batch_id || item.batch_number || ""}
                            onChange={(event) => {
                              const val = event.target.value;
                              if (val === "__custom__") {
                                updateItem(index, { is_custom_batch: true, source_batch_id: "", batch_number: "" });
                              } else {
                                const chosen = availableBatches.find((b) => b.id === val || b.batch_number === val);
                                if (chosen) {
                                  updateItem(index, {
                                    source_batch_id: chosen.id,
                                    batch_number: chosen.batch_number,
                                    expiry_date: chosen.expiry_date || ""
                                  });
                                } else {
                                  updateItem(index, { source_batch_id: "", batch_number: val });
                                }
                              }
                            }}
                            className="transfer-batch-select"
                          >
                            <option value="">Choose batch ({availableBatches.length})</option>
                            {availableBatches.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.batch_number} {b.expiry_date ? `(Exp: ${b.expiry_date})` : ""} {b.quantity ? `[${b.quantity} pcs]` : ""}
                              </option>
                            ))}
                            <option value="__custom__">+ Custom batch...</option>
                          </select>
                        ) : (
                          <div className="transfer-batch-input-wrap">
                            <input
                              type="text"
                              value={item.batch_number || ""}
                              onChange={(event) => updateItem(index, { batch_number: event.target.value })}
                              placeholder="Batch #"
                              className="transfer-batch-input"
                            />
                            {availableBatches.length > 1 && (
                              <button
                                type="button"
                                className="transfer-batch-toggle-btn"
                                onClick={() => updateItem(index, { is_custom_batch: false })}
                                title="Back to batch dropdown"
                              >
                                Dropdown
                              </button>
                            )}
                          </div>
                        )}
                      </label>
                    </div>

                    {/* Expire Date Field */}
                    <div className="transfer-item-col-expire">
                      <label className="transfer-compact-field">
                        <span className="transfer-compact-label">Expire</span>
                        <input
                          type="date"
                          value={item.expiry_date || ""}
                          onChange={(event) => updateItem(index, { expiry_date: event.target.value })}
                          className="transfer-expire-input"
                        />
                      </label>
                    </div>

                    {/* available 134 pcs */}
                    <div className="transfer-item-col-stock">
                      <span className={`transfer-stock-available-badge ${isOverStock ? "exceeded" : ""}`}>
                        available {stockNumber(availableBase)} {selected?.unit_name || "pcs"}
                      </span>
                      {isOverStock && (
                        <small className="transfer-stock-warning-text">
                          (Req: {stockNumber(requestedBase)})
                        </small>
                      )}
                    </div>

                    {/* Remove Action */}
                    <button
                      type="button"
                      className="icon-button danger-icon transfer-item-remove-btn"
                      onClick={() => removeItem(index)}
                      title="Remove product from transfer"
                      aria-label="Remove item"
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Transfer Notes */}
        <label className="transfer-notes-field">
          <span className="transfer-field-caption">Transfer Notes</span>
          <textarea
            rows="2"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Optional notes for delivery, packaging, or handling instructions..."
            className="transfer-notes-textarea"
          />
        </label>

        {error && <div className="notice error">{error}</div>}

        {/* Modal Actions */}
        <div className="modal-actions transfer-modal-actions">
          <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="primary-button" disabled={busy}>
            {busy ? "Saving transfer..." : transfer ? "Save transfer" : "Create pending transfer"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
