import {
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  History,
  PackageSearch,
  RefreshCw,
  Search,
  StopCircle,
  XCircle
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";
import { useAuth } from "../context/AuthContext";
import BarcodeScanner from "../components/BarcodeScanner";
import StockCountCompleteModal from "../components/StockCountCompleteModal";
import StockCountHistoryModal from "../components/StockCountHistoryModal";
import StockCountRow from "../components/StockCountRow";
import StockCountStartModal from "../components/StockCountStartModal";
import {
  money,
  stockNumber
} from "../lib/catalog";
import {
  cancelStockCount,
  completeStockCount,
  exactStockCountMatch,
  loadStockCountItems,
  loadStockCountWorkspace,
  saveAllStockCountItems,
  scanStockCountItem,
  startStockCount
} from "../lib/stockCounts";

function dateTime(value) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export default function StockCountsPage() {
  const {
    supabase,
    profile,
    can
  } = useAuth();

  const canManage = can("stock_counts.manage");

  const [sessions, setSessions] =
    useState([]);
  const [activeSession, setActiveSession] =
    useState(null);
  const [items, setItems] = useState([]);
  const [products, setProducts] =
    useState([]);
  const [categories, setCategories] =
    useState([]);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] =
    useState("");
  const [countFilter, setCountFilter] =
    useState("all");

  const [startOpen, setStartOpen] =
    useState(false);
  const [scannerOpen, setScannerOpen] =
    useState(false);
  const [completeOpen, setCompleteOpen] =
    useState(false);

  const [historySession, setHistorySession] =
    useState(null);
  const [historyItems, setHistoryItems] =
    useState([]);
  const [historyLoading, setHistoryLoading] =
    useState(false);

  const [loading, setLoading] =
    useState(true);
  const [busy, setBusy] = useState("");
  const [draftItems, setDraftItems] = useState({});
  const [message, setMessage] =
    useState("");
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
        await loadStockCountWorkspace(
          supabase,
          profile
        );

      setSessions(workspace.sessions);
      setActiveSession(
        workspace.activeSession
      );
      setItems(workspace.activeItems);
      setProducts(workspace.products);
      setCategories(workspace.categories);
      setDraftItems({});
    } catch (error) {
      setMessageType("error");
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }, [
    supabase,
    profile,
    canManage
  ]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const metrics = useMemo(() => {
    let discrepancies = 0;
    let shortages = 0;
    let overages = 0;
    let valueUsd = 0;
    let valueKhr = 0;
    let counted = 0;

    for (const item of items) {
      if (item.counted_quantity === null) {
        continue;
      }

      counted += 1;

      const variance =
        item.counted_quantity
        - item.expected_quantity;

      if (variance !== 0) {
        discrepancies += 1;

        if (variance < 0) {
          shortages += 1;
        } else {
          overages += 1;
        }
      }

      const value =
        variance
        * Number(
          item.unit_cost_snapshot || 0
        );

      if (
        item.products?.currency === "KHR"
      ) {
        valueKhr += value;
      } else {
        valueUsd += value;
      }
    }

    return {
      total: items.length,
      counted,
      uncounted: items.length - counted,
      discrepancies,
      shortages,
      overages,
      valueUsd,
      valueKhr,
      progress:
        items.length > 0
          ? counted / items.length * 100
          : 0
    };
  }, [items]);

  const visibleItems = useMemo(() => {
    const needle = search
      .trim()
      .toLowerCase();

    return items.filter((item) => {
      const product = item.products || {};
      const variance =
        item.counted_quantity === null
          ? null
          : item.counted_quantity
            - item.expected_quantity;

      if (
        categoryFilter
        && product.category_id
          !== categoryFilter
      ) {
        return false;
      }

      if (
        countFilter === "uncounted"
        && item.counted_quantity !== null
      ) {
        return false;
      }

      if (
        countFilter === "counted"
        && item.counted_quantity === null
      ) {
        return false;
      }

      if (
        countFilter === "difference"
        && (
          variance === null
          || variance === 0
        )
      ) {
        return false;
      }

      if (
        countFilter === "shortage"
        && (
          variance === null
          || variance >= 0
        )
      ) {
        return false;
      }

      if (
        countFilter === "overage"
        && (
          variance === null
          || variance <= 0
        )
      ) {
        return false;
      }

      if (!needle) return true;

      return [
        product.name,
        product.name_km,
        product.sku,
        product.barcode,
        product.categories?.name,
        ...(product.product_units || [])
          .flatMap((unit) => [
            unit.name,
            unit.short_name,
            unit.barcode
          ])
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [
    items,
    search,
    categoryFilter,
    countFilter
  ]);

  function announce(type, text) {
    setMessageType(type);
    setMessage(text);
  }

  async function handleStart(values) {
    try {
      setBusy("start");

      const result =
        await startStockCount(
          supabase,
          values
        );

      setStartOpen(false);
      announce(
        "success",
        `${result.count_number} started with ${result.expected_items} products.`
      );
      await refresh();
    } catch (error) {
      announce("error", error.message);
    } finally {
      setBusy("");
    }
  }

  function handleDraftChange(item, countedQuantity, note) {
    setDraftItems((current) => {
      const originalQuantity =
        item.counted_quantity === null
          ? null
          : Number(item.counted_quantity);
      const normalizedQuantity =
        countedQuantity === null
          ? null
          : Number(countedQuantity);
      const originalNote = String(item.note || "").trim();
      const normalizedNote = String(note || "").trim();

      const next = { ...current };
      const unchanged =
        originalQuantity === normalizedQuantity
        && originalNote === normalizedNote;

      if (unchanged) {
        delete next[item.product_id];
      } else {
        next[item.product_id] = {
          product_id: item.product_id,
          counted_quantity: normalizedQuantity,
          note: normalizedNote
        };
      }

      return next;
    });
  }

  async function handleSaveAll() {
    const pending = Object.values(draftItems);

    if (pending.length === 0) {
      announce("error", "Enter or change at least one counted quantity first.");
      return;
    }

    const invalid = pending.find((item) =>
      item.counted_quantity !== null
      && (
        !Number.isFinite(item.counted_quantity)
        || item.counted_quantity < 0
      )
    );

    if (invalid) {
      announce("error", "Every counted quantity must be zero or greater.");
      return;
    }

    try {
      setBusy("save-all");

      const result = await saveAllStockCountItems(
        supabase,
        {
          session_id: activeSession.id,
          items: pending
        }
      );

      announce(
        "success",
        `${result.saved_items || pending.length} product counts saved together.`
      );
      await refresh();
    } catch (error) {
      announce("error", error.message);
    } finally {
      setBusy("");
    }
  }

  async function handleScan(code) {
    setScannerOpen(false);

    const match =
      exactStockCountMatch(
        items,
        code
      );

    if (!match) {
      announce(
        "error",
        `No product or package in this count matches ${code}.`
      );
      return;
    }

    try {
      setBusy("scan");

      const result =
        await scanStockCountItem(
          supabase,
          {
            session_id:
              activeSession.id,
            product_id:
              match.product.id,
            product_unit_id:
              match.unit?.id || null,
            unit_quantity: 1
          }
        );

      navigator.vibrate?.(70);

      announce(
        "success",
        [
          match.product.name,
          `+${stockNumber(
            result.base_increment
          )}`,
          match.product.unit_name,
          `from 1 ${result.unit?.name || match.product.unit_name}`
        ].join(" · ")
      );

      await refresh();
    } catch (error) {
      announce("error", error.message);
    } finally {
      setBusy("");
    }
  }

  async function handleComplete(note) {
    try {
      setBusy("complete");

      const result =
        await completeStockCount(
          supabase,
          activeSession.id,
          note
        );

      setCompleteOpen(false);

      announce(
        "success",
        result.adjustment_number
          ? `${result.count_number} completed. Adjustment ${result.adjustment_number} applied.`
          : `${result.count_number} completed with no stock differences.`
      );

      await refresh();
    } catch (error) {
      announce("error", error.message);
    } finally {
      setBusy("");
    }
  }

  async function handleCancel() {
    if (!activeSession) return;

    const reason = window.prompt(
      `Enter a cancellation reason for ${activeSession.count_number}:`
    );

    if (reason === null) return;

    if (reason.trim().length < 3) {
      announce(
        "error",
        "A cancellation reason is required."
      );
      return;
    }

    try {
      setBusy("cancel");

      await cancelStockCount(
        supabase,
        activeSession.id,
        reason
      );

      announce(
        "success",
        `${activeSession.count_number} cancelled. Inventory was not changed.`
      );

      await refresh();
    } catch (error) {
      announce("error", error.message);
    } finally {
      setBusy("");
    }
  }

  async function viewHistory(session) {
    try {
      setHistorySession(session);
      setHistoryItems([]);
      setHistoryLoading(true);

      const rows =
        await loadStockCountItems(
          supabase,
          session.id
        );

      setHistoryItems(rows);
    } catch (error) {
      announce("error", error.message);
      setHistorySession(null);
    } finally {
      setHistoryLoading(false);
    }
  }

  if (!canManage) {
    return (
      <section className="panel empty-state">
        <ClipboardCheck size={46} />
        <h2>
          Management access required
        </h2>
        <p>
          Only an owner, admin or manager can
          run stock counts.
        </p>
      </section>
    );
  }

  return (
    <div className="page-stack stock-count-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            INVENTORY CONTROL
          </p>
          <h1>Stock Count</h1>
          <p className="muted">
            Count physical stock by camera,
            package barcode or manual base
            quantity.
          </p>
        </div>

        <div className="page-heading-actions">
          {activeSession ? (
            <>
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  setScannerOpen(true)
                }
                disabled={
                  busy === "scan"
                  || loading
                }
              >
                <Camera size={18} />
                Scan product
              </button>

              <button
                type="button"
                className="primary-button"
                onClick={handleSaveAll}
                disabled={
                  loading
                  || busy === "save-all"
                  || Object.keys(draftItems).length === 0
                }
              >
                <CheckCircle2 size={18} />
                {busy === "save-all"
                  ? "Saving all..."
                  : `Save all counts (${Object.keys(draftItems).length})`}
              </button>

              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  setCompleteOpen(true)
                }
                disabled={loading || busy === "save-all"}
              >
                <CheckCircle2 size={18} />
                Review & complete
              </button>
            </>
          ) : (
            <button
              type="button"
              className="primary-button"
              onClick={() =>
                setStartOpen(true)
              }
              disabled={loading}
            >
              <ClipboardCheck size={18} />
              Start stock count
            </button>
          )}

          <button
            type="button"
            className="secondary-button"
            onClick={refresh}
            disabled={loading}
          >
            <RefreshCw
              size={18}
              className={
                loading ? "spin" : ""
              }
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

      {activeSession ? (
        <>
          <section className="panel stock-count-active-banner">
            <div className="stock-count-active-icon">
              <ClipboardCheck size={25} />
            </div>

            <div>
              <p className="eyebrow">
                ACTIVE COUNT
              </p>
              <h2>
                {activeSession.count_number}
                {" · "}
                {activeSession.name}
              </h2>
              <span>
                Started{" "}
                {dateTime(
                  activeSession.started_at
                )}
                {" · "}
                {activeSession.blind_count
                  ? "Blind count"
                  : "Visible system stock"}
              </span>
            </div>

            <button
              type="button"
              className="danger-button"
              onClick={handleCancel}
              disabled={busy === "cancel"}
            >
              <XCircle size={18} />
              {busy === "cancel"
                ? "Cancelling..."
                : "Cancel count"}
            </button>
          </section>

          <div className="stock-count-progress-panel panel">
            <div>
              <span>Count progress</span>
              <strong>
                {metrics.counted}
                {" / "}
                {metrics.total}
              </strong>
            </div>

            <div className="stock-count-progress-track">
              <div
                style={{
                  width: `${
                    metrics.progress
                  }%`
                }}
              />
            </div>

            <b>
              {metrics.progress.toLocaleString(
                "en-US",
                {
                  maximumFractionDigits: 0
                }
              )}
              %
            </b>
          </div>

          <div className="stock-count-metrics">
            <article>
              <ClipboardCheck size={21} />
              <span>Counted</span>
              <strong>
                {metrics.counted}
              </strong>
              <small>
                {metrics.uncounted}
                {" uncounted"}
              </small>
            </article>

            <article>
              <StopCircle size={21} />
              <span>Discrepancies</span>
              <strong>
                {activeSession.blind_count
                  ? "Hidden"
                  : metrics.discrepancies}
              </strong>
              <small>
                {activeSession.blind_count
                  ? "Until completion"
                  : `${metrics.shortages} shortages · ${metrics.overages} overages`}
              </small>
            </article>

            <article>
              <PackageSearch size={21} />
              <span>USD value variance</span>
              <strong>
                {activeSession.blind_count
                  ? "Hidden"
                  : money(
                      metrics.valueUsd,
                      "USD"
                    )}
              </strong>
            </article>

            <article>
              <PackageSearch size={21} />
              <span>KHR value variance</span>
              <strong>
                {activeSession.blind_count
                  ? "Hidden"
                  : money(
                      metrics.valueKhr,
                      "KHR"
                    )}
              </strong>
            </article>
          </div>

          <section className="panel stock-count-toolbar">
            <div className="search-box">
              <Search size={18} />
              <input
                value={search}
                onChange={(event) =>
                  setSearch(
                    event.target.value
                  )
                }
                placeholder="Search product, code, barcode or package"
              />
            </div>

            <select
              value={categoryFilter}
              onChange={(event) =>
                setCategoryFilter(
                  event.target.value
                )
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

            <select
              value={countFilter}
              onChange={(event) =>
                setCountFilter(
                  event.target.value
                )
              }
            >
              <option value="all">
                All count items
              </option>
              <option value="uncounted">
                Uncounted
              </option>
              <option value="counted">
                Counted
              </option>
              <option value="difference">
                Has difference
              </option>
              <option value="shortage">
                Shortage
              </option>
              <option value="overage">
                Overage
              </option>
            </select>
          </section>

          <section className="panel stock-count-table-panel">
            {loading ? (
              <div className="empty-state">
                <RefreshCw
                  className="spin"
                  size={34}
                />
                <p>
                  Loading count products...
                </p>
              </div>
            ) : visibleItems.length === 0 ? (
              <div className="empty-state">
                <PackageSearch size={46} />
                <h2>No matching count items</h2>
                <p>
                  Change the search or filters.
                </p>
              </div>
            ) : (
              <div className="stock-count-table-wrap">
                <table className="stock-count-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Base unit</th>
                      <th>System stock</th>
                      <th>Counted</th>
                      <th>Variance</th>
                      <th>Value variance</th>
                      <th>Note</th>
                      <th>Status</th>
                    </tr>
                  </thead>

                  <tbody>
                    {visibleItems.map((item) => (
                      <StockCountRow
                        key={item.id}
                        item={item}
                        blind={
                          activeSession
                            .blind_count
                        }
                        busy={busy === "save-all"}
                        onDraftChange={handleDraftChange}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : (
        <section className="panel stock-count-empty-active">
          <ClipboardCheck size={47} />
          <h2>No active stock count</h2>
          <p>
            Start a full, category or selected-product
            count. Tiny POS snapshots the system
            quantities before counting begins.
          </p>
          <button
            type="button"
            className="primary-button"
            onClick={() =>
              setStartOpen(true)
            }
          >
            Start stock count
          </button>
        </section>
      )}

      <section className="panel stock-count-history-panel">
        <div className="panel-title-row">
          <div>
            <p className="eyebrow">
              HISTORY
            </p>
            <h2>Stock count sessions</h2>
          </div>
          <History size={22} />
        </div>

        {sessions.length === 0 ? (
          <p className="muted">
            No stock count history yet.
          </p>
        ) : (
          <div className="stock-count-history-list">
            {sessions.map((session) => (
              <article key={session.id}>
                <div>
                  <strong>
                    {session.count_number}
                    {" · "}
                    {session.name}
                  </strong>
                  <span>
                    {dateTime(
                      session.started_at
                    )}
                    {" · "}
                    {session.expected_items}
                    {" products · "}
                    {session.scope}
                  </span>
                </div>

                <div>
                  <span
                    className={`status-pill ${
                      session.status
                        === "completed"
                        ? "active"
                        : session.status
                            === "cancelled"
                          ? "inactive"
                          : "pending"
                    }`}
                  >
                    {session.status}
                  </span>

                  <small>
                    {session.discrepancy_items}
                    {" differences"}
                  </small>
                </div>

                <div>
                  <strong>
                    {money(
                      session
                        .value_variance_usd,
                      "USD"
                    )}
                  </strong>
                  <small>
                    {money(
                      session
                        .value_variance_khr,
                      "KHR"
                    )}
                  </small>
                </div>

                <button
                  type="button"
                  className="icon-button"
                  onClick={() =>
                    viewHistory(session)
                  }
                  title="View stock count details"
                >
                  <Eye size={18} />
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      <StockCountStartModal
        open={startOpen}
        products={products}
        categories={categories}
        busy={busy === "start"}
        onClose={() =>
          setStartOpen(false)
        }
        onSubmit={handleStart}
      />

      <StockCountCompleteModal
        session={
          completeOpen
            ? activeSession
            : null
        }
        metrics={metrics}
        busy={busy === "complete"}
        onClose={() =>
          setCompleteOpen(false)
        }
        onSubmit={handleComplete}
      />

      <StockCountHistoryModal
        session={historySession}
        items={historyItems}
        loading={historyLoading}
        onClose={() => {
          setHistorySession(null);
          setHistoryItems([]);
        }}
      />

      <BarcodeScanner
        open={scannerOpen}
        title="Scan product or package for stock count"
        onClose={() =>
          setScannerOpen(false)
        }
        onDetected={handleScan}
      />
    </div>
  );
}
