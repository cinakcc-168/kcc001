import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ClipboardList,
  Download,
  Edit3,
  PackageCheck,
  Printer,
  RefreshCw,
  Search,
  ShoppingCart,
  Truck
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import ReorderRuleModal from "../components/ReorderRuleModal";
import { money, stockNumber } from "../lib/catalog";
import {
  createDraftPurchaseOrders,
  loadReorderWorkspace,
  reorderStatusClass,
  reorderStatusLabel,
  saveReorderRule
} from "../lib/reorder";

const statuses = [
  ["", "All statuses"],
  ["attention", "Low stock (all attention)"],
  ["out_of_stock", "Out of stock"],
  ["reorder", "Reorder now"],
  ["draft_order", "Draft PO exists"],
  ["incoming", "Incoming stock"],
  ["unconfigured", "Default rule"],
  ["ok", "Stock healthy"]
];

export default function ReorderPage() {
  const { supabase, profile, can } = useAuth();

  const canManage = can("reorder.manage");
  const [searchParams, setSearchParams] = useSearchParams();

  const [suggestions, setSuggestions] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [selectedIds, setSelectedIds] =
    useState(new Set());

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(() => searchParams.get("status") || "");
  const [supplierId, setSupplierId] = useState("");
  const [categoryId, setCategoryId] = useState("");

  const [ruleProduct, setRuleProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] =
    useState("success");

  const refresh = useCallback(async () => {
    if (
      !supabase
      || !profile?.organization_id
      || !profile?.branch_id
      || !canManage
    ) {
      return;
    }

    try {
      setLoading(true);

      const workspace =
        await loadReorderWorkspace(
          supabase,
          profile
        );

      setSuggestions(workspace.suggestions);
      setSuppliers(workspace.suppliers);

      setSelectedIds((current) => {
        const eligible = new Set(
          workspace.suggestions
            .filter((item) => item.can_create_order)
            .map((item) => item.product_id)
        );

        return new Set(
          [...current].filter((id) => eligible.has(id))
        );
      });
    } catch (error) {
      setMessageType("error");
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }, [supabase, profile, canManage]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const requested = searchParams.get("status") || "";
    if (requested !== status) setStatus(requested);
  }, [searchParams]);

  const categories = useMemo(() => {
    const map = new Map();

    for (const item of suggestions) {
      if (item.category_id && item.category_name) {
        map.set(
          item.category_id,
          item.category_name
        );
      }
    }

    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) =>
        a.name.localeCompare(b.name)
      );
  }, [suggestions]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return suggestions.filter((item) => {
      if (status === "attention" && Number(item.current_stock || 0) > Number(item.reorder_point || 0)) {
        return false;
      }

      if (status === "out_of_stock" && Number(item.current_stock || 0) > 0) {
        return false;
      }

      if (status && !["attention", "out_of_stock"].includes(status) && item.reorder_status !== status) {
        return false;
      }

      if (
        supplierId
        && item.preferred_supplier_id
          !== supplierId
      ) {
        return false;
      }

      if (
        categoryId
        && item.category_id !== categoryId
      ) {
        return false;
      }

      if (!needle) return true;

      return [
        item.product_name,
        item.name_km,
        item.sku,
        item.barcode,
        item.category_name,
        item.preferred_supplier_name,
        item.supplier_code,
        item.supplier_sku,
        item.purchase_unit_name
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [
    suggestions,
    search,
    status,
    supplierId,
    categoryId
  ]);

  const metrics = useMemo(() => {
    return {
      reorder: suggestions.filter(
        (item) =>
          item.reorder_status === "reorder"
          || item.reorder_status === "out_of_stock"
      ).length,

      outOfStock: suggestions.filter(
        (item) =>
          item.reorder_status === "out_of_stock"
      ).length,

      incoming: suggestions.filter(
        (item) =>
          item.reorder_status === "incoming"
      ).length,

      draft: suggestions.filter(
        (item) =>
          item.reorder_status === "draft_order"
      ).length,

      selectedUsd: suggestions
        .filter(
          (item) =>
            selectedIds.has(item.product_id)
            && item.currency === "USD"
        )
        .reduce(
          (sum, item) =>
            sum
            + Number(
              item.estimated_order_total || 0
            ),
          0
        ),

      selectedKhr: suggestions
        .filter(
          (item) =>
            selectedIds.has(item.product_id)
            && item.currency === "KHR"
        )
        .reduce(
          (sum, item) =>
            sum
            + Number(
              item.estimated_order_total || 0
            ),
          0
        )
    };
  }, [suggestions, selectedIds]);

  const selectedSuggestions = useMemo(
    () =>
      suggestions.filter((item) =>
        selectedIds.has(item.product_id)
      ),
    [suggestions, selectedIds]
  );

  const allVisibleEligible = visible.filter(
    (item) => item.can_create_order
  );

  const allVisibleSelected =
    allVisibleEligible.length > 0
    && allVisibleEligible.every((item) =>
      selectedIds.has(item.product_id)
    );

  function csvCell(value) {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }

  function exportVisible() {
    const rows = [
      ["Product", "Code", "Category", "Status", "Current stock", "Reorder point", "Target stock", "Supplier", "Suggested quantity", "Purchase unit", "Estimate", "Currency"],
      ...visible.map((item) => [item.product_name, item.sku || item.barcode, item.category_name, item.reorder_status, item.current_stock, item.reorder_point, item.target_stock, item.preferred_supplier_name, item.suggested_purchase_quantity, item.purchase_unit_name || item.base_unit_name, item.estimated_order_total, item.currency])
    ];
    const blob = new Blob([rows.map((row) => row.map(csvCell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `tiny-pos-reorder-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function printVisible() {
    const win = window.open("", "_blank", "noopener,noreferrer");
    if (!win) { announce("error", "Allow pop-ups to print the reorder list."); return; }
    const rows = visible.map((item) => `<tr><td>${item.product_name}</td><td>${item.sku || item.barcode || "—"}</td><td>${reorderStatusLabel(item.reorder_status)}</td><td>${stockNumber(item.current_stock)} ${item.base_unit_name}</td><td>${stockNumber(item.reorder_point)}</td><td>${item.preferred_supplier_name || "Not configured"}</td><td>${stockNumber(item.suggested_purchase_quantity)} ${item.purchase_unit_name || item.base_unit_name}</td><td>${money(item.estimated_order_total, item.currency)}</td></tr>`).join("");
    win.document.write(`<!doctype html><html><head><title>Reorder Planner</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#111}table{width:100%;border-collapse:collapse;margin-top:18px}th,td{border:1px solid #bbb;padding:8px;text-align:left}th{background:#eee}</style></head><body><h1>Reorder Planner</h1><p>${visible.length} products · ${new Date().toLocaleString()}</p><table><thead><tr><th>Product</th><th>Code</th><th>Status</th><th>Stock</th><th>Reorder at</th><th>Supplier</th><th>Suggested</th><th>Estimate</th></tr></thead><tbody>${rows}</tbody></table><script>window.onload=()=>window.print()<\/script></body></html>`);
    win.document.close();
  }

  function changeStatus(nextStatus) {
    setStatus(nextStatus);
    const next = new URLSearchParams(searchParams);
    if (nextStatus) next.set("status", nextStatus);
    else next.delete("status");
    setSearchParams(next, { replace: true });
  }

  function announce(type, text) {
    setMessageType(type);
    setMessage(text);
  }

  function toggleOne(item) {
    if (!item.can_create_order) return;

    setSelectedIds((current) => {
      const next = new Set(current);

      if (next.has(item.product_id)) {
        next.delete(item.product_id);
      } else {
        next.add(item.product_id);
      }

      return next;
    });
  }

  function toggleVisible() {
    setSelectedIds((current) => {
      const next = new Set(current);

      if (allVisibleSelected) {
        for (const item of allVisibleEligible) {
          next.delete(item.product_id);
        }
      } else {
        for (const item of allVisibleEligible) {
          next.add(item.product_id);
        }
      }

      return next;
    });
  }

  async function handleRuleSave(values) {
    try {
      setBusy("rule");
      await saveReorderRule(
        supabase,
        values
      );

      setRuleProduct(null);
      announce(
        "success",
        "Reorder rule saved."
      );
      await refresh();
    } catch (error) {
      announce("error", error.message);
    } finally {
      setBusy("");
    }
  }

  async function createDraftOrders() {
    if (selectedSuggestions.length === 0) {
      announce(
        "error",
        "Select at least one reorder suggestion."
      );
      return;
    }

    try {
      setBusy("orders");

      const created =
        await createDraftPurchaseOrders(
          supabase,
          selectedSuggestions,
          profile
        );

      setSelectedIds(new Set());

      announce(
        "success",
        `${created.length} draft purchase order${
          created.length === 1 ? "" : "s"
        } created for ${created.reduce(
          (sum, order) =>
            sum + Number(order.item_count || 0),
          0
        )} product${
          created.reduce(
            (sum, order) =>
              sum + Number(order.item_count || 0),
            0
          ) === 1
            ? ""
            : "s"
        }.`
      );

      await refresh();
    } catch (error) {
      announce("error", error.message);
    } finally {
      setBusy("");
    }
  }

  if (!canManage) {
    return (
      <section className="panel empty-state">
        <ClipboardList size={46} />
        <h2>Management access required</h2>
        <p>
          Only an owner, admin or manager can
          use Reorder Planning.
        </p>
      </section>
    );
  }

  return (
    <div className="page-stack reorder-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            INVENTORY PLANNING
          </p>
          <h1>Reorder Planner</h1>
          <p className="muted">
            Convert low-stock products into
            package-aware draft purchase orders.
          </p>
        </div>

        <div className="page-heading-actions">
          <Link
            to="/purchase-orders"
            className="secondary-button"
          >
            <ShoppingCart size={18} />
            Purchase orders
          </Link>

          <button type="button" className="secondary-button" onClick={exportVisible}>
            <Download size={18} /> Export CSV
          </button>

          <button type="button" className="secondary-button" onClick={printVisible}>
            <Printer size={18} /> Print
          </button>

          <button
            type="button"
            className="secondary-button"
            onClick={refresh}
            disabled={loading}
          >
            <RefreshCw
              size={18}
              className={loading ? "spin" : ""}
            />
            Refresh
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`notice ${messageType}`}
          onClick={() => setMessage("")}
        >
          {message}
        </div>
      )}

      <div className="reorder-metrics">
        <article>
          <AlertTriangle size={23} />
          <span>Need reorder</span>
          <strong>{metrics.reorder}</strong>
        </article>

        <article>
          <Boxes size={23} />
          <span>Out of stock</span>
          <strong>{metrics.outOfStock}</strong>
        </article>

        <article>
          <Truck size={23} />
          <span>Incoming</span>
          <strong>{metrics.incoming}</strong>
        </article>

        <article>
          <ClipboardList size={23} />
          <span>Draft PO exists</span>
          <strong>{metrics.draft}</strong>
        </article>

        <article>
          <PackageCheck size={23} />
          <span>Selected estimate</span>
          <strong>
            {money(metrics.selectedUsd, "USD")}
          </strong>
          <small>
            {money(metrics.selectedKhr, "KHR")}
            {" · Separate purchase orders by currency"}
          </small>
        </article>
      </div>

      <section className="panel reorder-filter-panel">
        <div className="search-box">
          <Search size={18} />
          <input
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
            placeholder="Search product, code, supplier, category or package"
          />
        </div>

        <label>
          <span>Status</span>
          <select
            value={status}
            onChange={(event) =>
              changeStatus(event.target.value)
            }
          >
            {statuses.map(([value, label]) => (
              <option
                value={value}
                key={value || "all"}
              >
                {label}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Supplier</span>
          <select
            value={supplierId}
            onChange={(event) =>
              setSupplierId(event.target.value)
            }
          >
            <option value="">
              All suppliers
            </option>
            {suppliers.map((supplier) => (
              <option
                value={supplier.id}
                key={supplier.id}
              >
                {supplier.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Category</span>
          <select
            value={categoryId}
            onChange={(event) =>
              setCategoryId(event.target.value)
            }
          >
            <option value="">
              All categories
            </option>
            {categories.map((category) => (
              <option
                value={category.id}
                key={category.id}
              >
                {category.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="panel reorder-table-panel">
        <div className="reorder-table-toolbar">
          <label className="check-row">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              disabled={
                allVisibleEligible.length === 0
              }
              onChange={toggleVisible}
            />
            <span>
              Select visible products ready for ordering
            </span>
          </label>

          <button
            type="button"
            className="primary-button"
            onClick={createDraftOrders}
            disabled={
              busy === "orders"
              || selectedSuggestions.length === 0
            }
          >
            <ClipboardList size={18} />
            {busy === "orders"
              ? "Creating draft orders..."
              : `Create draft PO${
                  selectedSuggestions.length > 1
                    ? "s"
                    : ""
                } (${selectedSuggestions.length})`}
          </button>
        </div>

        {loading ? (
          <div className="empty-state">
            <RefreshCw className="spin" />
            <p>
              Calculating reorder suggestions...
            </p>
          </div>
        ) : visible.length === 0 ? (
          <div className="empty-state">
            <CheckCircle2 size={46} />
            <h2>No matching products</h2>
            <p>
              Change the filters or search phrase.
            </p>
          </div>
        ) : (
          <div className="reorder-table-wrap">
            <table className="reorder-table">
              <thead>
                <tr>
                  <th />
                  <th>Product</th>
                  <th>Status</th>
                  <th>Stock</th>
                  <th>Rule</th>
                  <th>Supplier</th>
                  <th>Suggested order</th>
                  <th>Estimate</th>
                  <th />
                </tr>
              </thead>

              <tbody>
                {visible.map((item) => (
                  <tr key={item.product_id}>
                    <td data-label="Select">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(
                          item.product_id
                        )}
                        disabled={
                          !item.can_create_order
                        }
                        onChange={() =>
                          toggleOne(item)
                        }
                        title={
                          item.can_create_order
                            ? "Select product"
                            : item.draft_base_quantity > 0
                              ? "A draft purchase order already exists"
                              : "Configure a preferred supplier first"
                        }
                      />
                    </td>

                    <td data-label="Product">
                      <strong>
                        {item.product_name}
                      </strong>
                      <small>
                        {[
                          item.sku,
                          item.barcode,
                          item.category_name
                        ]
                          .filter(Boolean)
                          .join(" · ")
                          || "No product code"}
                      </small>
                    </td>

                    <td data-label="Status">
                      <span
                        className={`reorder-status ${
                          reorderStatusClass(
                            item.reorder_status
                          )
                        }`}
                      >
                        {reorderStatusLabel(
                          item.reorder_status
                        )}
                      </span>
                    </td>

                    <td data-label="Stock">
                      <strong>
                        {stockNumber(
                          item.current_stock
                        )}
                        {" "}
                        {item.base_unit_name}
                      </strong>

                      <small>
                        Ordered:{" "}
                        {stockNumber(
                          item.ordered_base_quantity
                        )}
                        {" · Projected: "}
                        {stockNumber(
                          item.projected_stock
                        )}
                      </small>
                    </td>

                    <td data-label="Rule">
                      <strong>
                        Reorder at{" "}
                        {stockNumber(
                          item.reorder_point
                        )}
                      </strong>
                      <small>
                        Target{" "}
                        {stockNumber(
                          item.target_stock
                        )}
                        {" "}
                        {item.base_unit_name}
                      </small>
                    </td>

                    <td data-label="Supplier">
                      <strong>
                        {item.preferred_supplier_name
                          || "Not configured"}
                      </strong>
                      <small>
                        {item.supplier_code
                          || item.supplier_sku
                          || "Add a preferred supplier"}
                      </small>
                    </td>

                    <td data-label="Suggested order">
                      <strong>
                        {stockNumber(
                          item.suggested_purchase_quantity
                        )}
                        {" "}
                        {item.purchase_unit_name
                          || item.base_unit_name}
                      </strong>
                      <small>
                        {stockNumber(
                          item.suggested_base_quantity
                        )}
                        {" "}
                        {item.base_unit_name}
                        {" · 1 "}
                        {item.purchase_unit_name
                          || item.base_unit_name}
                        {" = "}
                        {stockNumber(
                          item.purchase_unit_factor
                        )}
                        {" "}
                        {item.base_unit_name}
                      </small>
                    </td>

                    <td data-label="Estimate">
                      <strong>
                        {money(
                          item.estimated_order_total,
                          item.currency
                        )}
                      </strong>
                      <small>
                        {money(
                          item.estimated_purchase_unit_cost,
                          item.currency
                        )}
                        {" per "}
                        {item.purchase_unit_name
                          || item.base_unit_name}
                      </small>
                    </td>

                    <td data-label="Configure">
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() =>
                          setRuleProduct(item)
                        }
                        title="Configure reorder rule"
                      >
                        <Edit3 size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ReorderRuleModal
        suggestion={ruleProduct}
        suppliers={suppliers}
        busy={busy === "rule"}
        onClose={() => setRuleProduct(null)}
        onSave={handleRuleSave}
      />
    </div>
  );
}
