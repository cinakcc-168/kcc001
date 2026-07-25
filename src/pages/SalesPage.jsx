import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Camera,
  Clock3,
  ImageOff,
  CirclePause,
  Plus,
  RefreshCw,
  Search,
  ShoppingCart,
  Trash2
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import BarcodeScanner from "../components/BarcodeScanner";
import Modal from "../components/Modal";
import PaymentModal from "../components/PaymentModal";
import ReceiptModal from "../components/ReceiptModal";
import SaleCart from "../components/SaleCart";
import { cloudinaryThumb, money, stockNumber } from "../lib/catalog";
import {
  calculateSaleTotals,
  completeSale,
  createCustomer,
  createIdempotencyKey,
  exactSaleProductMatch,
  hydrateParkedCart,
  loadSalesWorkspace,
  removeParkedSale,
  saveParkedSale
} from "../lib/sales";

function dateTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

const emptyCustomer = { customer_type: "regular", name: "", phone: "", email: "", notes: "" };

export default function SalesPage() {
  const { supabase, profile, shop, preferences } = useAuth();
  const canSell = ["owner", "admin", "manager", "cashier"].includes(profile?.role);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [parkedSales, setParkedSales] = useState([]);
  const [recentSales, setRecentSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [cart, setCart] = useState([]);
  const [customerId, setCustomerId] = useState("");
  const [discountType, setDiscountType] = useState("none");
  const [discountValue, setDiscountValue] = useState("0");
  const [notes, setNotes] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [customerForm, setCustomerForm] = useState(emptyCustomer);
  const [parkedOpen, setParkedOpen] = useState(false);
  const [activeParkedId, setActiveParkedId] = useState(null);
  const [activeParkLabel, setActiveParkLabel] = useState("");
  const [receipt, setReceipt] = useState(null);
  const [idempotencyKey, setIdempotencyKey] = useState(createIdempotencyKey());

  const refresh = useCallback(async () => {
    if (!supabase || !profile?.organization_id || !profile?.branch_id) return;

    try {
      setLoading(true);
      const data = await loadSalesWorkspace(
        supabase,
        profile.organization_id,
        profile.branch_id
      );
      setProducts(data.products);
      setCategories(data.categories);
      setCustomers(data.customers);
      setParkedSales(data.parkedSales);
      setRecentSales(data.recentSales);
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
      const matchesSearch =
        !needle ||
        [product.name, product.name_km, product.sku, product.barcode]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle));
      const matchesCategory =
        categoryFilter === "all" || product.category_id === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [products, search, categoryFilter, shop]);

  const currency = cart[0]?.currency || shop?.base_currency || "USD";
  const totals = useMemo(
    () => calculateSaleTotals(
      cart,
      discountType,
      discountValue,
      Number(shop?.tax_percent || 0)
    ),
    [cart, discountType, discountValue, shop]
  );

  const selectedCustomer = customers.find((customer) => customer.id === customerId);

  function announce(type, text) {
    setMessageType(type);
    setMessage(text);
  }

  function validateQuantity(product, quantity) {
    const next = Number(quantity);
    if (!Number.isFinite(next) || next <= 0) {
      throw new Error("Quantity must be greater than zero.");
    }

    if (
      product.track_stock &&
      !product.allow_negative_stock &&
      !shop?.allow_negative_stock &&
      next > Number(product.stock_quantity || 0)
    ) {
      throw new Error(
        `${product.name} has only ${stockNumber(product.stock_quantity)} ${product.unit_name} in stock.`
      );
    }

    return next;
  }

  function addProduct(product) {
    try {
      if (!canSell) throw new Error("Your role cannot create sales.");
      if (cart.length > 0 && cart[0].currency !== product.currency) {
        throw new Error(`This bill already uses ${cart[0].currency}. Mixed currencies are not allowed.`);
      }

      const existing = cart.find((item) => item.id === product.id);
      const nextQuantity = validateQuantity(
        product,
        Number(existing?.quantity || 0) + 1
      );

      if (existing) {
        setCart((current) =>
          current.map((item) =>
            item.id === product.id ? { ...item, quantity: nextQuantity } : item
          )
        );
      } else {
        setCart((current) => [...current, { ...product, quantity: 1 }]);
      }

      if (preferences?.scanner_vibration) navigator.vibrate?.(55);
      setSearch("");
      announce("success", `${product.name} added to the bill.`);
    } catch (error) {
      announce("error", error.message);
    }
  }

  function changeQuantity(productId, value) {
    const product = cart.find((item) => item.id === productId);
    if (!product) return;

    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) {
      setCart((current) => current.filter((item) => item.id !== productId));
      return;
    }

    try {
      const quantity = validateQuantity(product, number);
      setCart((current) =>
        current.map((item) => item.id === productId ? { ...item, quantity } : item)
      );
    } catch (error) {
      announce("error", error.message);
    }
  }

  function clearSale() {
    setCart([]);
    setCustomerId("");
    setDiscountType("none");
    setDiscountValue("0");
    setNotes("");
    setActiveParkedId(null);
    setActiveParkLabel("");
    setIdempotencyKey(createIdempotencyKey());
  }

  function handleScan(code) {
    setScannerOpen(false);
    const product = exactSaleProductMatch(products, code);
    if (!product) {
      announce("error", `No active product matches ${code}.`);
      return;
    }
    addProduct(product);
  }

  function submitSearch(event) {
    event.preventDefault();
    const product = exactSaleProductMatch(products, search);
    if (product) addProduct(product);
  }

  async function handlePark() {
    if (cart.length === 0) return;

    try {
      setBusy(true);
      const label = activeParkLabel || `Parked ${new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "2-digit"
      }).format(new Date())}`;

      const saved = await saveParkedSale(supabase, profile, {
        parked_id: activeParkedId,
        label,
        customer_id: customerId,
        currency,
        cart,
        discount_type: discountType,
        discount_value: discountValue,
        notes
      });

      announce("success", `${saved.label || "Sale"} parked successfully.`);
      clearSale();
      await refresh();
    } catch (error) {
      announce("error", error.message);
    } finally {
      setBusy(false);
    }
  }

  function resumeParked(parked) {
    const hydrated = hydrateParkedCart(products, parked.cart);
    if (hydrated.cart.length === 0) {
      announce("error", "This parked sale has no products that are currently available.");
      return;
    }

    setCart(hydrated.cart);
    setCustomerId(parked.customer_id || "");
    setDiscountType(parked.discount_type || "none");
    setDiscountValue(String(parked.discount_value || 0));
    setNotes(parked.notes || "");
    setActiveParkedId(parked.id);
    setActiveParkLabel(parked.label || "Parked sale");
    setIdempotencyKey(createIdempotencyKey());
    setParkedOpen(false);

    if (hydrated.missing.length > 0) {
      announce("error", `${hydrated.missing.length} unavailable product(s) were removed from this parked sale.`);
    } else {
      announce("success", `${parked.label || "Parked sale"} resumed.`);
    }
  }

  async function deleteParked(parkedId) {
    try {
      setBusy(true);
      await removeParkedSale(supabase, parkedId);
      if (activeParkedId === parkedId) clearSale();
      announce("success", "Parked sale deleted.");
      await refresh();
    } catch (error) {
      announce("error", error.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveCustomer(event) {
    event.preventDefault();
    if (!customerForm.name.trim()) {
      announce("error", "Customer name is required.");
      return;
    }

    try {
      setBusy(true);
      const customer = await createCustomer(supabase, profile, customerForm);
      setCustomers((current) =>
        [...current, customer].sort((a, b) => a.name.localeCompare(b.name))
      );
      setCustomerId(customer.id);
      setCustomerOpen(false);
      setCustomerForm(emptyCustomer);
      announce("success", `${customer.name} added as the customer.`);
    } catch (error) {
      announce("error", error.message);
    } finally {
      setBusy(false);
    }
  }

  async function handlePayment(payment) {
    try {
      setBusy(true);
      const result = await completeSale(supabase, {
        cart,
        customer_id: customerId,
        discount_type: discountType,
        discount_value: discountValue,
        tax_amount: totals.taxAmount,
        currency,
        notes,
        idempotency_key: idempotencyKey,
        ...payment
      });

      if (activeParkedId) {
        await removeParkedSale(supabase, activeParkedId);
      }

      const completedAt = new Date().toISOString();
      setReceipt({
        invoiceNumber: result.invoice_number,
        completedAt,
        shopName: shop?.shop_name || "Tiny POS",
        shopPhone: shop?.shop_phone,
        shopAddress: shop?.shop_address,
        footer: shop?.receipt_footer,
        cashierName: profile?.full_name || "POS User",
        customerName: selectedCustomer?.name,
        customerCode: selectedCustomer?.customer_code,
        customerType: selectedCustomer?.customer_type,
        cart: cart.map((item) => ({ ...item })),
        subtotal: Number(result.subtotal ?? totals.subtotal),
        discountAmount: Number(result.discount_amount ?? totals.discountAmount),
        taxAmount: Number(result.tax_amount ?? totals.taxAmount),
        totalAmount: Number(result.total_amount ?? totals.total),
        amountReceived: Number(payment.amount_received),
        changeAmount: Number(result.change_amount || 0),
        paymentMethod: payment.payment_method,
        currency
      });

      setPaymentOpen(false);
      clearSale();
      announce(
        "success",
        `${result.invoice_number} completed for ${money(result.total_amount, currency)}.`
      );
      await refresh();
    } catch (error) {
      announce("error", error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-stack sales-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">POINT OF SALE</p>
          <h1>New Sale</h1>
          <p className="muted">Search, tap or scan products, then accept cash or bank payment.</p>
        </div>
        <div className="heading-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => setParkedOpen(true)}
          >
            <CirclePause size={18} /> Parked ({parkedSales.length})
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => setScannerOpen(true)}
            disabled={!canSell}
          >
            <Camera size={18} /> Scan
          </button>
        </div>
      </div>

      {message && (
        <div className={`notice ${messageType}`} onClick={() => setMessage("")}>
          {message}
        </div>
      )}

      <div className="sale-layout">
        <section className="sale-products-panel panel">
          <form className="sale-toolbar" onSubmit={submitSearch}>
            <label className="search-box">
              <Search size={19} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search product, code or barcode"
              />
            </label>
            <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
              <option value="all">All categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
            <button type="button" className="icon-button refresh-button" onClick={refresh} title="Refresh">
              <RefreshCw className={loading ? "spin" : ""} size={20} />
            </button>
          </form>

          <div className="sale-product-summary">
            <span><strong>{visibleProducts.length}</strong> products available</span>
            <small>Tap a product to add one unit.</small>
          </div>

          {loading ? (
            <div className="empty-state"><RefreshCw className="spin" size={34} /><p>Loading products...</p></div>
          ) : visibleProducts.length === 0 ? (
            <div className="empty-state"><ShoppingCart size={46} /><h2>No sale products found</h2><p>Change the filters or add stock first.</p></div>
          ) : (
            <div className="sale-products-grid">
              {visibleProducts.map((product) => {
                const outOfStock = product.track_stock && Number(product.stock_quantity) <= 0;
                return (
                  <button
                    type="button"
                    className="sale-product-card"
                    key={product.id}
                    onClick={() => addProduct(product)}
                    disabled={outOfStock && !product.allow_negative_stock && !shop?.allow_negative_stock}
                  >
                    <div className="sale-product-image">
                      {product.image?.secure_url ? (
                        <img src={cloudinaryThumb(product.image.secure_url, 240, 180)} alt="" />
                      ) : (
                        <ImageOff size={28} />
                      )}
                    </div>
                    <div className="sale-product-content">
                      <strong>{product.name}</strong>
                      {product.name_km && <span>{product.name_km}</span>}
                      <small>{product.sku || product.barcode || "No code"}</small>
                      <div>
                        <b>{money(product.selling_price, product.currency)}</b>
                        <em className={outOfStock ? "out" : ""}>
                          Stock: {product.track_stock ? `${stockNumber(product.stock_quantity)} ${product.unit_name}` : "∞"}
                        </em>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <SaleCart
          cart={cart}
          customers={customers}
          customerId={customerId}
          onCustomerChange={setCustomerId}
          onAddCustomer={() => setCustomerOpen(true)}
          discountType={discountType}
          discountValue={discountValue}
          onDiscountTypeChange={(value) => {
            setDiscountType(value);
            if (value === "none") setDiscountValue("0");
          }}
          onDiscountValueChange={setDiscountValue}
          notes={notes}
          onNotesChange={setNotes}
          totals={totals}
          currency={currency}
          taxPercent={shop?.tax_percent || 0}
          onQuantityChange={changeQuantity}
          onRemove={(productId) => setCart((current) => current.filter((item) => item.id !== productId))}
          onClear={clearSale}
          onPark={handlePark}
          onPay={() => setPaymentOpen(true)}
          canSell={canSell && !busy}
          activeParkLabel={activeParkLabel}
        />
      </div>

      <section className="panel recent-sales-panel">
        <div className="panel-title-row">
          <div><p className="eyebrow">HISTORY</p><h2>Recent sales</h2></div>
          <Clock3 size={22} />
        </div>
        {recentSales.length === 0 ? (
          <p className="muted">No completed sales yet.</p>
        ) : (
          <div className="recent-sales-table-wrap">
            <table className="recent-sales-table">
              <thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th>Payment</th><th>Status</th><th>Total</th></tr></thead>
              <tbody>
                {recentSales.map((sale) => (
                  <tr key={sale.id}>
                    <td data-label="Invoice"><strong>{sale.invoice_number}</strong></td>
                    <td data-label="Date">{dateTime(sale.completed_at || sale.created_at)}</td>
                    <td data-label="Customer">{sale.customers?.name || "Walk-in"}</td>
                    <td data-label="Payment">{sale.payments?.[0]?.method?.toUpperCase() || "—"}</td>
                    <td data-label="Status"><span className={`status-pill ${sale.status === "completed" ? "active" : "inactive"}`}>{sale.status}</span></td>
                    <td data-label="Total"><strong>{money(sale.total_amount, sale.currency)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <BarcodeScanner
        open={scannerOpen}
        title="Scan product for sale"
        onClose={() => setScannerOpen(false)}
        onDetected={handleScan}
      />

      <PaymentModal
        open={paymentOpen}
        busy={busy}
        totals={totals}
        currency={currency}
        customerName={selectedCustomer?.name}
        onClose={() => setPaymentOpen(false)}
        onSubmit={handlePayment}
      />

      <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />

      {customerOpen && (
        <Modal title="Add customer" onClose={() => !busy && setCustomerOpen(false)}>
          <form className="customer-quick-form" onSubmit={saveCustomer}>
            <label><span>Customer type</span><select value={customerForm.customer_type} onChange={(event) => setCustomerForm((current) => ({ ...current, customer_type: event.target.value }))}><option value="regular">Regular</option><option value="vip">VIP</option><option value="wholesale">Wholesale</option></select></label>
            <label><span>Name *</span><input value={customerForm.name} onChange={(event) => setCustomerForm((current) => ({ ...current, name: event.target.value }))} autoFocus /></label>
            <label><span>Phone</span><input value={customerForm.phone} onChange={(event) => setCustomerForm((current) => ({ ...current, phone: event.target.value }))} /></label>
            <label><span>Email</span><input type="email" value={customerForm.email} onChange={(event) => setCustomerForm((current) => ({ ...current, email: event.target.value }))} /></label>
            <label><span>Note</span><textarea rows="3" value={customerForm.notes} onChange={(event) => setCustomerForm((current) => ({ ...current, notes: event.target.value }))} /></label>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setCustomerOpen(false)} disabled={busy}>Cancel</button>
              <button type="submit" className="primary-button" disabled={busy}><Plus size={18} /> {busy ? "Saving..." : "Add customer"}</button>
            </div>
          </form>
        </Modal>
      )}

      {parkedOpen && (
        <Modal title="Parked sales" onClose={() => !busy && setParkedOpen(false)}>
          <div className="parked-sales-list">
            {parkedSales.length === 0 ? (
              <div className="cart-empty"><CirclePause size={42} /><strong>No parked sales</strong><span>Park a bill to continue it later.</span></div>
            ) : (
              parkedSales.map((parked) => {
                const customer = customers.find((item) => item.id === parked.customer_id);
                return (
                  <article key={parked.id}>
                    <div>
                      <strong>{parked.label || "Parked sale"}</strong>
                      <span>{customer?.name || "Walk-in"} · {Array.isArray(parked.cart) ? parked.cart.length : 0} products</span>
                      <small>{dateTime(parked.created_at)}</small>
                    </div>
                    <div>
                      <button type="button" className="secondary-button" onClick={() => resumeParked(parked)} disabled={busy}>Resume</button>
                      <button type="button" className="icon-button danger-icon" onClick={() => deleteParked(parked.id)} disabled={busy} aria-label="Delete parked sale"><Trash2 size={18} /></button>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
