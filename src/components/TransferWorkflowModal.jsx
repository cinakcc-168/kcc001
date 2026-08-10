import {
  Camera,
  CheckCircle2,
  Clock3,
  Download,
  PackageCheck,
  Printer,
  RotateCcw,
  Save,
  Search,
  XCircle
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Modal from "./Modal";
import BarcodeScanner from "./BarcodeScanner";
import ListViewControls from "./ListViewControls";
import { useListViewState } from "../lib/listViewState";
import { stockNumber } from "../lib/catalog";
import { exportListExcel, printListDocument } from "../lib/listDocuments";
import { baseProductUnit, findProductUnit, sortedProductUnits } from "../lib/productUnits";

function requestedUnit(item) {
  const product = item.products || {};
  return (
    (product.product_units || []).find((unit) => unit.id === item.requested_product_unit_id)
    || baseProductUnit(product)
    || null
  );
}

function initialCountRow(item) {
  const product = item.products || {};
  const unit = (
    (product.product_units || []).find((row) => row.id === item.counted_product_unit_id)
    || requestedUnit(item)
    || baseProductUnit(product)
  );
  return {
    quantity: item.counted_unit_quantity === null || item.counted_unit_quantity === undefined
      ? ""
      : String(item.counted_unit_quantity),
    product_unit_id: unit?.id || "",
    note: item.count_note || ""
  };
}

export default function TransferWorkflowModal({
  transfer,
  mode,
  busy,
  onClose,
  onSaveCount,
  onApprove,
  onReopen,
  onCancel
}) {
  const [counts, setCounts] = useState({});
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [countFilter, setCountFilter] = useState("all");
  const [reviewing, setReviewing] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanMessage, setScanMessage] = useState("");

  useEffect(() => {
    if (!transfer) return;
    setCounts(Object.fromEntries((transfer.stock_transfer_items || []).map((item) => [item.product_id, initialCountRow(item)])));
    setNotes(mode === "approve" ? transfer.approval_note || "" : transfer.count_notes || "");
    setError("");
    setSearch("");
    setCountFilter("all");
    setReviewing(false);
    setScannerOpen(false);
    setScanMessage("");
  }, [transfer, mode]);

  const rows = transfer?.stock_transfer_items || [];

  function rowValues(item) {
    const draft = counts[item.product_id] || initialCountRow(item);
    const product = item.products || {};
    const unit = findProductUnit(product, draft.product_unit_id) || requestedUnit(item) || baseProductUnit(product);
    const unitQuantity = String(draft.quantity ?? "").trim() === "" ? null : Number(draft.quantity);
    const factor = Number(unit?.conversion_factor || 1);
    const countedBase = unitQuantity === null || !Number.isFinite(unitQuantity)
      ? null
      : Number((unitQuantity * factor).toFixed(3));
    const requestedBase = Number(item.quantity || 0);
    const variance = countedBase === null ? null : Number((countedBase - requestedBase).toFixed(3));
    const originalUnitId = item.counted_product_unit_id || requestedUnit(item)?.id || baseProductUnit(product)?.id || "";
    const originalQuantity = item.counted_unit_quantity === null || item.counted_unit_quantity === undefined
      ? ""
      : String(item.counted_unit_quantity);
    const changed = String(draft.quantity ?? "") !== originalQuantity
      || String(unit?.id || "") !== String(originalUnitId || "")
      || String(draft.note || "").trim() !== String(item.count_note || "").trim();

    return {
      draft,
      product,
      unit,
      unitQuantity,
      factor,
      countedBase,
      requestedBase,
      variance,
      changed
    };
  }

  const totals = useMemo(() => {
    let countedRows = 0;
    let differences = 0;
    let requested = 0;
    let counted = 0;
    let changed = 0;

    for (const item of rows) {
      const values = rowValues(item);
      requested += values.requestedBase;
      if (values.countedBase !== null && Number.isFinite(values.countedBase)) {
        countedRows += 1;
        counted += values.countedBase;
        if (Math.abs(Number(values.variance || 0)) > 0.0005) differences += 1;
      }
      if (values.changed) changed += 1;
    }

    return {
      totalRows: rows.length,
      countedRows,
      uncountedRows: Math.max(0, rows.length - countedRows),
      differences,
      requested,
      counted,
      changed,
      progress: rows.length ? (countedRows / rows.length) * 100 : 0
    };
  // counts intentionally drives all row calculations.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, counts]);

  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((item) => {
      const values = rowValues(item);
      const searchable = [
        values.product.name,
        values.product.name_km,
        values.product.sku,
        values.product.barcode
      ].filter(Boolean).join(" ").toLowerCase();
      const matchesSearch = !needle || searchable.includes(needle);
      const matchesFilter = countFilter === "all"
        || (countFilter === "uncounted" && values.countedBase === null)
        || (countFilter === "counted" && values.countedBase !== null)
        || (countFilter === "difference" && values.variance !== null && Math.abs(values.variance) > 0.0005);
      return matchesSearch && matchesFilter;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, counts, search, countFilter]);

  const listState = useListViewState(filteredRows, `transfer-count-${transfer?.id || "none"}`, 30);

  if (!transfer) return null;

  function updateCount(productId, changes) {
    setCounts((current) => ({
      ...current,
      [productId]: {
        ...(current[productId] || {}),
        ...changes
      }
    }));
    setError("");
  }

  function preparedItems(requireAll) {
    const prepared = rows.map((item) => {
      const values = rowValues(item);
      if (values.unitQuantity !== null && (!Number.isFinite(values.unitQuantity) || values.unitQuantity < 0)) {
        throw new Error(`Enter a valid counted quantity for ${values.product.name || "every product"}.`);
      }
      if (requireAll && values.unitQuantity === null) {
        throw new Error("Count every product before submitting for approval.");
      }
      return {
        product_id: item.product_id,
        product_unit_id: values.unit?.id || null,
        counted_unit_quantity: values.unitQuantity,
        note: values.draft.note || ""
      };
    });
    return prepared;
  }

  function transferScanMatch(code) {
    const needle = String(code || "").trim().toLowerCase();
    if (!needle) return null;

    for (const item of rows) {
      const product = item.products || {};
      const unit = sortedProductUnits(product).find(
        (row) => String(row.barcode || "").trim().toLowerCase() === needle
      );
      if (unit) return { item, product, unit };

      if (
        String(product.sku || "").trim().toLowerCase() === needle
        || String(product.barcode || "").trim().toLowerCase() === needle
      ) {
        return { item, product, unit: baseProductUnit(product) };
      }
    }
    return null;
  }

  async function handleScan(code) {
    const match = transferScanMatch(code);
    if (!match) {
      const text = `No transfer product or package matches ${code}.`;
      setScanMessage(text);
      throw new Error(text);
    }

    const current = rowValues(match.item);
    const scannedFactor = Number(match.unit?.conversion_factor || 1);
    const currentBase = current.countedBase === null ? 0 : Number(current.countedBase || 0);
    const nextBase = Number((currentBase + scannedFactor).toFixed(3));
    const nextUnitQuantity = Number((nextBase / Math.max(scannedFactor, 0.001)).toFixed(3));

    updateCount(match.item.product_id, {
      product_unit_id: match.unit?.id || "",
      quantity: String(nextUnitQuantity)
    });
    setScanMessage(`${match.product.name || "Product"} · +1 ${match.unit?.short_name || match.unit?.name || match.product.unit_name || "unit"}`);
    return true;
  }

  function transferCountDocumentRows() {
    return filteredRows.map((item) => ({ item, values: rowValues(item) }));
  }

  function transferCountDocumentColumns() {
    return [
      { label: "Product", width: 190, value: (row) => row.values.product.name || "Product" },
      { label: "Code", width: 105, value: (row) => row.values.product.sku || row.values.product.barcode || "—" },
      { label: "Requested", width: 120, value: (row) => requestedLabel(row.item) },
      { label: "Counted", width: 120, value: (row) => row.values.unitQuantity === null ? "Not counted" : `${stockNumber(row.values.unitQuantity)} ${row.values.unit?.short_name || row.values.unit?.name || row.values.product.unit_name || "pcs"}` },
      { label: "Base count", width: 110, value: (row) => row.values.countedBase === null ? "—" : `${stockNumber(row.values.countedBase)} ${row.values.product.unit_name || "pcs"}` },
      { label: "Variance", width: 95, value: (row) => row.values.variance === null ? "—" : `${row.values.variance > 0 ? "+" : ""}${stockNumber(row.values.variance)}` },
      { label: "Note", width: 190, value: (row) => row.values.draft.note || "—" }
    ];
  }

  function exportCount() {
    exportListExcel({
      filename: `${transfer.transfer_number}-count.xls`,
      title: `${transfer.transfer_number} · Transfer count`,
      subtitle: `${transfer.source_branch?.name || "Source"} → ${transfer.destination_branch?.name || "Destination"}`,
      summary: [
        { label: "Products", value: totals.totalRows },
        { label: "Counted", value: `${totals.countedRows}/${totals.totalRows}` },
        { label: "Requested base units", value: stockNumber(totals.requested) },
        { label: "Counted base units", value: stockNumber(totals.counted) }
      ],
      columns: transferCountDocumentColumns(),
      rows: transferCountDocumentRows()
    });
  }

  function printCount() {
    printListDocument({
      title: `${transfer.transfer_number} · Transfer count`,
      subtitle: `${transfer.source_branch?.name || "Source"} → ${transfer.destination_branch?.name || "Destination"}`,
      summary: [
        { label: "Products", value: totals.totalRows },
        { label: "Counted", value: `${totals.countedRows}/${totals.totalRows}` },
        { label: "Requested base units", value: stockNumber(totals.requested) },
        { label: "Counted base units", value: stockNumber(totals.counted) }
      ],
      columns: transferCountDocumentColumns(),
      rows: transferCountDocumentRows(),
      orientation: "landscape"
    });
  }

  async function cancelTransfer() {
    if (!onCancel) return;
    setError("");
    try {
      await onCancel(transfer);
    } catch (cancelError) {
      setError(cancelError?.message || "The transfer could not be cancelled.");
    }
  }

  async function savePending() {
    setError("");
    try {
      if (totals.changed === 0) {
        setError("Enter or change at least one count first.");
        return;
      }
      await onSaveCount({
        transfer_id: transfer.id,
        items: preparedItems(false),
        notes,
        submit: false
      });
    } catch (saveError) {
      setError(saveError?.message || "The transfer count could not be saved.");
    }
  }

  function openReview() {
    setError("");
    try {
      preparedItems(true);
      setReviewing(true);
    } catch (reviewError) {
      setError(reviewError?.message || "Count every product before reviewing.");
    }
  }

  async function submitCount() {
    setError("");
    try {
      await onSaveCount({
        transfer_id: transfer.id,
        items: preparedItems(true),
        notes,
        submit: true
      });
    } catch (saveError) {
      setError(saveError?.message || "The transfer count could not be submitted.");
    }
  }

  async function approve() {
    setError("");
    try {
      await onApprove(transfer.id, notes);
    } catch (approveError) {
      setError(approveError?.message || "The transfer could not be approved.");
    }
  }

  async function reopen() {
    setError("");
    try {
      await onReopen(transfer.id, notes);
    } catch (reopenError) {
      setError(reopenError?.message || "The transfer could not be returned to counting.");
    }
  }

  function requestedLabel(item) {
    return `${stockNumber(item.requested_unit_quantity ?? item.quantity)} ${item.requested_unit_name || item.products?.unit_name || "pcs"}`;
  }

  function renderCountRow(item, asCard = false) {
    const values = rowValues(item);
    const units = sortedProductUnits(values.product);
    const tone = values.variance === null
      ? ""
      : Math.abs(values.variance) <= 0.0005
        ? "stock-count-balanced"
        : values.variance > 0
          ? "stock-count-over"
          : "stock-count-short";

    if (asCard) {
      return (
        <article className={`responsive-data-card transfer-count-card ${tone}`} key={item.id || item.product_id}>
          <header>
            <div><strong>{values.product.name || "Product"}</strong><small>{values.product.sku || values.product.barcode || "No code"}</small></div>
            <span className={`status-pill ${values.changed ? "pending" : "active"}`}>{values.changed ? "Unsaved" : "Saved"}</span>
          </header>
          <div className="transfer-count-card-requested"><span>Requested</span><strong>{requestedLabel(item)}</strong><small>{stockNumber(values.requestedBase)} {values.product.unit_name || "pcs"} base</small></div>
          <div className="transfer-count-entry-grid">
            <label><span>Counted</span><input type="number" min="0" step="0.001" value={values.draft.quantity ?? ""} onChange={(event) => updateCount(item.product_id, { quantity: event.target.value })} inputMode="decimal" disabled={busy} placeholder="Not counted" /></label>
            <label><span>Unit</span><select value={values.unit?.id || ""} onChange={(event) => updateCount(item.product_id, { product_unit_id: event.target.value })} disabled={busy}>{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.short_name || unit.name}</option>)}</select></label>
          </div>
          <div className="transfer-count-card-results">
            <div><span>Base count</span><strong>{values.countedBase === null ? "—" : `${stockNumber(values.countedBase)} ${values.product.unit_name || "pcs"}`}</strong></div>
            <div><span>Variance</span><strong>{values.variance === null ? "—" : `${values.variance > 0 ? "+" : ""}${stockNumber(values.variance)}`}</strong></div>
          </div>
          <label><span>Note</span><input value={values.draft.note || ""} onChange={(event) => updateCount(item.product_id, { note: event.target.value })} disabled={busy} placeholder="Optional item note" /></label>
        </article>
      );
    }

    return (
      <tr className={tone} key={item.id || item.product_id}>
        <td data-label="Product"><strong>{values.product.name || "Product"}</strong><small>{values.product.sku || values.product.barcode || "No code"}</small></td>
        <td data-label="Requested"><strong>{requestedLabel(item)}</strong><small>{stockNumber(values.requestedBase)} {values.product.unit_name || "pcs"} base</small></td>
        <td data-label="Counted"><input className="transfer-count-input" type="number" min="0" step="0.001" value={values.draft.quantity ?? ""} onChange={(event) => updateCount(item.product_id, { quantity: event.target.value })} inputMode="decimal" disabled={busy} placeholder="Not counted" /></td>
        <td data-label="Unit"><select className="transfer-count-unit" value={values.unit?.id || ""} onChange={(event) => updateCount(item.product_id, { product_unit_id: event.target.value })} disabled={busy}>{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.short_name || unit.name}</option>)}</select></td>
        <td data-label="Base count">{values.countedBase === null ? "—" : `${stockNumber(values.countedBase)} ${values.product.unit_name || "pcs"}`}</td>
        <td data-label="Variance">{values.variance === null ? "—" : <strong>{values.variance > 0 ? "+" : ""}{stockNumber(values.variance)}</strong>}</td>
        <td data-label="Note"><input className="transfer-count-note" value={values.draft.note || ""} onChange={(event) => updateCount(item.product_id, { note: event.target.value })} disabled={busy} placeholder="Optional item note" /></td>
      </tr>
    );
  }

  function renderReadOnlyTable(useDraft = false) {
    return (
      <div className="responsive-wide-table-wrap transfer-product-detail-wrap">
        <table className="responsive-wide-table transfer-product-detail-table">
          <thead><tr><th>Product</th><th>Requested</th><th>Counted</th><th>Base received</th><th>Variance</th><th>Note</th></tr></thead>
          <tbody>
            {rows.map((item) => {
              const product = item.products || {};
              const draftValues = rowValues(item);
              const counted = useDraft
                ? draftValues.countedBase
                : item.counted_quantity === null || item.counted_quantity === undefined ? null : Number(item.counted_quantity);
              const variance = counted === null ? null : counted - Number(item.quantity || 0);
              const countedLabel = useDraft
                ? draftValues.unitQuantity === null
                  ? "Not counted"
                  : `${stockNumber(draftValues.unitQuantity)} ${draftValues.unit?.short_name || draftValues.unit?.name || product.unit_name || "pcs"}`
                : item.counted_unit_quantity === null || item.counted_unit_quantity === undefined
                  ? "Not counted"
                  : `${stockNumber(item.counted_unit_quantity)} ${item.counted_unit_name || product.unit_name || "pcs"}`;
              return (
                <tr key={item.id || item.product_id}>
                  <td><strong>{product.name || "Product"}</strong><small>{product.sku || product.barcode || "No code"}</small></td>
                  <td>{requestedLabel(item)}</td>
                  <td>{countedLabel}</td>
                  <td>{counted === null ? "—" : `${stockNumber(counted)} ${product.unit_name || "pcs"}`}</td>
                  <td>{variance === null ? "—" : `${variance > 0 ? "+" : ""}${stockNumber(variance)}`}</td>
                  <td>{item.count_note || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  if (mode === "count" && reviewing) {
    return (
      <Modal title={`Review & submit ${transfer.transfer_number}`} onClose={() => setReviewing(false)} wide>
        <div className="transfer-count-review">
          <div className="stock-count-complete-grid">
            <div><span>Products</span><strong>{totals.totalRows}</strong></div>
            <div><span>Counted</span><strong>{totals.countedRows}</strong></div>
            <div><span>Differences</span><strong>{totals.differences}</strong></div>
            <div><span>Requested base units</span><strong>{stockNumber(totals.requested)}</strong></div>
            <div><span>Counted base units</span><strong>{stockNumber(totals.counted)}</strong></div>
            <div><span>Approval</span><strong>Required next</strong></div>
          </div>
          <div className="notice warning"><PackageCheck size={18} /> Submitting the count does not move stock yet. An authorized user must press Approve before source stock is deducted and destination stock is added.</div>
          {renderReadOnlyTable(true)}
          <label><span>Counting / delivery note</span><textarea rows="3" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional transfer count note" /></label>
          {error && <div className="notice error">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={() => setReviewing(false)} disabled={busy}>Continue counting</button>
            <button type="button" className="primary-button" onClick={submitCount} disabled={busy}><CheckCircle2 size={18} />{busy ? "Submitting..." : "Submit count"}</button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title={mode === "view" ? transfer.transfer_number : mode === "approve" ? `Approve ${transfer.transfer_number}` : `${transfer.transfer_number} · Transfer count`}
      onClose={onClose}
      wide={mode !== "view"}
      className={mode === "count" ? "stock-count-dialog transfer-count-dialog" : ""}
      bodyClassName={mode === "count" ? "stock-count-dialog-body transfer-count-dialog-body" : ""}
    >
      <div className={`transfer-workflow-modal ${mode === "count" ? "transfer-count-workspace" : ""}`}>
        {mode === "count" && (
          <>
            <div className="stock-count-workspace-actions" data-print-hide>
              <button type="button" className="secondary-button" onClick={() => setScannerOpen(true)} disabled={busy}><Camera size={18} />Scan product</button>
              <button type="button" className="primary-button" onClick={savePending} disabled={busy || totals.changed === 0}><Save size={18} />{busy ? "Saving..." : `Save all counts (${totals.changed})`}</button>
              <button type="button" className="secondary-button" onClick={openReview} disabled={busy}><CheckCircle2 size={18} />Review & submit</button>
              <button type="button" className="secondary-button" onClick={exportCount} disabled={busy}><Download size={18} />Export Excel</button>
              <button type="button" className="secondary-button" onClick={printCount} disabled={busy}><Printer size={18} />Print count</button>
              <button type="button" className="danger-button" onClick={cancelTransfer} disabled={busy || !onCancel}><XCircle size={18} />Cancel transfer</button>
            </div>

            <div className="stock-count-progress-panel panel-like">
              <div><span>Count progress</span><strong>{totals.countedRows} / {totals.totalRows}</strong></div>
              <div className="stock-count-progress-track"><div style={{ width: `${totals.progress}%` }} /></div>
              <b>{Math.round(totals.progress)}%</b>
            </div>

            <div className="stock-count-metrics transfer-count-metrics">
              <article><CheckCircle2 size={21} /><span>Counted</span><strong>{totals.countedRows}</strong><small>{totals.uncountedRows} uncounted</small></article>
              <article><PackageCheck size={21} /><span>Differences</span><strong>{totals.differences}</strong><small>Compared with requested base quantity</small></article>
              <article><Clock3 size={21} /><span>Requested units</span><strong>{stockNumber(totals.requested)}</strong><small>Base units</small></article>
              <article><PackageCheck size={21} /><span>Counted units</span><strong>{stockNumber(totals.counted)}</strong><small>Base units</small></article>
            </div>

            <section className="stock-count-toolbar panel-like transfer-count-toolbar">
              <div className="search-box"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search product, code or barcode" /></div>
              <select value={countFilter} onChange={(event) => setCountFilter(event.target.value)}>
                <option value="all">All transfer items</option>
                <option value="uncounted">Uncounted</option>
                <option value="counted">Counted</option>
                <option value="difference">Has difference</option>
              </select>
            </section>

            <ListViewControls
              viewMode={listState.viewMode}
              onViewModeChange={listState.setViewMode}
              pageSize={listState.pageSize}
              onPageSizeChange={listState.setPageSize}
              totalRows={listState.totalRows}
              currentPage={listState.currentPage}
              totalPages={listState.totalPages}
              onPageChange={listState.setCurrentPage}
              className="stock-count-list-controls transfer-count-list-controls"
            />

            <section className="stock-count-table-panel panel-like transfer-count-table-panel">
              {filteredRows.length === 0 ? (
                <div className="empty-state"><PackageCheck size={44} /><h2>No matching transfer items</h2><p>Change the search or count filter.</p></div>
              ) : listState.viewMode === "table" ? (
                <div className="stock-count-table-wrap responsive-wide-table-wrap">
                  <table className="stock-count-table responsive-wide-table transfer-count-table">
                    <thead><tr><th>Product</th><th>Requested</th><th>Counted</th><th>Unit</th><th>Base count</th><th>Variance</th><th>Note</th></tr></thead>
                    <tbody>{listState.pageRows.map((item) => renderCountRow(item))}</tbody>
                  </table>
                </div>
              ) : (
                <div className="responsive-data-card-grid stock-count-card-grid transfer-count-card-grid">
                  {listState.pageRows.map((item) => renderCountRow(item, true))}
                </div>
              )}
            </section>

            <label><span>Counting / delivery note</span><textarea rows="3" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional transfer count note" /></label>
            {scanMessage && <div className="notice success" onClick={() => setScanMessage("")}>{scanMessage}</div>}
            <div className="notice info"><Clock3 size={18} /> Save all counts keeps this transfer open. Review & submit sends the completed count to approval. You can count in any configured product unit; Tiny POS converts it to base stock automatically.</div>
            <BarcodeScanner
              open={scannerOpen}
              title="Scan product or package for transfer count"
              onClose={() => setScannerOpen(false)}
              onDetected={handleScan}
              continuous
            />
          </>
        )}

        {mode !== "count" && (
          <>
            <section className="transfer-workflow-summary">
              <div><span>From</span><strong>{transfer.source_branch?.name || "Source"}</strong></div>
              <div><span>To</span><strong>{transfer.destination_branch?.name || "Destination"}</strong></div>
              <div><span>Status</span><strong>{transfer.display_status || transfer.status}</strong></div>
              <div><span>Base units</span><strong>{stockNumber(totals.requested)} requested · {stockNumber((rows || []).reduce((sum, item) => sum + Number(item.counted_quantity || 0), 0))} counted</strong></div>
            </section>
            {renderReadOnlyTable(false)}
          </>
        )}

        {mode === "approve" && (
          <>
            <label><span>Approval note</span><textarea rows="3" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional approval note" disabled={busy} /></label>
            <div className="notice warning"><PackageCheck size={18} /> Approving applies the counted base quantity: stock is deducted from the From branch and added to the To branch.</div>
          </>
        )}

        {error && <div className="notice error">{error}</div>}

        {mode !== "count" && (
          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>Close</button>
            {mode === "approve" && <>
              <button type="button" className="secondary-button" onClick={reopen} disabled={busy}><RotateCcw size={18} />Return to counting</button>
              <button type="button" className="primary-button" onClick={approve} disabled={busy}><PackageCheck size={18} />{busy ? "Approving..." : "Approve"}</button>
            </>}
          </div>
        )}
      </div>
    </Modal>
  );
}
