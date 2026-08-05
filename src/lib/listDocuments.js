function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function valueFor(column, row) {
  return typeof column.value === "function"
    ? column.value(row)
    : row[column.value];
}

function widthFor(column, rows) {
  if (Number(column.width) > 0) return Number(column.width);
  let length = String(column.label || "").length;
  for (const row of rows.slice(0, 500)) {
    length = Math.max(length, String(valueFor(column, row) ?? "").length);
  }
  return Math.min(260, Math.max(72, length * 7.2 + 20));
}

function isMobileOrTelegram() {
  try {
    return window.matchMedia("(max-width: 900px)").matches
      || Boolean(window.Telegram?.WebApp?.initData)
      || /iPhone|iPad|iPod|Android/i.test(window.navigator.userAgent || "");
  } catch {
    return false;
  }
}

function openPrintableWindow(title) {
  try {
    const popup = window.open("", "_blank");
    if (!popup) return null;
    popup.document.title = title;
    return popup;
  } catch {
    return null;
  }
}

function currentWindowPrint(html, className, styles = "") {
  document.getElementById(className)?.remove();
  const root = document.createElement("section");
  root.id = className;
  root.className = className;
  root.innerHTML = `<style>${styles}</style>${html}`;
  document.body.appendChild(root);
  document.body.classList.add("tiny-pos-printing");
  void root.offsetHeight;

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    root.remove();
    document.body.classList.remove("tiny-pos-printing");
  };

  window.addEventListener("afterprint", cleanup, { once: true });
  window.setTimeout(cleanup, 300000);
  window.print();
}

async function deliverFile(blob, filename, mimeType) {
  const safeName = filename || "tiny-pos-export.xls";

  if (isMobileOrTelegram() && typeof File !== "undefined" && navigator.share) {
    try {
      const file = new File([blob], safeName, { type: mimeType });
      if (!navigator.canShare || navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: safeName,
          files: [file]
        });
        return;
      }
    } catch (error) {
      // A user cancelling the share sheet is not an export failure. For other
      // WebView limitations continue to the normal download/open fallback.
      if (error?.name === "AbortError") return;
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = safeName;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Some Telegram/iOS WebViews ignore the download attribute. Opening the
  // generated document gives the user a second Save/Share path.
  if (isMobileOrTelegram()) {
    window.setTimeout(() => {
      try {
        window.open(url, "_blank");
      } catch {
        // The share/download attempt above remains the primary path.
      }
    }, 120);
  }

  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function reportDocumentHtml({
  title,
  subtitle = "",
  summary = [],
  columns,
  rows,
  orientation = "landscape"
}) {
  const summaryHtml = summary.length
    ? `<section class="print-summary">${summary.map((item) => `<div><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong></div>`).join("")}</section>`
    : "";
  const head = columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("");
  const body = rows.length
    ? rows.map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(valueFor(column, row))}</td>`).join("")}</tr>`).join("")
    : `<tr><td colspan="${columns.length}">No records found.</td></tr>`;
  const content = `
    <header class="print-report-header">
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(subtitle)}</p>
    </header>
    ${summaryHtml}
    <div class="print-table-scroll">
      <table class="print-report-table">
        <thead><tr>${head}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
    <footer>Printed ${escapeHtml(new Date().toLocaleString())}</footer>
  `;
  const styles = `
*{box-sizing:border-box}body{margin:0;padding:12mm;background:#fff;color:#111;font-family:"Noto Sans Khmer",Arial,sans-serif;font-size:10px}.print-toolbar{position:sticky;top:0;z-index:5;display:flex;justify-content:flex-end;padding:8px;background:#fff;border-bottom:1px solid #ddd}.print-toolbar button{min-height:42px;border:0;border-radius:10px;padding:0 18px;background:#dc2626;color:#fff;font:700 15px Arial,sans-serif}.print-report-header h1{margin:0 0 4px;font-size:20px}.print-report-header p{margin:0 0 12px;color:#555}.print-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:7px;margin:10px 0}.print-summary div{border:1px solid #cfd6df;padding:7px;display:grid;gap:3px}.print-summary span{color:#555}.print-report-table{width:100%;border-collapse:collapse;table-layout:auto}.print-report-table th,.print-report-table td{border:1px solid #cfd6df;padding:5px 6px;vertical-align:top;overflow-wrap:anywhere}.print-report-table th{background:#2563eb;color:#fff;text-align:left;white-space:normal}.print-report-table thead{display:table-header-group}.print-report-table tr{display:table-row!important;break-inside:avoid}.print-report-table th,.print-report-table td{display:table-cell!important}footer{margin-top:10px;color:#666;text-align:right;font-size:8px}@page{size:${orientation};margin:10mm}@media print{body{padding:0}.print-toolbar{display:none!important}}`;
  return { content, styles };
}

export function printListDocument(options) {
  const { title, orientation = "landscape" } = options;
  const { content, styles } = reportDocumentHtml(options);
  const printWindow = openPrintableWindow(title);

  if (printWindow) {
    printWindow.document.open();
    printWindow.document.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>${styles}</style>
</head>
<body>
<div class="print-toolbar"><button type="button" onclick="window.print()">Print</button></div>
${content}
<script>
window.addEventListener('load',function(){
  setTimeout(function(){try{window.focus();window.print()}catch(e){}},120);
});
<\/script>
</body>
</html>`);
    printWindow.document.close();
    return;
  }

  currentWindowPrint(content, "tiny-pos-list-print-root", styles.replace(`@page{size:${orientation};margin:10mm}`, ""));
}

export function exportListExcel({
  filename,
  title,
  subtitle = "",
  summary = [],
  columns,
  rows
}) {
  const columnXml = columns
    .map((column) => `<Column ss:AutoFitWidth="0" ss:Width="${widthFor(column, rows).toFixed(0)}"/>`)
    .join("");
  const summaryRows = summary.map((item) => `
    <Row>
      <Cell ss:StyleID="SummaryLabel"><Data ss:Type="String">${escapeXml(item.label)}</Data></Cell>
      <Cell ss:StyleID="SummaryValue"><Data ss:Type="String">${escapeXml(item.value)}</Data></Cell>
    </Row>`).join("");
  const header = columns.map((column) => `<Cell ss:StyleID="Header"><Data ss:Type="String">${escapeXml(column.label)}</Data></Cell>`).join("");
  const body = rows.map((row) => `<Row ss:AutoFitHeight="1">${columns.map((column) => `<Cell ss:StyleID="Body"><Data ss:Type="String">${escapeXml(valueFor(column, row))}</Data></Cell>`).join("")}</Row>`).join("");
  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Center"/><Font ss:FontName="Arial" ss:Size="10"/></Style>
  <Style ss:ID="Title"><Font ss:Bold="1" ss:Size="16"/><Alignment ss:WrapText="1"/></Style>
  <Style ss:ID="Subtitle"><Font ss:Italic="1" ss:Color="#667085"/><Alignment ss:WrapText="1"/></Style>
  <Style ss:ID="SummaryLabel"><Font ss:Bold="1"/><Interior ss:Color="#F2F4F7" ss:Pattern="Solid"/><Alignment ss:WrapText="1"/></Style>
  <Style ss:ID="SummaryValue"><Alignment ss:WrapText="1"/></Style>
  <Style ss:ID="Header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#2563EB" ss:Pattern="Solid"/><Alignment ss:WrapText="1" ss:Horizontal="Center" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/></Borders></Style>
  <Style ss:ID="Body"><Alignment ss:WrapText="1" ss:Vertical="Top"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D0D5DD"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D0D5DD"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D0D5DD"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D0D5DD"/></Borders></Style>
 </Styles>
 <Worksheet ss:Name="Report">
  <Table>
   ${columnXml}
   <Row><Cell ss:MergeAcross="${Math.max(0, columns.length - 1)}" ss:StyleID="Title"><Data ss:Type="String">${escapeXml(title)}</Data></Cell></Row>
   <Row><Cell ss:MergeAcross="${Math.max(0, columns.length - 1)}" ss:StyleID="Subtitle"><Data ss:Type="String">${escapeXml(subtitle)}</Data></Cell></Row>
   ${summaryRows}
   <Row>${header}</Row>
   ${body}
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane><ProtectObjects>False</ProtectObjects><ProtectScenarios>False</ProtectScenarios></WorksheetOptions>
 </Worksheet>
</Workbook>`;
  const safeName = filename.endsWith(".xls") ? filename : `${filename}.xls`;
  const blob = new Blob(["\uFEFF", xml], { type: "application/vnd.ms-excel;charset=utf-8" });
  void deliverFile(blob, safeName, "application/vnd.ms-excel");
}

export function printHtmlDocument({
  title = "Tiny POS",
  html = "",
  styles = "",
  page = "auto",
  fallbackClassName = "tiny-pos-html-print-root"
}) {
  const documentStyles = `
*{box-sizing:border-box}html,body{margin:0;background:#fff;color:#111;font-family:"Noto Sans Khmer",Arial,sans-serif}.print-toolbar{position:sticky;top:0;z-index:100;display:flex;justify-content:flex-end;padding:8px;background:#fff;border-bottom:1px solid #ddd}.print-toolbar button{min-height:42px;border:0;border-radius:10px;padding:0 18px;background:#dc2626;color:#fff;font:700 15px Arial,sans-serif}${styles}
@page{size:${page};margin:6mm}
@media print{html,body{width:100%;overflow:visible!important}.print-toolbar{display:none!important}}`;
  const printWindow = openPrintableWindow(title);

  if (printWindow) {
    printWindow.document.open();
    printWindow.document.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>${documentStyles}</style>
</head>
<body>
<div class="print-toolbar"><button type="button" onclick="window.print()">Print</button></div>
${html}
<script>window.addEventListener('load',function(){setTimeout(function(){try{window.focus();window.print()}catch(e){}},120)});<\/script>
</body>
</html>`);
    printWindow.document.close();
    return;
  }

  currentWindowPrint(html, fallbackClassName, documentStyles);
}
