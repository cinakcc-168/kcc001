import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Boxes,
  ImageOff,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Tags
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import Modal from "../components/Modal";
import ProductForm from "../components/ProductForm";
import CategoryForm from "../components/CategoryForm";
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

export default function ProductsPage() {
  const { supabase, session, profile } = useAuth();
  const canManage = ["owner", "admin", "manager"].includes(profile?.role);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");
  const [productModal, setProductModal] = useState(null);
  const [categoryModal, setCategoryModal] = useState(null);
  const [showCategories, setShowCategories] = useState(false);

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
      const matchesSearch = !needle || [product.name, product.name_km, product.sku, product.barcode]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
      const matchesCategory = categoryFilter === "all" || product.category_id === categoryFilter;
      const matchesStatus = statusFilter === "all" || (statusFilter === "active" ? product.is_active : !product.is_active);
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [products, search, categoryFilter, statusFilter]);

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
          <option value="inactive">Inactive products</option>
          <option value="all">All status</option>
        </select>
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
              <thead><tr><th>Product</th><th>Barcode</th><th>Category</th><th>Price</th><th>Cost</th><th>Stock</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {filteredProducts.map((product) => {
                  const low = product.track_stock && product.stock_quantity <= Number(product.low_stock_threshold || 0);
                  return <tr key={product.id}>
                    <td data-label="Product"><div className="product-cell">
                      <div className="product-thumb">{product.image?.secure_url ? <img src={cloudinaryThumb(product.image.secure_url, 96, 96)} alt="" /> : <ImageOff size={24} />}</div>
                      <div><strong>{product.name}</strong>{product.name_km && <span>{product.name_km}</span>}<small>{product.sku || "No code"} · {product.unit_name}</small></div>
                    </div></td>
                    <td data-label="Barcode">{product.barcode || "—"}</td>
                    <td data-label="Category">{product.categories?.name || "Uncategorized"}</td>
                    <td data-label="Price"><strong>{money(product.selling_price, product.currency)}</strong></td>
                    <td data-label="Cost">{money(product.average_cost || product.default_cost, product.currency)}</td>
                    <td data-label="Stock"><span className={low ? "stock-badge low" : "stock-badge"}>{product.track_stock ? `${stockNumber(product.stock_quantity)} ${product.unit_name}` : "Not tracked"}</span></td>
                    <td data-label="Status"><span className={`status-pill ${product.is_active ? "active" : "inactive"}`}>{product.is_active ? "Active" : "Inactive"}</span></td>
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

      {categoryModal && <Modal title={categoryModal.id ? "Edit category" : "Add category"} onClose={() => !busy && setCategoryModal(null)}>
        <CategoryForm category={categoryModal.id ? categoryModal : null} busy={busy} onCancel={() => setCategoryModal(null)} onSave={saveCategory} />
      </Modal>}

      {showCategories && <Modal title="Categories" onClose={() => setShowCategories(false)}>
        <div className="category-manager">
          <button className="primary-button" onClick={() => setCategoryModal({})} disabled={!canManage}><Plus size={18} /> Add category</button>
          <div className="category-list">
            {categories.map((category) => <div className="category-row" key={category.id}>
              <div><strong>{category.name}</strong><small>{category.description || "No description"}</small></div>
              <span className={`status-pill ${category.is_active ? "active" : "inactive"}`}>{category.is_active ? "Active" : "Inactive"}</span>
              <button className="icon-button" onClick={() => setCategoryModal(category)} disabled={!canManage}><Pencil size={18} /></button>
            </div>)}
          </div>
        </div>
      </Modal>}
    </div>
  );
}
