import {
  Camera,
  CheckCircle2,
  Download,
  PackageSearch,
  Printer,
  Search,
  StopCircle,
  XCircle
} from "lucide-react";
import Modal from "./Modal";
import ListViewControls from "./ListViewControls";
import { useListViewState } from "../lib/listViewState";
import StockCountRow from "./StockCountRow";
import { money } from "../lib/catalog";
import { useLanguage } from "../context/LanguageContext";

function dateTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export default function StockCountWorkspaceModal({
  session,
  metrics,
  categories,
  visibleItems,
  search,
  categoryFilter,
  countFilter,
  loading,
  busy,
  draftCount,
  onSearchChange,
  onCategoryChange,
  onCountFilterChange,
  onDraftChange,
  onCountAllExpected,
  onSaveAll,
  onScan,
  onComplete,
  onCancel,
  onExport,
  onPrint,
  onClose
}) {
  const { t } = useLanguage();
  const listState = useListViewState(visibleItems || [], "stock-count-workspace", 30);

  if (!session) return null;

  return (
    <Modal
      title={`${session.count_number} · ${session.name}`}
      onClose={onClose}
      wide
      className="stock-count-dialog"
      bodyClassName="stock-count-dialog-body"
      closeDisabled={Boolean(busy === "save-all" || busy === "cancel")}
    >
      <div className="stock-count-workspace">
        <div className="stock-count-workspace-actions" data-print-hide>
          <button
            type="button"
            className="secondary-button"
            onClick={onScan}
            disabled={busy === "scan" || loading}
          >
            <Camera size={18} />
            {t("Scan product")}
          </button>

          {onCountAllExpected && (
            <button
              type="button"
              className="secondary-button"
              onClick={onCountAllExpected}
              disabled={loading || busy === "save-all"}
              title={t("Set all counted quantities to match expected stock")}
            >
              <CheckCircle2 size={18} />
              {t("Counted all")}
            </button>
          )}

          <button
            type="button"
            className="primary-button"
            onClick={onSaveAll}
            disabled={
              loading
              || busy === "save-all"
              || draftCount === 0
            }
          >
            <CheckCircle2 size={18} />
            {busy === "save-all"
              ? t("Saving all...")
              : `${t("Save all counts")} (${draftCount})`}
          </button>

          <button
            type="button"
            className="secondary-button"
            onClick={onComplete}
            disabled={loading || busy === "save-all" || draftCount > 0}
            title={draftCount > 0 ? t("Save all edited counts and batch selections first") : t("Review and complete stock count")}
          >
            <CheckCircle2 size={18} />
            {t("Review & complete")}
          </button>

          <button
            type="button"
            className="secondary-button"
            onClick={onExport}
          >
            <Download size={18} />
            {t("Export Excel")}
          </button>

          <button
            type="button"
            className="secondary-button"
            onClick={onPrint}
          >
            <Printer size={18} />
            {t("Print count")}
          </button>

          <button
            type="button"
            className="danger-button"
            onClick={onCancel}
            disabled={busy === "cancel"}
          >
            <XCircle size={18} />
            {busy === "cancel" ? t("Cancelling...") : t("Cancel count")}
          </button>
        </div>

        <section className="stock-count-print-document">
          <header className="stock-count-print-header stock-count-print-only-header">
            <div>
              <p className="eyebrow">{t("ACTIVE STOCK COUNT")}</p>
              <h2>{session.count_number} · {session.name}</h2>
              <span>
                {t("Started")} {dateTime(session.started_at)} · {session.blind_count
                  ? t("Blind count")
                  : t("Visible system stock")}
              </span>
            </div>
            <strong>{Math.round(metrics.progress)}%</strong>
          </header>

          <div className="stock-count-progress-panel panel-like">
            <div>
              <span>{t("Count progress")}</span>
              <strong>{metrics.counted} / {metrics.total}</strong>
            </div>
            <div className="stock-count-progress-track">
              <div style={{ width: `${metrics.progress}%` }} />
            </div>
            <b>{Math.round(metrics.progress)}%</b>
          </div>

          <div className="stock-count-metrics">
            <article>
              <CheckCircle2 size={21} />
              <span>{t("Counted")}</span>
              <strong>{metrics.counted}</strong>
              <small>{metrics.uncounted} {t("uncounted")}</small>
            </article>
            <article>
              <StopCircle size={21} />
              <span>{t("Discrepancies")}</span>
              <strong>{session.blind_count ? t("Hidden") : metrics.discrepancies}</strong>
              <small>
                {session.blind_count
                  ? t("Until completion")
                  : `${metrics.shortages} ${t("shortages")} · ${metrics.overages} ${t("overages")}`}
              </small>
            </article>
            <article>
              <PackageSearch size={21} />
              <span>{t("USD value variance")}</span>
              <strong>{session.blind_count ? t("Hidden") : money(metrics.valueUsd, "USD")}</strong>
            </article>
            <article>
              <PackageSearch size={21} />
              <span>{t("KHR value variance")}</span>
              <strong>{session.blind_count ? t("Hidden") : money(metrics.valueKhr, "KHR")}</strong>
            </article>
          </div>

          <section className="stock-count-toolbar panel-like" data-print-hide>
            <div className="search-box">
              <Search size={18} />
              <input
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder={t("Search product, code, barcode or package")}
              />
            </div>

            <select
              value={categoryFilter}
              onChange={(event) => onCategoryChange(event.target.value)}
            >
              <option value="">{t("All categories")}</option>
              {categories.map((category) => (
                <option value={category.id} key={category.id}>
                  {category.name}
                </option>
              ))}
            </select>

            <select
              value={countFilter}
              onChange={(event) => onCountFilterChange(event.target.value)}
            >
              <option value="all">{t("All count items")}</option>
              <option value="uncounted">{t("uncounted")}</option>
              <option value="counted">{t("counted")}</option>
              <option value="difference">{t("Has difference")}</option>
              <option value="shortage">{t("shortages")}</option>
              <option value="overage">{t("overages")}</option>
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
            onExport={onExport}
            onPrint={onPrint}
            className="stock-count-list-controls"
          />

          <section className="stock-count-table-panel panel-like">
            {loading ? (
              <div className="empty-state"><p>{t("Loading count products...")}</p></div>
            ) : visibleItems.length === 0 ? (
              <div className="empty-state">
                <PackageSearch size={46} />
                <h2>{t("No matching count items")}</h2>
                <p>{t("Change the search or filters.")}</p>
              </div>
            ) : listState.viewMode === "table" ? (
              <div className="stock-count-table-wrap responsive-wide-table-wrap">
                <table className="stock-count-table responsive-wide-table">
                  <thead>
                    <tr>
                      <th>{t("Product")}</th>
                      <th>{t("Base unit")}</th>
                      <th>{t("Batch / lot")}</th>
                      <th>{t("System stock")}</th>
                      <th>{t("Counted")}</th>
                      <th>{t("Variance")}</th>
                      <th>{t("Value variance")}</th>
                      <th>{t("Note")}</th>
                      <th>{t("Status")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listState.pageRows.map((item) => (
                      <StockCountRow key={item.id} item={item} blind={session.blind_count} busy={busy === "save-all"} onDraftChange={onDraftChange} />
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="responsive-data-card-grid stock-count-card-grid">
                {listState.pageRows.map((item) => (
                  <StockCountRow key={item.id} item={item} blind={session.blind_count} busy={busy === "save-all"} onDraftChange={onDraftChange} asCard />
                ))}
              </div>
            )}
          </section>
        </section>
      </div>
    </Modal>
  );
}
