import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownAZ,
  Boxes,
  Download,
  ImageOff,
  Pencil,
  Plus,
  PackageOpen,
  Printer,
  RefreshCw,
  Search,
  Tags
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import Modal from "../components/Modal";
import ProductForm from "../components/ProductForm";
import CategoryForm from "../components/CategoryForm";
import ProductUnitsModal from "../components/ProductUnitsModal";
import {
  cloudinaryThumb,
  createCategory,
  createProduct,
  loadCatalog,
  money,
  removePrimaryImage,
  stockNumber,
  updateCategory,
  updateProduct,
  uploadPrimaryImage
} from "../lib/catalog";
import { saveProductBatchSettings } from "../lib/batches";

export default function ProductsPage() {
  const { supabase, session, profile, can } = useAuth();
  const canManage = can("products.manage");
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");
  const [sortOrder, setSortOrder] = useState("name_az");
  const [productModal, setProductModal] = useState(null);
  const [categoryModal, setCategoryModal] = useState(null);
  const [showCategories, setShowCategories] = useState(false);
  const [unitsProduct, setUnitsProduct] = useState(null);

  const refresh = useCallback(async () => {
    if (!supabase || !profile?.organization_id || !profile?.branch_id) return;
    try {
      setLoading(true);
      const data = await loadCatalog(supabase, profile.organization_id, profile.branch_id);
      setCategories(data.categories);
      setProducts(data.products);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }, [supabase, profile]);

  useEffect(() => { refresh(); }, [refresh]);

  const filteredProducts = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return products.filter((product) => {
      const matchesSearch = !needle || [
        product.name,
        product.name_km,
        product.sku,
        product.barcode,
        ...(product.product_units || []).flatMap((unit) => [
          unit.name,
          unit.short_name,
          unit.barcode
        ])
      ]
        .filter(Boolean)
        .some((value) =>
          String(value).toLowerCase().includes(needle)
        );
      const matchesCategory = categoryFilter === "all" || product.category_id === categoryFilter;
      const matchesStatus = (() => {
        if (statusFilter === "all") return true;
        if (statusFilter === "active") return product.is_active;
        if (statusFilter === "inactive") return !product.is_active;
        return product.is_active && product.stock_status === statusFilter;
      })();
      return matchesSearch && matchesCategory && matchesStatus;
    }).sort((a, b) => {
      if (sortOrder === "name_za") return String(b.name || "").localeCompare(String(a.name || ""), "en", { sensitivity: "base" });
      if (sortOrder === "km_az") return String(a.name_km || a.name || "").localeCompare(String(b.name_km || b.name || ""), "km");
      if (sortOrder === "km_za") return String(b.name_km || b.name || "").localeCompare(String(a.name_km || a.name || ""), "km");
      return String(a.name || "").localeCompare(String(b.name || ""), "en", { sensitivity: "base" });
    });
  }, [products, search, categoryFilter, statusFilter, sortOrder]);

  function csvCell(value) {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }

  function exportProducts() {
    const rows = [
      ["Code", "Barcode", "Product", "Khmer name", "Category", "Price", "Cost", "Stock", "Unit", "Low-stock threshold", "Stock status", "Product status"],
      ...filteredProducts.map((product) => [
        product.sku, product.barcode, product.name, product.name_km,
        product.categories?.name || "Uncategorized", product.selling_price,
        product.average_cost || product.default_cost, product.stock_quantity, product.unit_name,
        product.effective_low_stock_threshold, product.stock_status, product.is_active ? "active" : "inactive"
      ])
    ];
    const blob = new Blob(["\uFEFF", rows.map((row) => row.map(csvCell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `tiny-pos-products-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function printProducts() {
    const win = window.open("", "_blank", "noopener,noreferrer");
    if (!win) { setMessage("Allow pop-ups to print the product list."); return; }
    const rows = filteredProducts.map((product) => `
      <tr><td>${product.sku || "—"}</td><td>${product.name}${product.name_km ? `<br><small>${product.name_km}</small>` : ""}</td><td>${product.categories?.name || "Uncategorized"}</td><td>${stockNumber(product.stock_quantity)} ${product.unit_name}</td><td>${stockNumber(product.effective_low_stock_threshold)}</td><td>${product.stock_status.replaceAll("_", " ")}</td><td>${money(product.selling_price, product.currency)}</td></tr>`).join("");
    win.document.write(`<!doctype html><html><head><title>Products</title><style>@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Khmer:wght@400;600;700&display=swap');body{font-family:'Noto Sans Khmer','Khmer OS System',Arial,sans-serif;padding:24px;color:#111}h1{margin:0 0 6px}p{color:#555}table{width:100%;border-collapse:collapse;margin-top:18px}th,td{border:1px solid #bbb;padding:8px;text-align:left}th{background:#eee}small{color:#555}@media print{button{display:none}}</style></head><body><h1>Products</h1><p>${filteredProducts.length} products · ${new Date().toLocaleString()}</p><table><thead><tr><th>Code</th><th>Product</th><th>Category</th><th>Stock</th><th>Low at</th><th>Status</th><th>Price</th></tr></thead><tbody>${rows}</tbody></table><script>window.onload=()=>window.print()<\/script></body></html>`);
    win.document.close();
  }

  function openCategoryEditor(category = {}) {
    setShowCategories(false);
    setCategoryModal(category);
  }

  function closeCategoryEditor() {
    setCategoryModal(null);
    setShowCategories(true);
  }

  async function saveProduct({ form, imageFile, removeImage }) {
    if (!canManage) throw new Error("Your role cannot manage products.");
    setBusy(true);
    let productSaved = false;
    try {
      let productId = productModal?.id;
      let oldImage = productModal?.image || null;

      if (productModal?.id) {
        await updateProduct(supabase, productModal.id, form);
      } else {
        const created = await createProduct(supabase, form);
        productId = created.product_id;
      }
      productSaved = true;
      await saveProductBatchSettings(supabase, productId, form);

      if (removeImage && oldImage) {
        await removePrimaryImage({ supabase, session, image: oldImage });
        oldImage = null;
      }

      if (imageFile) {
        await uploadPrimaryImage({ supabase, session, profile, productId, file: imageFile });
      }

      setMessage(productModal?.id ? "Product updated successfully." : "Product created successfully.");
      setProductModal(null);
      await refresh();
    } catch (error) {
      if (productSaved) {
        setMessage(`Product saved, but the photo operation failed: ${error.message}`);
        setProductModal(null);
        await refresh();
        return;
      }
      throw error;
    } finally {
      setBusy(false);
    }
  }

  async function saveCategory(values) {
    if (!canManage) throw new Error("Your role cannot manage categories.");
    setBusy(true);
    try {
      if (categoryModal?.id) await updateCategory(supabase, categoryModal.id, values);
      else await createCategory(supabase, profile, values);
      setMessage(categoryModal?.id ? "Category updated." : "Category created.");
      setCategoryModal(null);
      setShowCategories(true);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">CATALOG</p>
          <h1>Products</h1>
          <p className="muted">Manage categories, product codes, barcodes, prices, opening stock and product photos.</p>
        </div>
        <div className="heading-actions">
          <button className="secondary-button" onClick={() => setShowCategories(true)}><Tags size={18} /> Categories</button>
          <button className="primary-button" onClick={() => setProductModal({})} disabled={!canManage}><Plus size={18} /> Add product</button>
        </div>
      </div>

      {message && <div className="notice success" onClick={() => setMessage("")}>{message}</div>}

      <section className="panel catalog-toolbar">
        <label className="search-box"><Search size={19} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, code or barcode" /></label>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="all">All categories</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="active">Active products</option>
          <option value="low_stock">Low stock</option>
          <option value="out_of_stock">Out of stock</option>
          <option value="healthy">Healthy stock</option>
          <option value="inactive">Inactive products</option>
          <option value="all">All status</option>
        </select>
        <label className="catalog-sort-select"><ArrowDownAZ size={18} /><select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
          <option value="name_az">Name A–Z</option>
          <option value="name_za">Name Z–A</option>
          <option value="km_az">Khmer ក–អ</option>
          <option value="km_za">Khmer អ–ក</option>
        </select></label>
        <button className="icon-button refresh-button" onClick={exportProducts} title="Export CSV"><Download size={20} /></button>
        <button className="icon-button refresh-button" onClick={printProducts} title="Print"><Printer size={20} /></button>
        <button className="icon-button refresh-button" onClick={refresh} title="Refresh"><RefreshCw size={20} /></button>
      </section>

      <section className="panel product-list-panel">
        <div className="list-summary"><strong>{filteredProducts.length}</strong><span>products shown</span></div>
        {loading ? (
          <div className="empty-state"><RefreshCw className="spin" size={34} /><p>Loading products...</p></div>
        ) : filteredProducts.length === 0 ? (
          <div className="empty-state"><Boxes size={48} /><h2>No products found</h2><p>Add the first product or change the current filters.</p></div>
        ) : (
          <div className="product-table-wrap">
            <table className="product-table">
              <thead><tr><th>Product</th><th>Barcode</th><th>Category</th><th>Price</th><th>Cost</th><th>Stock</th><th>Status</th><th>Units</th><th></th></tr></thead>
              <tbody>
                {filteredProducts.map((product) => {
                  const low = ["low_stock", "out_of_stock"].includes(product.stock_status);
                  return <tr key={product.id}>
                    <td data-label="Product"><div className="product-cell">
                      <div className="product-thumb">{product.image?.secure_url ? <img src={cloudinaryThumb(product.image.secure_url, 96, 96)} alt="" /> : <ImageOff size={24} />}</div>
                      <div><strong>{product.name}</strong>{product.name_km && <span>{product.name_km}</span>}<small>{product.sku || "No code"} · {product.unit_name}</small></div>
                    </div></td>
                    <td data-label="Barcode">{product.barcode || "—"}</td>
                    <td data-label="Category">{product.categories?.name || "Uncategorized"}</td>
                    <td data-label="Price"><strong>{money(product.selling_price, product.currency)}</strong></td>
                    <td data-label="Cost">{money(product.average_cost || product.default_cost, product.currency)}</td>
                    <td data-label="Stock"><span className={low ? "stock-badge low" : "stock-badge"}>{product.track_stock ? `${stockNumber(product.stock_quantity)} ${product.unit_name}` : "Not tracked"}</span><small className="stock-threshold-note">Low at {stockNumber(product.effective_low_stock_threshold)}</small></td>
                    <td data-label="Status"><span className={`status-pill ${product.is_active ? "active" : "inactive"}`}>{product.is_active ? "Active" : "Inactive"}</span></td>
                    <td data-label="Units">
                      <button
                        type="button"
                        className="secondary-button product-units-button"
                        onClick={() => setUnitsProduct(product)}
                        disabled={!canManage}
                        title="Manage selling units"
                      >
                        <PackageOpen size={17} />
                        {(product.product_units || []).filter((unit) => unit.is_active).length}
                      </button>
                    </td>
                    <td><button className="icon-button table-action" onClick={() => setProductModal(product)} disabled={!canManage} title="Edit product"><Pencil size={18} /></button></td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {productModal && <Modal title={productModal.id ? "Edit product" : "Add product"} onClose={() => !busy && setProductModal(null)} wide>
        <ProductForm product={productModal.id ? productModal : null} categories={categories} busy={busy} onCancel={() => setProductModal(null)} onSave={saveProduct} />
      </Modal>}

      {categoryModal && <Modal title={categoryModal.id ? "Edit category" : "Add category"} onClose={() => !busy && closeCategoryEditor()}>
        <CategoryForm category={categoryModal.id ? categoryModal : null} busy={busy} onCancel={closeCategoryEditor} onSave={saveCategory} />
      </Modal>}

      {unitsProduct && (
        <ProductUnitsModal
          product={unitsProduct}
          supabase={supabase}
          profile={profile}
          busy={busy}
          onBusyChange={setBusy}
          onClose={() => setUnitsProduct(null)}
          onSaved={async () => {
            const refreshed = await loadCatalog(
              supabase,
              profile.organization_id,
              profile.branch_id
            );
            setCategories(refreshed.categories);
            setProducts(refreshed.products);
            const updatedProduct = refreshed.products.find(
              (item) => item.id === unitsProduct.id
            );
            setUnitsProduct(updatedProduct || null);
          }}
        />
      )}

      {showCategories && <Modal title="Categories" onClose={() => setShowCategories(false)}>
        <div className="category-manager">
          <button className="primary-button" onClick={() => openCategoryEditor({})} disabled={!canManage}><Plus size={18} /> Add category</button>
          <div className="category-list">
            {categories.map((category) => <div className="category-row" key={category.id}>
              <div><strong>{category.name}</strong><small>{category.description || "No description"}</small></div>
              <span className={`status-pill ${category.is_active ? "active" : "inactive"}`}>{category.is_active ? "Active" : "Inactive"}</span>
              <button className="icon-button" onClick={() => openCategoryEditor(category)} disabled={!canManage}><Pencil size={18} /></button>
            </div>)}
          </div>
        </div>
      </Modal>}
    </div>
  );
}
