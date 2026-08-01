import {
  CheckCircle2,
  ClipboardCheck,
  Eye,
  History,
  PackageSearch,
  RefreshCw,
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
import StockCountStartModal from "../components/StockCountStartModal";
import StockCountWorkspaceModal from "../components/StockCountWorkspaceModal";
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

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export default function StockCountsPage() {
  const { supabase, profile, can } = useAuth();
  const canManage = can("stock_counts.manage");

  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [items, setItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [countFilter, setCountFilter] = useState("all");

  const [startOpen, setStartOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);

  const [historySession, setHistorySession] = useState(null);
  const [historyItems, setHistoryItems] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [draftItems, setDraftItems] = useState({});
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");

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
      const workspace = await loadStockCountWorkspace(supabase, profile);
      setSessions(workspace.sessions);
      setActiveSession(workspace.activeSession);
      setItems(workspace.activeItems);
      setProducts(workspace.products);
      setCategories(workspace.categories);
      setDraftItems({});
      if (!workspace.activeSession) setWorkspaceOpen(false);
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

  const metrics = useMemo(() => {
    let discrepancies = 0;
    let shortages = 0;
    let overages = 0;
    let valueUsd = 0;
    let valueKhr = 0;
    let counted = 0;

    for (const item of items) {
      if (item.counted_quantity === null) continue;
      counted += 1;
      const variance = item.counted_quantity - item.expected_quantity;
      if (variance !== 0) {
        discrepancies += 1;
        if (variance < 0) shortages += 1;
        else overages += 1;
      }
      const value = variance * Number(item.unit_cost_snapshot || 0);
      if (item.products?.currency === "KHR") valueKhr += value;
      else valueUsd += value;
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
      progress: items.length > 0 ? counted / items.length * 100 : 0
    };
  }, [items]);

  const historySessions = useMemo(
    () => sessions.filter((session) => session.id !== activeSession?.id),
    [sessions, activeSession]
  );

  const visibleItems = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return items.filter((item) => {
      const product = item.products || {};
      const variance = item.counted_quantity === null
        ? null
        : item.counted_quantity - item.expected_quantity;

      if (categoryFilter && product.category_id !== categoryFilter) return false;
      if (countFilter === "uncounted" && item.counted_quantity !== null) return false;
      if (countFilter === "counted" && item.counted_quantity === null) return false;
      if (countFilter === "difference" && (variance === null || variance === 0)) return false;
      if (countFilter === "shortage" && (variance === null || variance >= 0)) return false;
      if (countFilter === "overage" && (variance === null || variance <= 0)) return false;
      if (!needle) return true;

      return [
        product.name,
        product.name_km,
        product.sku,
        product.barcode,
        product.categories?.name,
        ...(product.product_units || []).flatMap((unit) => [
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
  }, [items, search, categoryFilter, countFilter]);

  function announce(type, text) {
    setMessageType(type);
    setMessage(text);
  }

  async function handleStart(values) {
    try {
      setBusy("start");
      const result = await startStockCount(supabase, values);
      setStartOpen(false);
      announce(
        "success",
        `${result.count_number} started with ${result.expected_items} products.`
      );
      await refresh();
      setWorkspaceOpen(true);
    } catch (error) {
      announce("error", error.message);
    } finally {
      setBusy("");
    }
  }

  function handleDraftChange(item, countedQuantity, note) {
    setDraftItems((current) => {
      const originalQuantity = item.counted_quantity === null
        ? null
        : Number(item.counted_quantity);
      const normalizedQuantity = countedQuantity === null
        ? null
        : Number(countedQuantity);
      const originalNote = String(item.note || "").trim();
      const normalizedNote = String(note || "").trim();
      const next = { ...current };
      const unchanged =
        originalQuantity === normalizedQuantity
        && originalNote === normalizedNote;

      if (unchanged) delete next[item.product_id];
      else {
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
      && (!Number.isFinite(item.counted_quantity) || item.counted_quantity < 0)
    );
    if (invalid) {
      announce("error", "Every counted quantity must be zero or greater.");
      return;
    }

    try {
      setBusy("save-all");
      const result = await saveAllStockCountItems(supabase, {
        session_id: activeSession.id,
        items: pending
      });
      announce(
        "success",
        `${result.saved_items || pending.length} product counts saved together.`
      );
      await refresh();
      setWorkspaceOpen(true);
    } catch (error) {
      announce("error", error.message);
    } finally {
      setBusy("");
    }
  }

  async function handleScan(code) {
    const match = exactStockCountMatch(items, code);
    if (!match) {
      announce("error", `No product or package in this count matches ${code}.`);
      throw new Error(`No product or package in this count matches ${code}.`);
    }

    try {
      setBusy("scan");
      const result = await scanStockCountItem(supabase, {
        session_id: activeSession.id,
        product_id: match.product.id,
        product_unit_id: match.unit?.id || null,
        unit_quantity: 1
      });
      announce(
        "success",
        [
          match.product.name,
          `+${stockNumber(result.base_increment)}`,
          match.product.unit_name,
          `from 1 ${result.unit?.name || match.product.unit_name}`
        ].join(" · ")
      );
      await refresh();
      setWorkspaceOpen(true);
      return true;
    } catch (error) {
      announce("error", error.message);
      throw error;
    } finally {
      setBusy("");
    }
  }

  async function handleComplete(note) {
    try {
      setBusy("complete");
      const result = await completeStockCount(supabase, activeSession.id, note);
      setCompleteOpen(false);
      setWorkspaceOpen(false);
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
      announce("error", "A cancellation reason is required.");
      return;
    }

    try {
      setBusy("cancel");
      await cancelStockCount(supabase, activeSession.id, reason);
      setWorkspaceOpen(false);
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
      const rows = await loadStockCountItems(supabase, session.id);
      setHistoryItems(rows);
    } catch (error) {
      announce("error", error.message);
      setHistorySession(null);
    } finally {
      setHistoryLoading(false);
    }
  }

  function exportActiveCount() {
    if (!activeSession) return;
    const rows = [
      ["Stock count", activeSession.count_number],
      ["Name", activeSession.name],
      ["Started", dateTime(activeSession.started_at)],
      ["Progress", `${metrics.counted}/${metrics.total}`],
      [],
      [
        "Product",
        "Khmer name",
        "Code",
        "Unit",
        "System stock",
        "Counted",
        "Variance",
        "Value variance",
        "Note"
      ],
      ...items.map((item) => {
        const product = item.products || {};
        const variance = item.counted_quantity === null
          ? ""
          : Number(item.counted_quantity) - Number(item.expected_quantity);
        const value = variance === ""
          ? ""
          : Number(variance) * Number(item.unit_cost_snapshot || 0);
        return [
          product.name || "",
          product.name_km || "",
          product.sku || product.barcode || "",
          product.unit_name || "pcs",
          activeSession.blind_count ? "Hidden" : stockNumber(item.expected_quantity),
          item.counted_quantity === null ? "" : stockNumber(item.counted_quantity),
          activeSession.blind_count || variance === "" ? "" : stockNumber(variance),
          activeSession.blind_count || value === ""
            ? ""
            : money(value, product.currency || "USD"),
          item.note || ""
        ];
      })
    ];
    const content = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF", content], {
      type: "text/csv;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${activeSession.count_number}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function printActiveCount() {
    if (!activeSession) return;
    const printWindow = window.open("", "_blank", "width=1100,height=800");
    if (!printWindow) {
      announce("error", "Allow pop-ups to print this stock count.");
      return;
    }

    const rows = items.map((item, index) => {
      const product = item.products || {};
      const variance = item.counted_quantity === null
        ? null
        : Number(item.counted_quantity) - Number(item.expected_quantity);
      return `
        <tr>
          <td>${index + 1}</td>
          <td><strong>${escapeHtml(product.name)}</strong>${product.name_km ? `<small>${escapeHtml(product.name_km)}</small>` : ""}</td>
          <td>${escapeHtml(product.sku || product.barcode || "—")}</td>
          <td>${escapeHtml(product.unit_name || "pcs")}</td>
          <td>${activeSession.blind_count ? "Hidden" : escapeHtml(stockNumber(item.expected_quantity))}</td>
          <td>${item.counted_quantity === null ? "—" : escapeHtml(stockNumber(item.counted_quantity))}</td>
          <td>${activeSession.blind_count || variance === null ? "—" : escapeHtml(`${variance > 0 ? "+" : ""}${stockNumber(variance)}`)}</td>
          <td>${escapeHtml(item.note || "")}</td>
        </tr>`;
    }).join("");

    printWindow.document.write(`<!doctype html>
      <html><head><meta charset="utf-8"><title>${escapeHtml(activeSession.count_number)}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Khmer:wght@400;600;700&display=swap');
        body{font-family:'Noto Sans Khmer',Arial,sans-serif;color:#111;padding:24px}
        h1{margin:0 0 6px}p{margin:3px 0;color:#555}table{width:100%;border-collapse:collapse;margin-top:20px;font-size:12px}
        th,td{border:1px solid #bbb;padding:8px;text-align:left;vertical-align:top}th{background:#f3f4f6}small{display:block;color:#555;margin-top:3px}
        .summary{display:flex;gap:20px;margin-top:14px}.summary b{font-size:18px}
        @media print{body{padding:0}}
      </style></head><body>
      <h1>${escapeHtml(activeSession.count_number)} · ${escapeHtml(activeSession.name)}</h1>
      <p>Started ${escapeHtml(dateTime(activeSession.started_at))}</p>
      <div class="summary"><span>Counted <b>${metrics.counted}/${metrics.total}</b></span><span>Differences <b>${metrics.discrepancies}</b></span></div>
      <table><thead><tr><th>#</th><th>Product</th><th>Code</th><th>Unit</th><th>System stock</th><th>Counted</th><th>Variance</th><th>Note</th></tr></thead><tbody>${rows}</tbody></table>
      <script>window.addEventListener('load',()=>setTimeout(()=>window.print(),400));<\/script>
      </body></html>`);
    printWindow.document.close();
  }

  if (!canManage) {
    return (
      <section className="panel empty-state">
        <ClipboardCheck size={46} />
        <h2>Management access required</h2>
        <p>Only an owner, admin or manager can run stock counts.</p>
      </section>
    );
  }

  return (
    <div className="page-stack stock-count-page">
      <div className="page-heading stock-count-page-heading">
        <div>
          <p className="eyebrow">INVENTORY CONTROL</p>
          <h1>Stock Count</h1>
          <p className="muted">
            Start a count, open only the count you are working on, then save all entered quantities together.
          </p>
        </div>

        <div className="page-heading-actions">
          {!activeSession && (
            <button
              type="button"
              className="primary-button"
              onClick={() => setStartOpen(true)}
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
            <RefreshCw size={18} className={loading ? "spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {message && (
        <div className={`notice ${messageType}`} onClick={() => setMessage("")}>
          {message}
        </div>
      )}

      {activeSession ? (
        <section className="panel stock-count-session-card active">
          <div className="stock-count-session-index">1</div>
          <div className="stock-count-session-main">
            <p className="eyebrow">ACTIVE COUNT</p>
            <h2>{activeSession.count_number} · {activeSession.name}</h2>
            <span>
              {dateTime(activeSession.started_at)} · {metrics.counted}/{metrics.total} counted · {Math.round(metrics.progress)}%
            </span>
            <div className="stock-count-card-progress">
              <div style={{ width: `${metrics.progress}%` }} />
            </div>
          </div>
          <div className="stock-count-session-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => setWorkspaceOpen(true)}
            >
              <ClipboardCheck size={18} />
              Open count
            </button>
            <button
              type="button"
              className="danger-button"
              onClick={handleCancel}
              disabled={busy === "cancel"}
              title="Cancel this stock count"
            >
              <XCircle size={18} />
            </button>
          </div>
        </section>
      ) : (
        <section className="panel stock-count-empty-active compact">
          <ClipboardCheck size={42} />
          <h2>No active stock count</h2>
          <p>Start a full, category or selected-product count.</p>
          <button
            type="button"
            className="primary-button"
            onClick={() => setStartOpen(true)}
          >
            Start stock count
          </button>
        </section>
      )}

      <section className="panel stock-count-history-panel">
        <div className="panel-title-row">
          <div>
            <p className="eyebrow">STOCK COUNTS</p>
            <h2>Previous counts</h2>
          </div>
          <History size={22} />
        </div>

        {historySessions.length === 0 ? (
          <p className="muted">No stock count history yet.</p>
        ) : (
          <div className="stock-count-history-list compact-cards">
            {historySessions.map((session, index) => (
              <article key={session.id}>
                <div className="stock-count-session-index">{index + (activeSession ? 2 : 1)}</div>
                <div>
                  <strong>{session.count_number} · {session.name}</strong>
                  <span>
                    {dateTime(session.started_at)} · {session.expected_items} products · {session.scope}
                  </span>
                </div>
                <div>
                  <span className={`status-pill ${
                    session.status === "completed"
                      ? "active"
                      : session.status === "cancelled"
                        ? "inactive"
                        : "pending"
                  }`}>
                    {session.status}
                  </span>
                  <small>{session.discrepancy_items} differences</small>
                </div>
                <div>
                  <strong>{money(session.value_variance_usd, "USD")}</strong>
                  <small>{money(session.value_variance_khr, "KHR")}</small>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => viewHistory(session)}
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
        onClose={() => setStartOpen(false)}
        onSubmit={handleStart}
      />

      <StockCountWorkspaceModal
        session={workspaceOpen ? activeSession : null}
        metrics={metrics}
        categories={categories}
        visibleItems={visibleItems}
        search={search}
        categoryFilter={categoryFilter}
        countFilter={countFilter}
        loading={loading}
        busy={busy}
        draftCount={Object.keys(draftItems).length}
        onSearchChange={setSearch}
        onCategoryChange={setCategoryFilter}
        onCountFilterChange={setCountFilter}
        onDraftChange={handleDraftChange}
        onSaveAll={handleSaveAll}
        onScan={() => setScannerOpen(true)}
        onComplete={() => setCompleteOpen(true)}
        onCancel={handleCancel}
        onExport={exportActiveCount}
        onPrint={printActiveCount}
        onClose={() => setWorkspaceOpen(false)}
      />

      <StockCountCompleteModal
        session={completeOpen ? activeSession : null}
        metrics={metrics}
        busy={busy === "complete"}
        onClose={() => setCompleteOpen(false)}
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
        onClose={() => setScannerOpen(false)}
        onDetected={handleScan}
        continuous
      />
    </div>
  );
}
