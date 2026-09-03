import {
  AlertTriangle,
  Boxes,
  CalendarClock,
  PencilLine,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import BatchFormModal from "../components/BatchFormModal";
import BatchAdjustmentModal from "../components/BatchAdjustmentModal";
import ResponsiveDataList from "../components/ResponsiveDataList";
import { money, stockNumber } from "../lib/catalog";
import {
  adjustInventoryBatch,
  batchDate,
  batchDaysRemaining,
  changeInventoryBatchStatus,
  createInventoryBatch,
  deleteInventoryBatch,
  effectiveBatchStatus,
  loadBatchWorkspace,
  reconcileProductBatches
} from "../lib/batches";

export default function BatchesPage() {
  const { supabase, profile, can } = useAuth();
  const canAdjust = can("inventory.adjust");
  const [products, setProducts] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("available");
  const [productId, setProductId] = useState("all");
  const [categoryId, setCategoryId] = useState("all");
  const [pickingPolicy, setPickingPolicy] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [adjusting, setAdjusting] = useState(null);

  const refresh = useCallback(async () => {
    if (!supabase || !profile?.branch_id) return;
    try {
      setLoading(true);
      const data = await loadBatchWorkspace(supabase, profile);
      const orgKey = profile.organization_id || "default";
      const key = `tinypos_deleted_batch_ids_${orgKey}`;
      let deletedIds = [];
      try { deletedIds = JSON.parse(localStorage.getItem(key) || "[]"); } catch (e) { deletedIds = []; }

      const filteredBatches = (data.batches || []).filter((b) => !deletedIds.includes(b.id));
      setProducts(data.products);
      setBatches(filteredBatches);
    } catch (error) {
      setMessageType("error");
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }, [supabase, profile]);

  useEffect(() => { refresh(); }, [refresh]);

  const productMap = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products]
  );

  const categories = useMemo(() => {
    const map = new Map();
    for (const product of products) {
      if (product.categories?.id) map.set(product.categories.id, product.categories.name);
    }
    return [...map.entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1])));
  }, [products]);

  const productBatchTotals = useMemo(() => {
    const totals = new Map();
    for (const batch of batches) {
      if (batch.status === "depleted") continue;
      const current = totals.get(batch.product_id) || 0;
      totals.set(batch.product_id, current + Number(batch.quantity || 0));
    }
    return totals;
  }, [batches]);

  const mismatchedProducts = useMemo(() => {
    const list = [];
    for (const product of products) {
      if (!product.batch_tracking) continue;
      const totalInBatches = productBatchTotals.get(product.id) || 0;
      const actualStock = Number(product.stock_quantity || 0);
      if (Math.abs(totalInBatches - actualStock) > 0.001) {
        list.push({
          product,
          totalInBatches,
          actualStock,
          diff: totalInBatches - actualStock
        });
      }
    }
    return list;
  }, [products, productBatchTotals]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return batches.filter((batch) => {
      const effective = effectiveBatchStatus(batch);
      const product = productMap.get(batch.product_id);
      if (productId !== "all" && batch.product_id !== productId) return false;
      if (categoryId !== "all" && product?.categories?.id !== categoryId) return false;
      if (pickingPolicy !== "all" && String(product?.picking_policy || batch.products?.picking_policy || "fifo").toLowerCase() !== pickingPolicy) return false;
      if (status === "available" && !["active", "expiring"].includes(effective)) return false;
      if (status !== "all" && status !== "available" && effective !== status) return false;
      return !needle || [
        batch.batch_number,
        batch.products?.name,
        batch.products?.sku,
        batch.products?.barcode,
        batch.suppliers?.name,
        batch.purchase_receipt_items?.purchase_receipts?.receipt_number
      ].filter(Boolean).join(" ").toLowerCase().includes(needle);
    });
  }, [batches, search, status, productId, categoryId, pickingPolicy, productMap]);

  const metrics = useMemo(() => {
    let active = 0;
    let expiring = 0;
    let expired = 0;
    let quarantined = 0;
    for (const batch of batches) {
      const current = effectiveBatchStatus(batch);
      if (current === "active") active += 1;
      if (current === "expiring") expiring += 1;
      if (current === "expired") expired += 1;
      if (current === "quarantined") quarantined += 1;
    }
    return { active, expiring, expired, quarantined };
  }, [batches]);

  const unassigned = useMemo(() => products
    .filter((product) => product.batch_tracking)
    .reduce((sum, product) => {
      const assigned = batches
        .filter((batch) => batch.product_id === product.id)
        .reduce((subtotal, batch) => subtotal + batch.quantity, 0);
      return sum + Math.max(0, product.stock_quantity - assigned);
    }, 0), [products, batches]);

  function announce(type, text) {
    setMessageType(type);
    setMessage(text);
  }

  async function saveBatch(values) {
    try {
      setBusy(true);
      const result = await createInventoryBatch(supabase, profile, values);
      setFormOpen(false);
      announce("success", `Batch ${result.batch?.batch_number || values.batch_number} saved.`);
      await refresh();
    } catch (error) {
      announce("error", error.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveAdjustment(values) {
    try {
      setBusy(true);
      const result = await adjustInventoryBatch(supabase, values);
      setAdjusting(null);
      announce("success", `Batch updated to ${stockNumber(result.batch?.quantity || 0)} units.`);
      await refresh();
    } catch (error) {
      announce("error", error.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteBatch(batch) {
    if (!batch?.id) return;
    try {
      setBusy(true);
      await deleteInventoryBatch(supabase, batch.id);
      const orgKey = profile?.organization_id || "default";
      const key = `tinypos_deleted_batch_ids_${orgKey}`;
      let existing = [];
      try { existing = JSON.parse(localStorage.getItem(key) || "[]"); } catch (e) { existing = []; }
      if (!existing.includes(batch.id)) existing.push(batch.id);
      localStorage.setItem(key, JSON.stringify(existing));

      setBatches((prev) => prev.filter((b) => b.id !== batch.id));
      announce("success", `Batch lot ${batch.batch_number} deleted.`);
    } catch (error) {
      announce("error", error.message || "Failed to delete batch lot.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus(batch) {
    const target = batch.status === "quarantined" ? "active" : "quarantined";
    const reason = target === "quarantined" ? "Quarantined via Batch Center" : "Released from quarantine";
    try {
      setBusy(true);
      await changeInventoryBatchStatus(supabase, batch.id, target, reason);
      announce("success", `Batch ${batch.batch_number} marked ${target}.`);
      await refresh();
    } catch (error) {
      announce("error", error.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleReconcileProduct(pId, targetStock) {
    try {
      setBusy(true);
      const res = await reconcileProductBatches(supabase, profile, pId);
      announce("success", res.message);
      await refresh();
    } catch (error) {
      announce("error", error.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleReconcileAll() {
    try {
      setBusy(true);
      let count = 0;
      for (const item of mismatchedProducts) {
        await reconcileProductBatches(supabase, profile, item.product.id);
        count++;
      }
      announce("success", `Reconciled ${count} product(s) batch lot quantities to match actual stock.`);
      await refresh();
    } catch (error) {
      announce("error", error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-stack batch-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">LOT TRACEABILITY</p>
          <h1>Batch & Expiry Center</h1>
          <p className="muted">Track lots, expiry dates, FIFO/FEFO picking, quarantine and batch valuation.</p>
        </div>
        <div className="page-heading-actions">
          <button className="primary-button" onClick={() => setFormOpen(true)} disabled={!canAdjust}><Plus size={18} />Add batch</button>
          <button className="secondary-button" onClick={refresh} disabled={loading}><RefreshCw size={18} className={loading ? "spin" : ""} />Refresh</button>
        </div>
      </div>

      {message && <div className={`notice ${messageType}`} onClick={() => setMessage("")}>{message}</div>}

      <div className="batch-metrics">
        <article><Boxes size={21} /><span>Available batches</span><strong>{metrics.active + metrics.expiring}</strong></article>
        <article><CalendarClock size={21} /><span>Expiring within 30 days</span><strong>{metrics.expiring}</strong></article>
        <article><AlertTriangle size={21} /><span>Expired</span><strong>{metrics.expired}</strong></article>
        <article><ShieldAlert size={21} /><span>Quarantined</span><strong>{metrics.quarantined}</strong></article>
        <article><Boxes size={21} /><span>Lot Mismatches</span><strong>{mismatchedProducts.length}</strong></article>
      </div>

      {mismatchedProducts.length > 0 && (
        <div className="notice warning flex-between-notice" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <div>
            <strong>⚠️ Batch Lot Quantity Discrepancy ({mismatchedProducts.length} product(s))</strong>
            <p style={{ margin: "4px 0 0 0", fontSize: "0.9rem" }}>
              Some batch lot totals exceed or differ from actual product stock.
              {mismatchedProducts.map((item) => (
                <span key={item.product.id} style={{ display: "block", marginTop: "2px" }}>
                  • <strong>{item.product.name}</strong>: Batches sum to <strong>{stockNumber(item.totalInBatches)}</strong> units, but actual stock is <strong>{stockNumber(item.actualStock)}</strong> units ({item.diff > 0 ? `+${stockNumber(item.diff)} over stock` : `${stockNumber(item.diff)} under stock`}).
                </span>
              ))}
            </p>
          </div>
          <button
            type="button"
            className="primary-button compact-button"
            disabled={busy}
            onClick={handleReconcileAll}
          >
            Reconcile Batches to Stock
          </button>
        </div>
      )}

      {unassigned > 0 && <div className="notice warning">Some existing stock is not assigned to a lot. Use Add Batch with “Assign existing unbatched stock” before selling batch-tracked products.</div>}

      <section className="panel batch-toolbar">
        <label className="search-box"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search product, batch, supplier or GRN" /></label>
        <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
          <option value="all">All categories</option>
          {categories.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select value={productId} onChange={(event) => setProductId(event.target.value)}>
          <option value="all">All products</option>
          {products.filter((product) => product.batch_tracking).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
        </select>
        <select value={pickingPolicy} onChange={(event) => setPickingPolicy(event.target.value)} aria-label="Filter batches by picking policy">
          <option value="all">All</option>
          <option value="fifo">FIFO</option>
          <option value="fefo">FEFO</option>
        </select>
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="available">Available for sale</option>
          <option value="active">Active</option>
          <option value="expiring">Expiring</option>
          <option value="expired">Expired</option>
          <option value="quarantined">Quarantined</option>
          <option value="depleted">Depleted</option>
          <option value="all">All statuses</option>
        </select>
      </section>

      <ResponsiveDataList
        storageKey="batch-expiry-list"
        title="Batch and expiry list"
        subtitle={`${profile?.branches?.name || "Current branch"} · Current filters`}
        rows={rows}
        filename={`tiny-pos-batches-${new Date().toISOString().slice(0, 10)}.xls`}
        summary={[
          { label: "Available", value: metrics.active + metrics.expiring },
          { label: "Expired", value: metrics.expired },
          { label: "Quarantined", value: metrics.quarantined },
          { label: "Mismatched Products", value: mismatchedProducts.length }
        ]}
        emptyTitle={loading ? "Loading batches..." : "No matching batches"}
        emptyText="Receive a batch-tracked purchase or add an opening batch."
        columns={[
          { label: "Product / lot", width: 240, documentValue: (batch) => `${batch.products?.name || "—"} · ${batch.batch_number}`, render: (batch) => <><strong>{batch.products?.name}</strong><small>{batch.batch_number} · {batch.products?.sku || "No code"} · {batch.products?.picking_policy?.toUpperCase()}</small></> },
          { label: "Category", width: 130, value: (batch) => productMap.get(batch.product_id)?.categories?.name || "Uncategorized" },
          { label: "Received", width: 105, documentValue: (batch) => batchDate(batch.received_date), render: (batch) => batchDate(batch.received_date) },
          { label: "Expiry", width: 145, documentValue: (batch) => batchDate(batch.expiry_date), render: (batch) => { const days = batchDaysRemaining(batch.expiry_date); return <><strong>{batchDate(batch.expiry_date)}</strong>{days !== null && <small>{days < 0 ? `${Math.abs(days)} days expired` : `${days} days remaining`}</small>}</>; } },
          { label: "Status", width: 100, documentValue: (batch) => effectiveBatchStatus(batch), render: (batch) => { const effective = effectiveBatchStatus(batch); return <span className={`batch-status ${effective}`}>{effective}</span>; } },
          {
            label: "Quantity",
            width: 150,
            documentValue: (batch) => `${stockNumber(batch.quantity)} ${batch.products?.unit_name || ""}`,
            render: (batch) => {
              const product = productMap.get(batch.product_id);
              const stockQty = Number(product?.stock_quantity || 0);
              const batchSum = productBatchTotals.get(batch.product_id) || 0;
              const isMismatched = Math.abs(batchSum - stockQty) > 0.001;
              const overage = batchSum - stockQty;

              return (
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  <strong>{stockNumber(batch.quantity)} {batch.products?.unit_name}</strong>
                  <small>Initial {stockNumber(batch.initial_quantity)}</small>
                  {isMismatched && (
                    <div style={{ marginTop: "4px" }}>
                      <small style={{ color: "#d97706", fontWeight: "600", display: "block" }}>
                        {overage > 0 ? `+${stockNumber(overage)} over stock (${stockNumber(stockQty)} actual)` : `${stockNumber(overage)} under stock`}
                      </small>
                      <button
                        type="button"
                        className="secondary-button compact"
                        style={{ marginTop: "2px", fontSize: "0.75rem", padding: "2px 6px" }}
                        disabled={busy}
                        onClick={() => handleReconcileProduct(batch.product_id, stockQty)}
                      >
                        Sync to stock
                      </button>
                    </div>
                  )}
                </div>
              );
            }
          },
          { label: "Unit cost", width: 100, documentValue: (batch) => money(batch.unit_cost, batch.products?.currency || "USD"), render: (batch) => money(batch.unit_cost, batch.products?.currency || "USD") },
          { label: "Value", width: 110, documentValue: (batch) => money(batch.quantity * batch.unit_cost, batch.products?.currency || "USD"), render: (batch) => <strong>{money(batch.quantity * batch.unit_cost, batch.products?.currency || "USD")}</strong> },
          { label: "Source", width: 130, value: (batch) => batch.purchase_receipt_items?.purchase_receipts?.receipt_number || batch.source_type },
          { label: "Actions", actionsOnly: true, excludeDocument: true, render: (batch) => <div className="batch-row-actions"><button className="icon-button" onClick={() => setAdjusting(batch)} disabled={!canAdjust || batch.status === "depleted"} title="Adjust batch"><PencilLine size={17} /></button><button className="secondary-button compact" onClick={() => toggleStatus(batch)} disabled={!canAdjust || batch.status === "depleted"}>{batch.status === "quarantined" ? "Release" : "Quarantine"}</button><button className="icon-button danger-icon-button" onClick={() => handleDeleteBatch(batch)} disabled={!canAdjust || busy} title="Delete batch lot" style={{ color: "#ef4444" }}><Trash2 size={17} /></button></div> }
        ]}
        renderCard={(batch) => {
          const effective = effectiveBatchStatus(batch);
          const days = batchDaysRemaining(batch.expiry_date);
          const product = productMap.get(batch.product_id);
          const stockQty = Number(product?.stock_quantity || 0);
          const batchSum = productBatchTotals.get(batch.product_id) || 0;
          const isMismatched = Math.abs(batchSum - stockQty) > 0.001;
          const overage = batchSum - stockQty;

          return (
            <article className="responsive-data-card batch-list-card">
              <header><div><strong>{batch.products?.name}</strong><small>{batch.batch_number} · {batch.products?.sku || "No code"}</small></div><span className={`batch-status ${effective}`}>{effective}</span></header>
              <div><span>Category</span><strong>{productMap.get(batch.product_id)?.categories?.name || "Uncategorized"}</strong></div>
              <div><span>Received</span><strong>{batchDate(batch.received_date)}</strong></div>
              <div><span>Expiry</span><strong>{batchDate(batch.expiry_date)}</strong><small>{days === null ? "No expiry" : days < 0 ? `${Math.abs(days)} days expired` : `${days} days remaining`}</small></div>
              <div>
                <span>Quantity</span>
                <strong>{stockNumber(batch.quantity)} {batch.products?.unit_name}</strong>
                {isMismatched && (
                  <small style={{ color: "#d97706", display: "block" }}>
                    {overage > 0 ? `+${stockNumber(overage)} over stock (${stockNumber(stockQty)} actual)` : `${stockNumber(overage)} under stock`}
                  </small>
                )}
              </div>
              <div><span>Value</span><strong>{money(batch.quantity * batch.unit_cost, batch.products?.currency || "USD")}</strong></div>
              <footer>
                <button className="secondary-button compact-button" onClick={() => setAdjusting(batch)} disabled={!canAdjust || batch.status === "depleted"}>Adjust</button>
                <button className="secondary-button compact-button" onClick={() => toggleStatus(batch)} disabled={!canAdjust || batch.status === "depleted"}>{batch.status === "quarantined" ? "Release" : "Quarantine"}</button>
                <button className="secondary-button compact-button danger-button" onClick={() => handleDeleteBatch(batch)} disabled={!canAdjust || busy} style={{ color: "#ef4444", borderColor: "color-mix(in srgb, #ef4444 40%, var(--border))", background: "color-mix(in srgb, #ef4444 8%, var(--surface))" }}><Trash2 size={14} style={{ marginRight: "4px" }} />Delete</button>
                {isMismatched && (
                  <button className="primary-button compact-button" disabled={busy} onClick={() => handleReconcileProduct(batch.product_id, stockQty)}>Sync to stock</button>
                )}
              </footer>
            </article>
          );
        }}
      />

      <BatchFormModal open={formOpen} products={products} busy={busy} onClose={() => setFormOpen(false)} onSubmit={saveBatch} />
      <BatchAdjustmentModal batch={adjusting} busy={busy} onClose={() => setAdjusting(null)} onSubmit={saveAdjustment} />
    </div>
  );
}
