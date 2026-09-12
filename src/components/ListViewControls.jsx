import {
  ChevronLeft,
  ChevronRight,
  Download,
  LayoutGrid,
  Printer,
  Table2
} from "lucide-react";
import { useLanguage } from "../context/LanguageContext";

export const LIST_ROW_OPTIONS = [30, 60, 90, 120];

export function defaultListView() {
  // Tables remain the default on phones because Tiny POS list tables are
  // intentionally horizontally scrollable with one record per row. Users can
  // still switch to Cards whenever they prefer the stacked view.
  return "table";
}

export default function ListViewControls({
  viewMode,
  onViewModeChange,
  pageSize,
  onPageSizeChange,
  totalRows = 0,
  currentPage = 1,
  totalPages = 1,
  onPageChange,
  onExport,
  onPrint,
  exporting = false,
  className = ""
}) {
  const { t } = useLanguage();

  return (
    <div className={`list-view-controls ${className}`.trim()}>
      <div className="list-view-mode" role="group" aria-label={t("List view")}>
        <button
          type="button"
          className={viewMode === "table" ? "active" : ""}
          onClick={() => onViewModeChange("table")}
        >
          <Table2 size={17} /> {t("Table")}
        </button>
        <button
          type="button"
          className={viewMode === "cards" ? "active" : ""}
          onClick={() => onViewModeChange("cards")}
        >
          <LayoutGrid size={17} /> {t("Cards")}
        </button>
      </div>

      <label className="list-row-size">
        <span>{t("Rows")}</span>
        <select
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
        >
          {LIST_ROW_OPTIONS.map((size) => (
            <option value={size} key={size}>{size}</option>
          ))}
        </select>
      </label>

      <div className="list-document-actions">
        {onExport && (
          <button type="button" className="secondary-button compact-button" onClick={onExport} disabled={exporting || totalRows === 0}>
            <Download size={17} /> {exporting ? t("Exporting...") : t("Export")}
          </button>
        )}
        {onPrint && (
          <button type="button" className="secondary-button compact-button" onClick={onPrint} disabled={totalRows === 0}>
            <Printer size={17} /> {t("Print")}
          </button>
        )}
      </div>

      {onPageChange && totalPages > 1 && (
        <div className="list-pagination">
          <button type="button" className="icon-button" onClick={() => onPageChange(Math.max(1, currentPage - 1))} disabled={currentPage <= 1} aria-label={t("Previous")}>
            <ChevronLeft size={18} />
          </button>
          <span>{currentPage} / {totalPages}</span>
          <button type="button" className="icon-button" onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))} disabled={currentPage >= totalPages} aria-label={t("Next")}>
            <ChevronRight size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
