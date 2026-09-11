import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Camera,
  ClipboardCheck,
  History,
  PackagePlus,
  PencilLine,
  RefreshCw,
  Search,
  Truck,
  Warehouse
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import Modal from "../components/Modal";
import BarcodeScanner from "../components/BarcodeScanner";
import InventoryAdjustmentForm from "../components/InventoryAdjustmentForm";
import PurchaseReceiveForm from "../components/PurchaseReceiveForm";
import SupplierForm from "../components/SupplierForm";
import ResponsiveDataList from "../components/ResponsiveDataList";
import MediaImage from "../components/MediaImage";
import { money, stockNumber } from "../lib/catalog";
import {
  adjustInventory,
  createSupplier,
  exactProductMatch,
  loadInventory,
  movementLabels,
  receivePurchase
} from "../lib/inventory";

function dateTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export default function InventoryPage() {
  const { supabase, profile, shop, can } = useAuth();
  const { t } = useLanguage();
  const canManage = can("inventory.adjust");
  const currency = shop?.base_currency || "USD";

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [movements, setMovements] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
  const [movementFilter, setMovementFilter] = useState("all");
  const [adjustment, setAdjustment] = useState(null);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [countScannerOpen, setCountScannerOpen] = useState(false);

  const refresh = useCallback(async () => {
    if (!supabase || !profile?.organization_id || !profile?.branch_id) return;

    try {
      setLoading(true);
      const data = await loadInventory(
        supabase,
        profile.organization_id,
        profile.branch_id
      );
      setProducts(data.products);
      setCategories(data.categories);
      setSuppliers(data.suppliers);
      setMovements(data.movements);
      setPurchases(data.purchases);
    } catch (error) {
      setMessageType("error");
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }, [supabase, profile]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const visibleProducts = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return products.filter((product) => {
      const matchesSearch = !needle ||
        [product.name, product.name_km, product.sku, product.barcode]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle));
      const matchesCategory = categoryFilter === "all" || product.category_id === categoryFilter;
      const matchesStock =
        stockFilter === "all" ||
        (stockFilter === "low" && ["low_stock", "out_of_stock"].includes(product.stock_status)) ||
        (stockFilter === "out" && product.stock_status === "out_of_stock") ||
        (stockFilter === "positive" && product.stock_quantity > 0) ||
        (stockFilter === "healthy" && product.stock_status === "healthy");

      return product.is_active && product.track_stock && matchesSearch && matchesCategory && matchesStock;
    });
  }, [products, search, categoryFilter, stockFilter]);

  const filteredMovements = useMemo(
    () => movementFilter === "all"
      ? movements
      : movements.filter((movement) => movement.movement_type === movementFilter),
    [movements, movementFilter]
  );

  const metrics = useMemo(() => {
    const tracked = products.filter((product) => product.is_active && product.track_stock);
    return {
      products: tracked.length,
      units: tracked.reduce((sum, product) => sum + product.stock_quantity, 0),
      value: tracked.reduce(
        (sum, product) => sum + product.stock_quantity * product.average_cost,
        0
      ),
      low: tracked.filter(
        (product) => ["low_stock", "out_of_stock"].includes(product.stock_status)
      ).length
    };
  }, [products]);

  async function saveAdjustment(values) {
    try {
      setBusy(true);
      const result = await adjustInventory(supabase, values);
      setAdjustment(null);
      setMessageType("success");
      setMessage(
        result.batch
          ? `${result.adjustment_number} saved. Batch stock: ${stockNumber(result.batch_quantity_after)}. Total stock: ${stockNumber(result.quantity_after)}.`
          : `${result.adjustment_number} saved. New stock: ${stockNumber(result.quantity_after)}.`
      );
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function savePurchase(values) {
    try {
      setBusy(true);
      const result = await receivePurchase(supabase, values);
      setPurchaseOpen(false);
      setMessageType("success");
      setMessage(`${result.purchase_number} received. Total ${money(result.total_amount, result.currency)}.`);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function saveSupplier(values) {
    try {
      setBusy(true);
      const supplier = await createSupplier(supabase, profile, values);
      setSuppliers((current) => [...current, supplier].sort((a, b) => a.name.localeCompare(b.name)));
      setSupplierOpen(false);
      setMessageType("success");
      setMessage(`Supplier ${supplier.name} created.`);
    } finally {
      setBusy(false);
    }
  }

  function handleCountScan(code) {
    setCountScannerOpen(false);
    const product = exactProductMatch(products, code);
    if (!product) {
      setMessageType("error");
      setMessage(`No product matches ${code}.`);
      return;
    }
    if (!product.track_stock) {
      setMessageType("error");
      setMessage(`${product.name} does not track stock.`);
      return;
    }
    setAdjustment({ product, mode: "set" });
  }

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t("INVENTORY")}</p>
          <h1>{t("Inventory")}</h1>
          <p className="muted">{t("Receive purchases, count stock, make controlled adjustments and review every movement.")}</p>
        </div>
        <div className="heading-actions">
          <button className="secondary-button" onClick={() => setCountScannerOpen(true)} disabled={!canManage}>
            <Camera size={18} /> {t("Camera stock count")}
          </button>
          <button className="primary-button" onClick={() => setPurchaseOpen(true)} disabled={!canManage}>
            <PackagePlus size={18} /> {t("Receive purchase")}
          </button>
        </div>
      </div>

      {message && (
        <div className={`notice ${messageType}`} onClick={() => setMessage("")}>{message}</div>
      )}

      <div className="inventory-metrics">
        <article><Warehouse size={21} /><span>{t("Tracked products")}</span><strong>{metrics.products}</strong></article>
        <article><ClipboardCheck size={21} /><span>{t("Total stock units")}</span><strong>{stockNumber(metrics.units)}</strong></article>
        <article><History size={21} /><span>{t("Stock value")}</span><strong>{money(metrics.value, currency)}</strong></article>
        <article><PencilLine size={21} /><span>{t("Low stock")}</span><strong>{metrics.low}</strong></article>
      </div>

      <section className="panel inventory-toolbar">
        <label className="search-box"><Search size={19} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("Search name, product code or barcode")} /></label>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="all">{t("All categories")}</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>
        <select value={stockFilter} onChange={(e) => setStockFilter(e.target.value)}>
          <option value="all">{t("All stock")}</option>
          <option value="positive">{t("In stock")}</option>
          <option value="low">{t("Low stock (including out)")}</option>
          <option value="out">{t("Out of stock")}</option>
          <option value="healthy">{t("Healthy stock")}</option>
        </select>
        <button className="icon-button refresh-button" onClick={refresh} title={t("Refresh")}><RefreshCw className={loading ? "spin" : ""} size={20} /></button>
      </section>

      <ResponsiveDataList
        storageKey="inventory-products"
        title={t("Inventory list")}
        subtitle={`${profile?.branches?.name || t("Current branch")} · ${t("Current filtered inventory")}`}
        rows={visibleProducts}
        filename={`tiny-pos-inventory-${new Date().toISOString().slice(0, 10)}.xls`}
        summary={[
          { label: t("Tracked products"), value: visibleProducts.length },
          { label: t("Total units"), value: stockNumber(visibleProducts.reduce((sum, product) => sum + Number(product.stock_quantity || 0), 0)) },
          { label: t("Stock value"), value: money(visibleProducts.reduce((sum, product) => sum + Number(product.stock_quantity || 0) * Number(product.average_cost || 0), 0), currency) }
        ]}
        emptyTitle={loading ? t("Loading inventory...") : t("No matching stock items")}
        emptyText={t("Change the filters or create products first.")}
        columns={[
          { label: t("Product"), width: 260, documentValue: (product) => product.name, render: (product) => <div className="inventory-product"><div className="inventory-product-thumb"><MediaImage src={product.image} alt={product.name} width={110} height={110} /></div><div><strong>{product.name}</strong><span>{product.sku || t("No code")} · {product.barcode || t("No barcode")}</span></div></div> },
          { label: t("Category"), width: 140, value: (product) => product.categories?.name || t("Uncategorized") },
          { label: t("Stock"), width: 130, documentValue: (product) => `${stockNumber(product.stock_quantity)} ${product.unit_name}`, render: (product) => <><span className={["low_stock", "out_of_stock"].includes(product.stock_status) ? "stock-badge low" : "stock-badge"}>{stockNumber(product.stock_quantity)} {product.unit_name}</span><small className="stock-threshold-note">{t("Low at")} {stockNumber(product.effective_low_stock_threshold)}</small></> },
          { label: t("Average cost"), width: 110, documentValue: (product) => money(product.average_cost, product.currency), render: (product) => money(product.average_cost, product.currency) },
          { label: t("Stock value"), width: 120, documentValue: (product) => money(product.stock_quantity * product.average_cost, product.currency), render: (product) => <strong>{money(product.stock_quantity * product.average_cost, product.currency)}</strong> },
          { label: t("Status"), width: 100, value: (product) => t(String(product.stock_status || "").replaceAll("_", " ")) },
          { label: t("Updated"), width: 150, documentValue: (product) => dateTime(product.balance_updated_at), render: (product) => dateTime(product.balance_updated_at) },
          { label: t("Actions"), actionsOnly: true, excludeDocument: true, render: (product) => <button className="secondary-button table-button" onClick={() => setAdjustment({ product, mode: "add" })} disabled={!canManage}>{t("Adjust")}</button> }
        ]}
        renderCard={(product) => (
          <article className="responsive-data-card inventory-list-card">
            <header><div className="inventory-card-product"><div className="inventory-product-thumb"><MediaImage src={product.image} alt={product.name} width={120} height={120} /></div><div><strong>{product.name}</strong><small>{product.sku || product.barcode || t("No code")}</small></div></div><span className={["low_stock", "out_of_stock"].includes(product.stock_status) ? "stock-badge low" : "stock-badge"}>{stockNumber(product.stock_quantity)} {product.unit_name}</span></header>
            <div><span>{t("Category")}</span><strong>{product.categories?.name || t("Uncategorized")}</strong></div>
            <div><span>{t("Average cost")}</span><strong>{money(product.average_cost, product.currency)}</strong></div>
            <div><span>{t("Stock value")}</span><strong>{money(product.stock_quantity * product.average_cost, product.currency)}</strong></div>
            <footer><small>{dateTime(product.balance_updated_at)}</small><button className="secondary-button compact-button" onClick={() => setAdjustment({ product, mode: "add" })} disabled={!canManage}>{t("Adjust")}</button></footer>
          </article>
        )}
      />

      <div className="inventory-bottom-grid">
        <section className="panel">
          <div className="panel-title-row">
            <div><p className="eyebrow">{t("PURCHASES")}</p><h2>{t("Recent purchases")}</h2></div>
            <Truck size={22} />
          </div>
          <div className="compact-list">
            {purchases.length === 0 ? <p className="muted">{t("No purchases received yet.")}</p> : purchases.slice(0, 8).map((purchase) => (
              <div key={purchase.id}>
                <span><strong>{purchase.purchase_number}</strong><small>{purchase.suppliers?.name || t("No supplier")} · {dateTime(purchase.received_at || purchase.created_at)}</small></span>
                <span><strong>{money(purchase.total_amount, purchase.currency)}</strong><small>{Number(purchase.amount_paid) >= Number(purchase.total_amount) ? t("Paid") : `${t("Due")} ${money(Number(purchase.total_amount) - Number(purchase.amount_paid), purchase.currency)}`}</small></span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-title-row movement-title-row">
            <div><p className="eyebrow">{t("HISTORY")}</p><h2>{t("Stock movements")}</h2></div>
            <select value={movementFilter} onChange={(event) => setMovementFilter(event.target.value)}>
              <option value="all">{t("All movements")}</option>
              {Object.entries(movementLabels).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}
            </select>
          </div>
          <div className="compact-list movement-list">
            {filteredMovements.length === 0 ? <p className="muted">{t("No stock movements found.")}</p> : filteredMovements.slice(0, 20).map((movement) => (
              <div key={movement.id}>
                <span><strong>{movement.products?.name || t("Deleted product")}</strong><small>{t(movementLabels[movement.movement_type] || movement.movement_type)} · {dateTime(movement.created_at)}</small></span>
                <span className={Number(movement.quantity_change) >= 0 ? "movement-positive" : "movement-negative"}>
                  <strong>{Number(movement.quantity_change) >= 0 ? "+" : ""}{stockNumber(movement.quantity_change)}</strong>
                  <small>{stockNumber(movement.quantity_before)} → {stockNumber(movement.quantity_after)}</small>
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {adjustment && (
        <Modal title={adjustment.mode === "set" ? t("Count stock") : t("Adjust inventory")} onClose={() => !busy && setAdjustment(null)} className="inventory-adjust-modal">
          <InventoryAdjustmentForm product={adjustment.product} initialMode={adjustment.mode} busy={busy} onCancel={() => setAdjustment(null)} onSave={saveAdjustment} />
        </Modal>
      )}

      {purchaseOpen && (
        <Modal title={t("Receive purchase")} onClose={() => !busy && setPurchaseOpen(false)} wide>
          <PurchaseReceiveForm products={products} suppliers={suppliers} currency={currency} busy={busy} onCancel={() => setPurchaseOpen(false)} onAddSupplier={() => setSupplierOpen(true)} onSave={savePurchase} />
        </Modal>
      )}

      {supplierOpen && (
        <Modal title={t("New supplier")} onClose={() => !busy && setSupplierOpen(false)}>
          <SupplierForm busy={busy} onCancel={() => setSupplierOpen(false)} onSave={saveSupplier} />
        </Modal>
      )}

      <BarcodeScanner open={countScannerOpen} title={t("Scan product for stock count")} onClose={() => setCountScannerOpen(false)} onDetected={handleCountScan} />
    </div>
  );
}
