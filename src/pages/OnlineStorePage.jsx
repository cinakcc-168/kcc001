import {
  CheckCircle2,
  ExternalLink,
  Eye,
  Globe2,
  PackageSearch,
  RefreshCw,
  Search,
  Settings2,
  ShoppingBag
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  confirmOnlineOrder,
  loadOnlineStoreAdmin,
  onlineDateTime,
  onlineMoney,
  onlineStatusLabel,
  saveOnlineProduct,
  saveOnlineStoreSettings,
  setOnlineOrderStatus
} from "../lib/onlineStore";
import OnlineOrderDetailModal from "../components/OnlineOrderDetailModal";
import OnlineProductModal from "../components/OnlineProductModal";
import OnlineStoreSettingsModal from "../components/OnlineStoreSettingsModal";

function todayOffset(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function imageFor(product) {
  return [...(product.product_images || [])]
    .sort(
      (a, b) =>
        Number(b.is_primary)
        - Number(a.is_primary)
        || Number(a.sort_order)
        - Number(b.sort_order)
    )[0]?.secure_url;
}

export default function OnlineStorePage() {
  const navigate = useNavigate();
  const {
    supabase,
    profile,
    can
  } = useAuth();

  const [tab, setTab] = useState("orders");
  const [workspace, setWorkspace] = useState({
    settings: null,
    products: [],
    orders: []
  });
  const [filters, setFilters] = useState({
    from: todayOffset(-30),
    to: todayOffset(1),
    status: "all",
    search: ""
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] =
    useState("success");
  const [settingsOpen, setSettingsOpen] =
    useState(false);
  const [selectedProduct, setSelectedProduct] =
    useState(null);
  const [selectedOrder, setSelectedOrder] =
    useState(null);

  const canManageStore = can(
    "online_store.manage"
  );
  const canManageOrders = can(
    "online_orders.manage"
  );
  const canFulfillOrders = can(
    "online_orders.fulfill"
  );

  const refresh = useCallback(async () => {
    if (!supabase || !profile?.organization_id) {
      return;
    }

    try {
      setLoading(true);
      const data = await loadOnlineStoreAdmin(
        supabase,
        profile,
        filters
      );
      setWorkspace(data);

      setSelectedOrder((current) => {
        if (!current) return null;
        return (
          data.orders.find(
            (row) => row.id === current.id
          ) || null
        );
      });
    } catch (error) {
      setMessageType("error");
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }, [
    supabase,
    profile,
    filters
  ]);

  useEffect(() => {
    const timer = window.setTimeout(
      refresh,
      filters.search ? 350 : 0
    );
    return () => window.clearTimeout(timer);
  }, [refresh, filters.search]);

  const stats = useMemo(() => {
    const result = {
      pending: 0,
      active: 0,
      usd: 0,
      khr: 0
    };

    for (const order of workspace.orders) {
      if (order.status === "pending") {
        result.pending += 1;
      }

      if (
        ![
          "fulfilled",
          "cancelled",
          "rejected"
        ].includes(order.status)
      ) {
        result.active += 1;
      }

      if (
        !["cancelled", "rejected"].includes(
          order.status
        )
      ) {
        if (order.currency === "KHR") {
          result.khr += order.total_amount;
        } else {
          result.usd += order.total_amount;
        }
      }
    }

    return result;
  }, [workspace.orders]);

  const publicUrl = workspace.settings?.slug
    ? `${window.location.origin}/shop/${workspace.settings.slug}`
    : "";

  function announce(type, text) {
    setMessageType(type);
    setMessage(text);
  }

  async function saveSettings(values) {
    try {
      setBusy("settings");
      await saveOnlineStoreSettings(
        supabase,
        values
      );
      setSettingsOpen(false);
      announce(
        "success",
        "Online store settings saved."
      );
      await refresh();
    } catch (error) {
      announce("error", error.message);
    } finally {
      setBusy("");
    }
  }

  async function saveProduct(
    productId,
    values
  ) {
    try {
      setBusy(`product:${productId}`);
      await saveOnlineProduct(
        supabase,
        productId,
        values
      );
      setSelectedProduct(null);
      announce(
        "success",
        "Online product settings saved."
      );
      await refresh();
    } catch (error) {
      announce("error", error.message);
    } finally {
      setBusy("");
    }
  }

  async function confirmOrder(orderId) {
    const confirmed = window.confirm(
      "Confirm this web order and reserve stock?"
    );
    if (!confirmed) return;

    try {
      setBusy(`order:${orderId}`);
      const result = await confirmOnlineOrder(
        supabase,
        orderId
      );
      announce(
        "success",
        `Reserved Sales Order ${result.sales_order_number} created.`
      );
      await refresh();
    } catch (error) {
      announce("error", error.message);
    } finally {
      setBusy("");
    }
  }

  async function changeStatus(
    orderId,
    status,
    note
  ) {
    const destructive = [
      "cancelled",
      "rejected"
    ].includes(status);

    if (
      destructive
      && !window.confirm(
        `Change this order to ${status}?`
      )
    ) {
      return;
    }

    try {
      setBusy(`order:${orderId}`);
      await setOnlineOrderStatus(
        supabase,
        orderId,
        status,
        note
      );
      announce(
        "success",
        "Online order status updated."
      );
      await refresh();
    } catch (error) {
      announce("error", error.message);
    } finally {
      setBusy("");
    }
  }

  async function copyStoreLink() {
    if (!publicUrl) return;

    try {
      await navigator.clipboard.writeText(
        publicUrl
      );
      announce(
        "success",
        "Online store link copied."
      );
    } catch {
      window.prompt(
        "Copy the online store link:",
        publicUrl
      );
    }
  }

  return (
    <div className="page online-store-page">
      <div className="page-head">
        <div>
          <p className="eyebrow">
            CUSTOMER WEB ORDERS
          </p>
          <h1>Online Store</h1>
          <p>
            Publish selected products, receive
            customer orders and convert accepted
            orders into reserved Sales Orders.
          </p>
        </div>

        <div className="page-actions">
          {publicUrl && (
            <>
              <button
                type="button"
                className="secondary"
                onClick={copyStoreLink}
              >
                <Globe2 size={18} />
                Copy store link
              </button>
              <a
                className="button secondary"
                href={publicUrl}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={18} />
                Open store
              </a>
            </>
          )}
          {canManageStore && (
            <button
              type="button"
              onClick={() =>
                setSettingsOpen(true)
              }
            >
              <Settings2 size={18} />
              Store settings
            </button>
          )}
        </div>
      </div>

      {message && (
        <div
          className={`notice ${messageType}`}
          role="status"
        >
          {message}
        </div>
      )}

      <div className="online-store-status-card">
        <div>
          <span
            className={`online-publish-dot ${
              workspace.settings?.is_published
                ? "published"
                : ""
            }`}
          />
          <div>
            <strong>
              {workspace.settings?.is_published
                ? "Store is published"
                : "Store is not published"}
            </strong>
            <small>
              {workspace.settings?.slug
                ? `/shop/${workspace.settings.slug}`
                : "Configure the storefront before publishing."}
            </small>
          </div>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={refresh}
          disabled={loading}
          aria-label="Refresh"
        >
          <RefreshCw
            size={19}
            className={loading ? "spin" : ""}
          />
        </button>
      </div>

      <div className="metric-grid four">
        <article className="metric-card">
          <span>Pending review</span>
          <strong>{stats.pending}</strong>
          <small>New customer orders</small>
        </article>
        <article className="metric-card">
          <span>Active orders</span>
          <strong>{stats.active}</strong>
          <small>Not yet closed</small>
        </article>
        <article className="metric-card">
          <span>Order value USD</span>
          <strong>
            {onlineMoney(stats.usd, "USD")}
          </strong>
          <small>Current filters</small>
        </article>
        <article className="metric-card">
          <span>Order value KHR</span>
          <strong>
            {onlineMoney(stats.khr, "KHR")}
          </strong>
          <small>Current filters</small>
        </article>
      </div>

      <div className="segmented-tabs">
        <button
          type="button"
          className={
            tab === "orders" ? "active" : ""
          }
          onClick={() => setTab("orders")}
        >
          <ShoppingBag size={18} />
          Online orders
        </button>
        <button
          type="button"
          className={
            tab === "products" ? "active" : ""
          }
          onClick={() => setTab("products")}
        >
          <PackageSearch size={18} />
          Public products
        </button>
      </div>

      {tab === "orders" ? (
        <>
          <div className="filter-bar online-order-filters">
            <label>
              From
              <input
                type="date"
                value={filters.from}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    from: event.target.value
                  }))
                }
              />
            </label>
            <label>
              To
              <input
                type="date"
                value={filters.to}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    to: event.target.value
                  }))
                }
              />
            </label>
            <label>
              Status
              <select
                value={filters.status}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    status: event.target.value
                  }))
                }
              >
                <option value="all">
                  All statuses
                </option>
                <option value="pending">
                  Pending
                </option>
                <option value="confirmed">
                  Confirmed
                </option>
                <option value="preparing">
                  Preparing
                </option>
                <option value="ready">
                  Ready
                </option>
                <option value="fulfilled">
                  Fulfilled
                </option>
                <option value="cancelled">
                  Cancelled
                </option>
                <option value="rejected">
                  Rejected
                </option>
              </select>
            </label>
            <label className="search-field">
              Search
              <span>
                <Search size={17} />
                <input
                  value={filters.search}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      search:
                        event.target.value
                    }))
                  }
                  placeholder="Order, customer or phone"
                />
              </span>
            </label>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th>Fulfilment</th>
                  <th>Created</th>
                  <th className="right">Total</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {!workspace.orders.length && (
                  <tr>
                    <td colSpan={7}>
                      <div className="empty-state compact">
                        <ShoppingBag size={32} />
                        <strong>
                          No online orders found
                        </strong>
                        <span>
                          Published customers orders
                          appear here.
                        </span>
                      </div>
                    </td>
                  </tr>
                )}

                {workspace.orders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <strong>
                        {order.order_number}
                      </strong>
                      {order.sales_orders
                        ?.order_number && (
                        <small>
                          SO:{" "}
                          {
                            order.sales_orders
                              .order_number
                          }
                        </small>
                      )}
                    </td>
                    <td>
                      <strong>
                        {order.customer_name}
                      </strong>
                      <small>
                        {order.customer_phone}
                      </small>
                    </td>
                    <td>
                      <span
                        className={`status-badge ${order.status}`}
                      >
                        {onlineStatusLabel(
                          order.status
                        )}
                      </span>
                    </td>
                    <td>
                      {order.fulfilment_type ===
                      "delivery"
                        ? "Delivery"
                        : "Pickup"}
                    </td>
                    <td>
                      {onlineDateTime(
                        order.created_at
                      )}
                    </td>
                    <td className="right">
                      <strong>
                        {onlineMoney(
                          order.total_amount,
                          order.currency
                        )}
                      </strong>
                    </td>
                    <td className="right">
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() =>
                          setSelectedOrder(order)
                        }
                        aria-label="View order"
                      >
                        <Eye size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="online-product-grid">
          {workspace.products.map((product) => {
            const image = imageFor(product);
            const enabled =
              product.online_enabled;

            return (
              <article
                key={product.id}
                className={`online-admin-product ${
                  enabled ? "published" : ""
                }`}
              >
                <div className="online-admin-product-image">
                  {image ? (
                    <img
                      src={image}
                      alt=""
                    />
                  ) : (
                    <PackageSearch size={34} />
                  )}
                  {enabled && (
                    <span>
                      <CheckCircle2 size={15} />
                      Published
                    </span>
                  )}
                </div>
                <div>
                  <strong>{product.name}</strong>
                  <small>
                    {product.categories?.name
                      || "Uncategorized"}
                  </small>
                  <small>
                    {
                      (
                        product.product_units
                        || []
                      ).filter(
                        (unit) => unit.is_active
                      ).length
                    }{" "}
                    selling units ·{" "}
                    {product.currency}
                  </small>
                </div>
                {canManageStore && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() =>
                      setSelectedProduct(product)
                    }
                  >
                    Configure
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}

      <OnlineStoreSettingsModal
        open={settingsOpen}
        settings={workspace.settings}
        profile={profile}
        busy={busy === "settings"}
        onClose={() => setSettingsOpen(false)}
        onSave={saveSettings}
      />

      <OnlineProductModal
        open={Boolean(selectedProduct)}
        product={selectedProduct}
        busy={
          selectedProduct
          && busy ===
            `product:${selectedProduct.id}`
        }
        onClose={() => setSelectedProduct(null)}
        onSave={saveProduct}
      />

      <OnlineOrderDetailModal
        order={selectedOrder}
        busy={
          selectedOrder
          && busy ===
            `order:${selectedOrder.id}`
        }
        canManage={canManageOrders}
        canFulfill={canFulfillOrders}
        onClose={() => setSelectedOrder(null)}
        onConfirm={confirmOrder}
        onStatus={changeStatus}
        onOpenSalesOrder={(orderId) => {
          setSelectedOrder(null);
          navigate(
            `/sales-orders?order=${orderId}`
          );
        }}
      />
    </div>
  );
}
