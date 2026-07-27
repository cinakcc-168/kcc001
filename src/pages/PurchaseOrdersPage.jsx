import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Ban,
  Building2,
  CircleDollarSign,
  ClipboardList,
  Edit3,
  Eye,
  PackageCheck,
  Plus,
  RefreshCw,
  Search,
  Truck,
  WalletCards
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { money } from "../lib/catalog";
import {
  cancelPurchaseOrder,
  dateOnly,
  dateTime,
  loadPurchaseOrderWorkspace,
  purchaseBalance,
  purchasePaymentStatus,
  receivePurchaseOrder,
  recordPurchasePayment,
  savePurchaseOrder,
  saveSupplier
} from "../lib/purchaseOrders";
import PurchaseOrderFormModal from "../components/PurchaseOrderFormModal";
import PurchaseOrderActionModal from "../components/PurchaseOrderActionModal";
import PurchaseOrderPrintModal from "../components/PurchaseOrderPrintModal";
import SupplierFormModal from "../components/SupplierFormModal";

function defaultFilters() {
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - 90);

  return {
    from: from.toISOString().slice(0, 10),
    to: today.toISOString().slice(0, 10),
    status: "all",
    supplier: "all"
  };
}

function searchablePurchase(purchase) {
  return [
    purchase.purchase_number,
    purchase.supplier_invoice_number,
    purchase.suppliers?.supplier_code,
    purchase.suppliers?.name,
    purchase.status,
    ...(purchase.purchase_items || []).flatMap((item) => [
      item.products?.name,
      item.products?.sku,
      item.products?.barcode
    ])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}


function convertToBase(amount, currency, baseCurrency, usdToKhrRate) {
  const value = Number(amount || 0);
  const rate = Number(usdToKhrRate || 4100);

  if (currency === baseCurrency) return value;
  if (currency === "KHR" && baseCurrency === "USD") return rate > 0 ? value / rate : 0;
  if (currency === "USD" && baseCurrency === "KHR") return value * rate;
  return value;
}

function searchableSupplier(supplier) {
  return [
    supplier.supplier_code,
    supplier.name,
    supplier.contact_name,
    supplier.phone,
    supplier.email,
    supplier.address,
    supplier.tax_id
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export default function PurchaseOrdersPage() {
  const { supabase, profile, shop } = useAuth();
  const canManage = ["owner", "admin", "manager"].includes(profile?.role);

  const [tab, setTab] = useState("orders");
  const [filters, setFilters] = useState(defaultFilters);
  const [search, setSearch] = useState("");
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");

  const [orderFormOpen, setOrderFormOpen] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState(null);
  const [actionPurchase, setActionPurchase] = useState(null);
  const [actionType, setActionType] = useState(null);
  const [printPurchase, setPrintPurchase] = useState(null);
  const [supplierFormOpen, setSupplierFormOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);

  const refresh = useCallback(async () => {
    if (!supabase || !profile?.organization_id || !profile?.branch_id) return;

    try {
      setLoading(true);
      const data = await loadPurchaseOrderWorkspace(supabase, profile, filters);
      setSuppliers(data.suppliers);
      setProducts(data.products);
      setPurchases(data.purchases);
    } catch (error) {
      setMessageType("error");
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }, [supabase, profile, filters]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filteredPurchases = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return purchases.filter((purchase) => {
      if (filters.status !== "all" && purchase.status !== filters.status) {
        return false;
      }
      if (filters.supplier !== "all" && purchase.supplier_id !== filters.supplier) {
        return false;
      }
      return !needle || searchablePurchase(purchase).includes(needle);
    });
  }, [purchases, filters.status, filters.supplier, search]);

  const filteredSuppliers = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return suppliers.filter(
      (supplier) => !needle || searchableSupplier(supplier).includes(needle)
    );
  }, [suppliers, search]);

  const baseCurrency = shop?.base_currency || "USD";
  const usdToKhrRate = Number(shop?.usd_to_khr_rate || 4100);

  const metrics = useMemo(() => {
    const openOrders = purchases.filter((purchase) =>
      ["draft", "ordered"].includes(purchase.status)
    );
    const received = purchases.filter((purchase) => purchase.status === "received");
    const outstanding = purchases
      .filter((purchase) => purchase.status !== "cancelled")
      .reduce(
        (sum, purchase) =>
          sum +
          convertToBase(
            purchaseBalance(purchase),
            purchase.currency,
            baseCurrency,
            usdToKhrRate
          ),
        0
      );
    const orderedValue = openOrders.reduce(
      (sum, purchase) =>
        sum +
        convertToBase(
          purchase.total_amount,
          purchase.currency,
          baseCurrency,
          usdToKhrRate
        ),
      0
    );

    return {
      openCount: openOrders.length,
      receivedCount: received.length,
      outstanding,
      orderedValue
    };
  }, [purchases, baseCurrency, usdToKhrRate]);

  function showSuccess(text) {
    setMessageType("success");
    setMessage(text);
  }

  function showError(error) {
    setMessageType("error");
    setMessage(error.message || String(error));
  }

  function openNewOrder() {
    setEditingPurchase(null);
    setOrderFormOpen(true);
  }

  function openEditOrder(purchase) {
    setEditingPurchase(purchase);
    setOrderFormOpen(true);
  }

  function openAction(purchase, action) {
    setActionPurchase(purchase);
    setActionType(action);
  }

  async function handleSaveOrder(values) {
    try {
      setBusy(true);
      const result = await savePurchaseOrder(supabase, values);
      setOrderFormOpen(false);
      setEditingPurchase(null);
      showSuccess(`${result.purchase_number} saved as ${result.status}.`);
      await refresh();
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  }

  async function handleOrderAction(values) {
    if (!actionPurchase) return;

    try {
      setBusy(true);
      let result;

      if (values.action === "receive") {
        result = await receivePurchaseOrder(supabase, {
          purchase_id: actionPurchase.id,
          amount_paid: values.amount,
          payment_method: values.method,
          payment_reference: values.reference,
          supplier_invoice_number: values.supplier_invoice_number,
          notes: values.notes
        });
        showSuccess(
          `${result.purchase_number} received. Balance due: ${money(
            result.balance_due,
            result.currency
          )}.`
        );
      } else if (values.action === "payment") {
        result = await recordPurchasePayment(supabase, {
          purchase_id: actionPurchase.id,
          amount: values.amount,
          method: values.method,
          reference_number: values.reference,
          notes: values.notes
        });
        showSuccess(
          `Payment recorded. Balance due: ${money(
            result.balance_due,
            actionPurchase.currency
          )}.`
        );
      } else {
        result = await cancelPurchaseOrder(
          supabase,
          actionPurchase.id,
          values.reason
        );
        showSuccess(`${result.purchase_number} cancelled.`);
      }

      setActionPurchase(null);
      setActionType(null);
      await refresh();
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveSupplier(values) {
    try {
      setBusy(true);
      const result = await saveSupplier(supabase, values);
      setSupplierFormOpen(false);
      setEditingSupplier(null);
      showSuccess(`${result.supplier_code} · ${result.name} saved.`);
      await refresh();
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  }

  if (!canManage) {
    return (
      <section className="panel empty-state">
        <ClipboardList size={46} />
        <h2>Purchase-order access is restricted</h2>
        <p>Only an owner, admin, or manager can manage suppliers and purchases.</p>
      </section>
    );
  }

  return (
    <div className="page-stack purchase-orders-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">PROCUREMENT</p>
          <h1>Purchase Orders</h1>
          <p className="muted">
            Create supplier orders, receive inventory, track payments, and manage suppliers.
          </p>
        </div>

        <div className="heading-actions">
          <button type="button" className="secondary-button" onClick={refresh} disabled={loading}>
            <RefreshCw size={18} className={loading ? "spin" : ""} /> Refresh
          </button>
          <button type="button" className="primary-button" onClick={openNewOrder}>
            <Plus size={18} /> New purchase order
          </button>
        </div>
      </div>

      {message && <div className={`notice ${messageType}`}>{message}</div>}

      <div className="po-metrics">
        <article><ClipboardList /><span>Open orders</span><strong>{metrics.openCount}</strong><small>Draft and ordered</small></article>
        <article><PackageCheck /><span>Received</span><strong>{metrics.receivedCount}</strong><small>Orders received in range</small></article>
        <article><Truck /><span>Open order value</span><strong>{money(metrics.orderedValue, baseCurrency)}</strong><small>Current branch</small></article>
        <article><CircleDollarSign /><span>Outstanding</span><strong>{money(metrics.outstanding, baseCurrency)}</strong><small>Unpaid supplier balance</small></article>
      </div>

      <div className="po-tabs">
        <button type="button" className={tab === "orders" ? "active" : ""} onClick={() => setTab("orders")}>
          <ClipboardList size={18} /> Orders <span>{filteredPurchases.length}</span>
        </button>
        <button type="button" className={tab === "suppliers" ? "active" : ""} onClick={() => setTab("suppliers")}>
          <Building2 size={18} /> Suppliers <span>{filteredSuppliers.length}</span>
        </button>
      </div>

      <section className="panel po-toolbar">
        <div className="search-box">
          <Search size={18} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={
              tab === "orders"
                ? "Search order, supplier, invoice, product or barcode"
                : "Search supplier name, code, phone or email"
            }
          />
        </div>

        {tab === "orders" && (
          <>
            <label>
              <span>From</span>
              <input
                type="date"
                value={filters.from}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, from: event.target.value }))
                }
              />
            </label>
            <label>
              <span>To</span>
              <input
                type="date"
                value={filters.to}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, to: event.target.value }))
                }
              />
            </label>
            <label>
              <span>Status</span>
              <select
                value={filters.status}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, status: event.target.value }))
                }
              >
                <option value="all">All statuses</option>
                <option value="draft">Draft</option>
                <option value="ordered">Ordered</option>
                <option value="received">Received</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>
            <label>
              <span>Supplier</span>
              <select
                value={filters.supplier}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, supplier: event.target.value }))
                }
              >
                <option value="all">All suppliers</option>
                {suppliers.map((supplier) => (
                  <option value={supplier.id} key={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        {tab === "suppliers" && (
          <button
            type="button"
            className="primary-button compact"
            onClick={() => {
              setEditingSupplier(null);
              setSupplierFormOpen(true);
            }}
          >
            <Plus size={18} /> Add supplier
          </button>
        )}
      </section>

      {tab === "orders" ? (
        <section className="panel po-list-panel">
          {loading ? (
            <div className="empty-state"><RefreshCw className="spin" /><p>Loading purchase orders...</p></div>
          ) : filteredPurchases.length === 0 ? (
            <div className="empty-state"><ClipboardList size={44} /><h2>No purchase orders found</h2><p>Create a new order or change the filters.</p></div>
          ) : (
            <div className="po-card-list">
              {filteredPurchases.map((purchase) => {
                const paymentStatus = purchasePaymentStatus(purchase);
                const editable = ["draft", "ordered"].includes(purchase.status) && Number(purchase.amount_paid || 0) === 0;
                const receivable = ["draft", "ordered"].includes(purchase.status);
                const payable = purchase.status !== "cancelled" && purchaseBalance(purchase) > 0;

                return (
                  <article className="po-card" key={purchase.id}>
                    <div className="po-card-heading">
                      <div>
                        <strong>{purchase.purchase_number}</strong>
                        <span>{dateTime(purchase.created_at)} · {purchase.suppliers?.name || "No supplier"}</span>
                      </div>
                      <div className="po-status-group">
                        <span className={`status-pill ${purchase.status}`}>{purchase.status}</span>
                        <span className={`payment-pill ${paymentStatus}`}>{paymentStatus}</span>
                      </div>
                    </div>

                    <div className="po-card-info">
                      <div><span>Expected</span><strong>{dateOnly(purchase.expected_date)}</strong></div>
                      <div><span>Items</span><strong>{purchase.purchase_items?.length || 0}</strong></div>
                      <div><span>Total</span><strong>{money(purchase.total_amount, purchase.currency)}</strong></div>
                      <div><span>Paid</span><strong>{money(purchase.amount_paid, purchase.currency)}</strong></div>
                      <div><span>Balance</span><strong>{money(purchaseBalance(purchase), purchase.currency)}</strong></div>
                    </div>

                    <div className="po-card-items">
                      {(purchase.purchase_items || []).slice(0, 4).map((item) => (
                        <span key={item.id}>
                          {item.products?.name || "Product"}
                          {" × "}
                          {Number(item.quantity || 0).toLocaleString("en-US")}
                          {" "}
                          {item.purchase_unit_name || item.products?.unit_name || "pcs"}
                        </span>
                      ))}
                      {(purchase.purchase_items || []).length > 4 && (
                        <span>+{purchase.purchase_items.length - 4} more products</span>
                      )}
                    </div>

                    {purchase.status === "cancelled" && purchase.cancel_reason && (
                      <div className="notice warning">Cancelled: {purchase.cancel_reason}</div>
                    )}

                    <div className="po-card-actions">
                      <button type="button" className="secondary-button" onClick={() => setPrintPurchase(purchase)}>
                        <Eye size={17} /> View / Print
                      </button>
                      {editable && (
                        <button type="button" className="secondary-button" onClick={() => openEditOrder(purchase)}>
                          <Edit3 size={17} /> Edit
                        </button>
                      )}
                      {payable && (
                        <button type="button" className="secondary-button" onClick={() => openAction(purchase, "payment")}>
                          <WalletCards size={17} /> Pay
                        </button>
                      )}
                      {receivable && (
                        <button type="button" className="primary-button compact" onClick={() => openAction(purchase, "receive")}>
                          <PackageCheck size={17} /> Receive
                        </button>
                      )}
                      {receivable && Number(purchase.amount_paid || 0) === 0 && (
                        <button type="button" className="danger-button" onClick={() => openAction(purchase, "cancel")}>
                          <Ban size={17} /> Cancel
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      ) : (
        <section className="panel supplier-list-panel">
          {loading ? (
            <div className="empty-state"><RefreshCw className="spin" /><p>Loading suppliers...</p></div>
          ) : filteredSuppliers.length === 0 ? (
            <div className="empty-state"><Building2 size={44} /><h2>No suppliers found</h2><p>Add your first supplier.</p></div>
          ) : (
            <div className="supplier-card-grid">
              {filteredSuppliers.map((supplier) => {
                const supplierPurchases = purchases.filter((purchase) => purchase.supplier_id === supplier.id);
                const totalPurchased = supplierPurchases
                  .filter((purchase) => purchase.status === "received")
                  .reduce(
                    (sum, purchase) =>
                      sum +
                      convertToBase(
                        purchase.total_amount,
                        purchase.currency,
                        baseCurrency,
                        usdToKhrRate
                      ),
                    0
                  );
                const balanceDue = supplierPurchases
                  .filter((purchase) => purchase.status !== "cancelled")
                  .reduce(
                    (sum, purchase) =>
                      sum +
                      convertToBase(
                        purchaseBalance(purchase),
                        purchase.currency,
                        baseCurrency,
                        usdToKhrRate
                      ),
                    0
                  );

                return (
                  <article className={`supplier-card ${supplier.is_active ? "" : "inactive"}`} key={supplier.id}>
                    <div className="supplier-card-heading">
                      <div>
                        <span>{supplier.supplier_code}</span>
                        <strong>{supplier.name}</strong>
                      </div>
                      <span className={`status-pill ${supplier.is_active ? "active" : "inactive"}`}>
                        {supplier.is_active ? "active" : "inactive"}
                      </span>
                    </div>
                    <div className="supplier-contact-list">
                      {supplier.contact_name && <span>{supplier.contact_name}</span>}
                      {supplier.phone && <span>{supplier.phone}</span>}
                      {supplier.email && <span>{supplier.email}</span>}
                      {supplier.address && <span>{supplier.address}</span>}
                    </div>
                    <div className="supplier-stats">
                      <div><span>Orders</span><strong>{supplierPurchases.length}</strong></div>
                      <div><span>Received value</span><strong>{money(totalPurchased, baseCurrency)}</strong></div>
                      <div><span>Balance due</span><strong>{money(balanceDue, baseCurrency)}</strong></div>
                    </div>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        setEditingSupplier(supplier);
                        setSupplierFormOpen(true);
                      }}
                    >
                      <Edit3 size={17} /> Edit supplier
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      <PurchaseOrderFormModal
        open={orderFormOpen}
        purchase={editingPurchase}
        suppliers={suppliers}
        products={products}
        busy={busy}
        onClose={() => {
          setOrderFormOpen(false);
          setEditingPurchase(null);
        }}
        onSave={handleSaveOrder}
        onOpenSuppliers={() => {
          setEditingSupplier(null);
          setSupplierFormOpen(true);
        }}
      />

      <PurchaseOrderActionModal
        action={actionType}
        purchase={actionPurchase}
        busy={busy}
        onClose={() => {
          setActionType(null);
          setActionPurchase(null);
        }}
        onConfirm={handleOrderAction}
      />

      <PurchaseOrderPrintModal
        purchase={printPurchase}
        shop={shop}
        branch={profile?.branches}
        onClose={() => setPrintPurchase(null)}
      />

      <SupplierFormModal
        open={supplierFormOpen}
        supplier={editingSupplier}
        busy={busy}
        onClose={() => {
          setSupplierFormOpen(false);
          setEditingSupplier(null);
        }}
        onSave={handleSaveSupplier}
      />
    </div>
  );
}
