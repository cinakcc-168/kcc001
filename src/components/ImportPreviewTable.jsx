import { useLanguage } from "../context/LanguageContext";

export default function ImportPreviewTable({ headers, rows }) {
  const { t, language } = useLanguage();
  const dateLocale = language === "km" ? "km-KH" : "en-US";

  if (!rows.length) return null;

  return (
    <div className="import-preview-wrap">
      <table className="import-preview-table">
        <thead>
          <tr>
            <th>{t("CSV row")}</th>
            {headers.map((header) => (
              <th key={header}>{header.replaceAll("_", " ")}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 20).map((row) => (
            <tr key={row.rowNumber}>
              <td>{row.rowNumber}</td>
              {headers.map((header) => (
                <td key={header} title={row.values[header] || ""}>
                  {row.values[header] || <span className="muted">—</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 20 && (
        <p className="import-preview-more">
          {language === "km"
            ? `បង្ហាញ ២០ នៃ ${rows.length.toLocaleString(dateLocale)} ជួរទិន្នន័យ។`
            : `Showing 20 of ${rows.length.toLocaleString(dateLocale)} data rows.`}
        </p>
      )}
    </div>
  );
}
