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

function preferCurrentWindowPrint() {
  try {
    return window.matchMedia("(max-width: 900px)").matches
      || Boolean(window.Telegram?.WebApp?.initData);
  } catch {
    return false;
  }
}

export function printListDocument({
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
  const documentHtml = `
    <header class="print-report-header">
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(subtitle)}</p>
    </header>
    ${summaryHtml}
    <table class="print-report-table">
      <thead><tr>${head}</tr></thead>
      <tbody>${body}</tbody>
    </table>
    <footer>Printed ${escapeHtml(new Date().toLocaleString())}</footer>
  `;

  const printWindow = preferCurrentWindowPrint()
    ? null
    : window.open("", "_blank", "width=1100,height=800");
  if (printWindow) {
    printWindow.document.open();
    printWindow.document.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
*{box-sizing:border-box}body{margin:0;padding:14mm;background:#fff;color:#111;font-family:"Noto Sans Khmer",Arial,sans-serif;font-size:10px}.print-report-header h1{margin:0 0 4px;font-size:20px}.print-report-header p{margin:0 0 12px;color:#555}.print-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:7px;margin:10px 0}.print-summary div{border:1px solid #cfd6df;padding:7px;display:grid;gap:3px}.print-summary span{color:#555}.print-report-table{width:100%;border-collapse:collapse;table-layout:auto}.print-report-table th,.print-report-table td{border:1px solid #cfd6df;padding:5px 6px;vertical-align:top;overflow-wrap:anywhere}.print-report-table th{background:#2563eb;color:#fff;text-align:left;white-space:normal}.print-report-table thead{display:table-header-group}.print-report-table tr{break-inside:avoid}footer{margin-top:10px;color:#666;text-align:right;font-size:8px}@page{size:${orientation};margin:10mm}@media print{body{padding:0}}
</style>
</head>
<body>${documentHtml}<script>window.addEventListener('load',function(){setTimeout(function(){window.focus();window.print()},250)});<\/script></body>
</html>`);
    printWindow.document.close();
    return;
  }

  document.getElementById("tiny-pos-list-print-root")?.remove();
  const root = document.createElement("section");
  root.id = "tiny-pos-list-print-root";
  root.className = `tiny-pos-list-print-root print-${orientation}`;
  root.innerHTML = documentHtml;
  document.body.appendChild(root);
  void root.offsetHeight;
  const cleanup = () => root.remove();
  window.addEventListener("afterprint", cleanup, { once: true });
  window.setTimeout(cleanup, 300000);
  window.print();
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
  const body = rows.map((row) => `<Row>${columns.map((column) => `<Cell ss:StyleID="Body"><Data ss:Type="String">${escapeXml(valueFor(column, row))}</Data></Cell>`).join("")}</Row>`).join("");
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
  <Style ss:ID="Header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#2563EB" ss:Pattern="Solid"/><Alignment ss:WrapText="1" ss:Horizontal="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/></Borders></Style>
  <Style ss:ID="Body"><Alignment ss:WrapText="1"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D0D5DD"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D0D5DD"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D0D5DD"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D0D5DD"/></Borders></Style>
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
  const blob = new Blob(["\uFEFF", xml], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".xls") ? filename : `${filename}.xls`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}


export function printHtmlDocument({
  title = "Tiny POS",
  html = "",
  styles = "",
  page = "auto",
  fallbackClassName = "tiny-pos-html-print-root",
  preferCurrentWindow = false
}) {
  const fullDocument = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
*{box-sizing:border-box}html,body{margin:0;background:#fff;color:#111;font-family:"Noto Sans Khmer",Arial,sans-serif}${styles}
@page{size:${page};margin:6mm}
@media print{html,body{width:100%;overflow:visible!important}}
</style>
</head>
<body>${html}<script>window.addEventListener('load',function(){setTimeout(function(){window.focus();window.print()},300)});<\/script></body>
</html>`;

  const printWindow = (preferCurrentWindow || preferCurrentWindowPrint())
    ? null
    : window.open("", "_blank", "width=900,height=800");
  if (printWindow) {
    printWindow.document.open();
    printWindow.document.write(fullDocument);
    printWindow.document.close();
    return;
  }

  document.getElementById(fallbackClassName)?.remove();
  const root = document.createElement("section");
  root.id = fallbackClassName;
  root.className = fallbackClassName;
  root.innerHTML = `<style>${styles}</style>${html}`;
  document.body.appendChild(root);
  void root.offsetHeight;
  const cleanup = () => root.remove();
  window.addEventListener("afterprint", cleanup, { once: true });
  window.setTimeout(cleanup, 300000);
  window.print();
}
