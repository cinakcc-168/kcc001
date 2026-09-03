import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BadgePercent,
  CalendarClock,
  Edit3,
  Plus,
  RefreshCw,
  Search,
  TicketPercent,
  ToggleLeft,
  ToggleRight,
  Trash2
} from "lucide-react";
import Modal from "../components/Modal";
import { useAuth } from "../context/AuthContext";
import {
  deleteProductPromotion,
  loadProductPromotionsWorkspace,
  saveProductPromotion,
  toggleProductPromotionActive
} from "../lib/productPromotions";
import { money } from "../lib/catalog";

function toDateTimeLocal(value) {
  if (!value) return "";
  const date = new Date(value);
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function emptyForm() {
  const start = new Date();
  start.setSeconds(0, 0);
  return {
    name: "",
    branch_id: "",
    discount_type: "percent",
    discount_value: "10",
    starts_at: toDateTimeLocal(start.toISOString()),
    ends_at: "",
    allow_coupon: true,
    allow_manual_discount: true,
    allow_online: true,
    max_base_quantity: "",
    is_active: true,
    notes: "",
    promotion_items: []
  };
}

export default function ProductPromotionsPage() {
  const { supabase, profile, can } = useAuth();
  const canManage = can("coupons.manage");
  const [data, setData] = useState({ promotions: [], products: [], branches: [], categories: [] });
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [search, setSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [productCategory, setProductCategory] = useState("all");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");

  async function refresh() {
    if (!canManage) return;
    try {
      setLoading(true);
      setData(await loadProductPromotionsWorkspace(supabase, profile));
    } catch (error) {
      setMessageType("error");
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, [supabase, profile?.organization_id, canManage]);

  const visible = useMemo(() => data.promotions.filter((row) => {
    const needle = search.trim().toLowerCase();
    return !needle || [row.name, row.notes, ...(row.products || []).flatMap((p) => [p.name, p.name_km, p.sku, p.barcode])]
      .filter(Boolean).join(" ").toLowerCase().includes(needle);
  }), [data.promotions, search]);

  const selectableProducts = useMemo(() => {
    const needle = productSearch.trim().toLowerCase();
    return data.products.filter((product) => {
      const matchesSearch = !needle || [product.name, product.name_km, product.sku, product.barcode]
        .filter(Boolean).join(" ").toLowerCase().includes(needle);
      const matchesCategory = productCategory === "all" || product.category_id === productCategory;
      return matchesSearch && matchesCategory;
    });
  }, [data.products, productSearch, productCategory]);

  function openNew() {
    setEditing(null);
    setForm(emptyForm());
    setProductSearch("");
    setProductCategory("all");
    setFormOpen(true);
  }

  function openEdit(row) {
    setEditing(row);
    const promotionItems = (row.promotion_items || []).map((item) => ({
      product_id: item.product_id,
      product_unit_id: item.product_unit_id || "",
      max_unit_quantity: item.max_unit_quantity == null ? "" : String(item.max_unit_quantity),
      reserved_unit_quantity: Number(item.reserved_unit_quantity || 0)
    }));
    setForm({
      name: row.name,
      branch_id: row.branch_id || "",
      discount_type: row.discount_type,
      discount_value: String(row.discount_value),
      starts_at: toDateTimeLocal(row.starts_at),
      ends_at: toDateTimeLocal(row.ends_at),
      allow_coupon: row.allow_coupon !== false,
      allow_manual_discount: row.allow_manual_discount !== false,
      allow_online: row.allow_online !== false,
      max_base_quantity: row.max_base_quantity == null ? "" : String(row.max_base_quantity),
      is_active: row.is_active !== false,
      notes: row.notes || "",
      promotion_items: promotionItems.length
        ? promotionItems
        : (row.products || []).map((product) => ({ product_id: product.id, product_unit_id: "", max_unit_quantity: "", reserved_unit_quantity: 0 }))
    });
    setProductSearch("");
    setProductCategory("all");
    setFormOpen(true);
  }

  async function handleToggleActive(row) {
    const nextState = !row.is_active;
    try {
      setBusyId(row.id);
      setData((prev) => ({
        ...prev,
        promotions: prev.promotions.map((p) => (p.id === row.id ? { ...p, is_active: nextState } : p))
      }));
      await toggleProductPromotionActive(supabase, profile, row.id, nextState);
      setMessageType("success");
      setMessage(`Promotion "${row.name}" is now ${nextState ? "Active" : "Inactive"}.`);
    } catch (error) {
      setMessageType("error");
      setMessage(error.message || "Failed to update promotion status");
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  function confirmDelete(row) {
    setDeleteTarget(row);
  }

  async function executeDelete() {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      await deleteProductPromotion(supabase, profile, deleteTarget.id);
      setData((prev) => ({
        ...prev,
        promotions: prev.promotions.filter((p) => p.id !== deleteTarget.id)
      }));
      setMessageType("success");
      setMessage(`Promotion "${deleteTarget.name}" deleted.`);
      setDeleteTarget(null);
      if (formOpen && editing?.id === deleteTarget.id) {
        setFormOpen(false);
        setEditing(null);
      }
    } catch (error) {
      setMessageType("error");
      setMessage(error.message || "Failed to delete promotion.");
    } finally {
      setDeleting(false);
    }
  }

  function toggleProduct(id) {
    setForm((current) => {
      const exists = current.promotion_items.some((item) => item.product_id === id);
      if (exists) return { ...current, promotion_items: current.promotion_items.filter((item) => item.product_id !== id) };
      const product = data.products.find((item) => item.id === id);
      const baseUnit = (product?.product_units || []).find((unit) => unit.is_base) || product?.product_units?.[0];
      return {
        ...current,
        promotion_items: [...current.promotion_items, {
          product_id: id,
          product_unit_id: baseUnit?.id || "",
          max_unit_quantity: "",
          reserved_unit_quantity: 0
        }]
      };
    });
  }

  function updatePromotionItem(productId, patch) {
    setForm((current) => ({
      ...current,
      promotion_items: current.promotion_items.map((item) => item.product_id === productId ? { ...item, ...patch } : item)
    }));
  }

  async function submit(event) {
    event.preventDefault();
    try {
      if (!form.promotion_items.length) throw new Error("Select at least one product.");
      if (form.promotion_items.some((item) => !item.product_unit_id)) throw new Error("Choose a selling unit for every selected product.");
      setSaving(true);
      await saveProductPromotion(supabase, {
        ...form,
        id: editing?.id || null,
        starts_at: new Date(form.starts_at).toISOString(),
        ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null
      });
      setMessageType("success");
      setMessage(editing ? "Promotion updated." : "Promotion created.");
      setFormOpen(false);
      await refresh();
    } catch (error) {
      setMessageType("error");
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  if (!canManage) {
    return <section className="panel empty-state"><TicketPercent size={46} /><h2>Promotion access is restricted</h2><p>Only owner, admin, or manager can manage product promotions.</p></section>;
  }

  return (
    <div className="page-stack product-promotions-page">
      <div className="page-heading">
        <div><p className="eyebrow">PRODUCTS</p><h1>Product Promotions</h1><p className="muted">Automatic product discounts shown on New Sale and applied securely at checkout.</p></div>
        <div className="heading-actions">
          <button type="button" className="secondary-button" onClick={refresh} disabled={loading}><RefreshCw size={18} className={loading ? "spin" : ""}/> Refresh</button>
          <button type="button" className="primary-button" onClick={openNew}><Plus size={18}/> New promotion</button>
        </div>
      </div>
      {message && <div className={`notice ${messageType}`} onClick={() => setMessage("")}>{message}</div>}
      <div className="panel product-promotions-toolbar"><label className="search-box"><Search size={18}/><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search promotion or product" /></label><span className="muted">{visible.length} promotions</span></div>
      <div className="product-promotion-list">
        {visible.map((row) => {
          const branch = data.branches.find((b) => b.id === row.branch_id);
          const isBusy = busyId === row.id;
          return <article className="panel product-promotion-card" key={row.id}>
            <div className="product-promotion-card-head">
              <div>
                <span className="eyebrow">{row.discount_type === "percent" ? `-${row.discount_value}%` : `-${money(row.discount_value, row.products?.[0]?.currency || "USD")}`}</span>
                <h2>{row.name}</h2>
                <small>{branch?.name || "All branches"}</small>
              </div>
              <div className="product-promotion-card-actions">
                <button
                  type="button"
                  className={`promotion-toggle-btn ${row.is_active ? "is-active" : "is-inactive"}`}
                  onClick={() => handleToggleActive(row)}
                  disabled={isBusy}
                  title={row.is_active ? "Click to deactivate promotion" : "Click to activate promotion"}
                  aria-label={row.is_active ? "Deactivate promotion" : "Activate promotion"}
                >
                  {row.is_active ? <ToggleRight size={20} className="toggle-icon-active" /> : <ToggleLeft size={20} className="toggle-icon-inactive" />}
                  <span>{row.is_active ? "Active" : "Inactive"}</span>
                </button>
                <button
                  type="button"
                  className="secondary-button icon-text-btn"
                  onClick={() => openEdit(row)}
                  title="Edit promotion details"
                >
                  <Edit3 size={15}/> Edit
                </button>
                <button
                  type="button"
                  className="secondary-button danger-button icon-text-btn"
                  onClick={() => confirmDelete(row)}
                  disabled={isBusy}
                  title="Delete promotion"
                  aria-label={`Delete promotion ${row.name}`}
                >
                  <Trash2 size={15}/> Delete
                </button>
              </div>
            </div>
            <div className="product-promotion-flags">
              <span className={row.is_active ? "success" : "muted"}>{row.is_active ? "Active" : "Inactive"}</span>
              <span>{row.allow_coupon ? "Coupon allowed" : "Coupon blocked"}</span>
              <span>{row.allow_manual_discount ? "Manual discount allowed" : "Manual discount blocked"}</span>
              <span>{row.allow_online ? "Online Store allowed" : "In-store only"}</span>
              {(row.promotion_items || []).map((pi) => {
                const prod = (row.products || []).find((p) => p.id === pi.product_id);
                const unit = (prod?.product_units || prod?.units || []).find((u) => u.id === pi.product_unit_id);
                const unitName = unit ? `${unit.name}` : "Unit";
                const limit = pi.max_unit_quantity;
                const remaining = limit != null ? Math.max(0, Number(limit) - Number(pi.reserved_unit_quantity || 0)) : null;
                return (
                  <span key={pi.id || `${pi.product_id}-${pi.product_unit_id}`}>
                    {prod?.name ? `${prod.name} · ` : ""}{unitName}: {limit == null ? "No limit" : `${limit} limit (${remaining} remaining)`}
                  </span>
                );
              })}
            </div>
            <div className="product-promotion-products">{(row.products || []).slice(0, 10).map((p)=><span key={p.id}>{p.name}</span>)}{(row.products || []).length > 10 ? <span>+{row.products.length-10} more</span>:null}</div>
            <small className="muted"><CalendarClock size={14}/> {new Date(row.starts_at).toLocaleString()} {row.ends_at ? `→ ${new Date(row.ends_at).toLocaleString()}` : "→ No end"}</small>
          </article>;
        })}
        {visible.length === 0 && <div className="panel empty-state"><BadgePercent size={42}/><h2>No promotions</h2><p>Create your first product promotion.</p></div>}
      </div>

      {formOpen && <Modal onClose={()=>setFormOpen(false)} title={editing ? "Edit Product Promotion" : "New Product Promotion"} wide>
        <form className="form-grid product-promotion-form" onSubmit={submit}>
          <label className="settings-wide-field"><span>Promotion name *</span><input value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})} required /></label>
          <label><span>Branch</span><select value={form.branch_id} onChange={(e)=>setForm({...form,branch_id:e.target.value})}><option value="">All branches</option>{data.branches.map((b)=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
          <label><span>Discount type</span><select value={form.discount_type} onChange={(e)=>setForm({...form,discount_type:e.target.value})}><option value="percent">Percent off</option><option value="fixed">Fixed amount off</option></select></label>
          <label><span>Discount value *</span><input type="number" min="0.01" step="0.01" value={form.discount_value} onChange={(e)=>setForm({...form,discount_value:e.target.value})} required /></label>
          <label><span>Starts</span><input type="datetime-local" value={form.starts_at} onChange={(e)=>setForm({...form,starts_at:e.target.value})} required /></label>
          <label><span>Ends</span><input type="datetime-local" value={form.ends_at} onChange={(e)=>setForm({...form,ends_at:e.target.value})} /></label>
          <label className="settings-toggle"><span><strong>Allow coupon / promo code</strong><small>Coupon can also discount this promotion line.</small></span><input type="checkbox" checked={form.allow_coupon} onChange={(e)=>setForm({...form,allow_coupon:e.target.checked})}/></label>
          <label className="settings-toggle"><span><strong>Allow manual discount</strong><small>Manual cashier discount can also apply to this promotion line.</small></span><input type="checkbox" checked={form.allow_manual_discount} onChange={(e)=>setForm({...form,allow_manual_discount:e.target.checked})}/></label>
          <label className="settings-toggle"><span><strong>Allow on Online Store</strong><small>When off, the promotion is available only to in-store POS sales.</small></span><input type="checkbox" checked={form.allow_online} onChange={(e)=>setForm({...form,allow_online:e.target.checked})}/></label>
          <div className="settings-wide-field product-promotion-unit-help"><strong>Discount selling unit + quantity limit</strong><small>Select the selling unit that receives the promotion. A limit of 10 Box means only the first 10 Boxes get the promotional price; the 11th Box uses the normal price. Different products can use different units and limits.</small></div>
          <label className="settings-toggle"><span><strong>Active</strong><small>Dates still control when the promotion is live.</small></span><input type="checkbox" checked={form.is_active} onChange={(e)=>setForm({...form,is_active:e.target.checked})}/></label>
          <label className="settings-wide-field"><span>Search products</span><div className="search-box"><Search size={16}/><input value={productSearch} onChange={(e)=>setProductSearch(e.target.value)} placeholder="Name, Khmer name, code or barcode" /></div></label>
          <label><span>Product category</span><select value={productCategory} onChange={(e)=>setProductCategory(e.target.value)}><option value="all">All categories</option>{data.categories.map((category)=><option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <div className="promotion-product-picker settings-wide-field">{selectableProducts.slice(0,80).map((product)=><button type="button" key={product.id} className={`promotion-product-chip ${form.promotion_items.some((item) => item.product_id === product.id) ? "selected" : ""}`} onClick={()=>toggleProduct(product.id)}><strong>{product.name}</strong><small>{product.name_km || ""}</small><small>{product.sku || product.barcode || ""}</small></button>)}</div>
          <div className="settings-wide-field product-promotion-selected-list">
            {form.promotion_items.map((item) => {
              const product = data.products.find((candidate) => candidate.id === item.product_id);
              const units = (product?.product_units || []).filter((unit) => unit.is_active || unit.is_base);
              return <div className="product-promotion-selected-row" key={item.product_id}>
                <div className="product-promotion-selected-name"><strong>{product?.name || "Product"}</strong><small>{product?.sku || product?.barcode || ""}</small></div>
                <select value={item.product_unit_id} onChange={(e)=>updatePromotionItem(item.product_id,{product_unit_id:e.target.value})} aria-label={`Promotion unit for ${product?.name || "product"}`}>
                  {units.map((unit)=><option key={unit.id} value={unit.id}>{unit.name} · 1 = {unit.conversion_factor} base</option>)}
                </select>
                <input type="number" min="1" step="1" value={item.max_unit_quantity} onChange={(e)=>updatePromotionItem(item.product_id,{max_unit_quantity:e.target.value})} placeholder="No limit" aria-label={`Promotion quantity limit for ${product?.name || "product"}`} />
                <button type="button" className="icon-button" title="Remove product" aria-label="Remove product" onClick={()=>toggleProduct(item.product_id)}>×</button>
              </div>;
            })}
            {!form.promotion_items.length && <small className="muted">Select at least one product.</small>}
          </div>
          <label className="settings-wide-field"><span>Notes</span><textarea rows="3" value={form.notes} onChange={(e)=>setForm({...form,notes:e.target.value})}/></label>
          <div className="modal-actions settings-wide-field promotion-modal-actions">
            {editing ? (
              <button
                type="button"
                className="secondary-button danger-button"
                onClick={() => {
                  const target = editing;
                  setFormOpen(false);
                  confirmDelete(target);
                }}
              >
                <Trash2 size={16} /> Delete promotion
              </button>
            ) : <span />}
            <div className="modal-actions-right">
              <button type="button" className="secondary-button" onClick={()=>setFormOpen(false)}>Cancel</button>
              <button type="submit" className="primary-button" disabled={saving}>{saving ? "Saving..." : editing ? "Save promotion" : "Create promotion"}</button>
            </div>
          </div>
        </form>
      </Modal>}

      {deleteTarget && (
        <Modal onClose={() => !deleting && setDeleteTarget(null)} title="Delete Promotion">
          <div className="delete-confirm-dialog">
            <div className="delete-confirm-header">
              <AlertTriangle size={36} className="text-danger" />
              <div>
                <h3>Delete &quot;{deleteTarget.name}&quot;?</h3>
                <p className="muted">
                  Are you sure you want to delete this promotion? This action cannot be undone and will immediately remove the promotion from POS and checkout.
                </p>
              </div>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="danger-button primary-button"
                onClick={executeDelete}
                disabled={deleting}
              >
                {deleting ? "Deleting..." : "Delete promotion"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

