import {
  ClipboardList,
  Download,
  Languages,
  Printer,
  ShoppingCart
} from "lucide-react";
import { useEffect, useState } from "react";
import Modal from "./Modal";
import { useLanguage } from "../context/LanguageContext";
import {
  money,
  stockNumber
} from "../lib/catalog";
import {
  effectiveQuoteStatus,
  quoteCanConvert,
  quoteDate,
  quoteDateTime,
  quoteStatusLabel
} from "../lib/quotes";

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadCsv(filename, rows) {
  const content = rows
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
  const blob = new Blob(["\uFEFF", content], {
    type: "text/csv;charset=utf-8"
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function QuotePrintModal({
  quote,
  shop,
  branch,
  onClose,
  onConvert,
  onCreateOrder,
  canCreateOrder = false,
  orderBusy = false
}) {
  const { language } = useLanguage();
  const [documentLanguage, setDocumentLanguage] = useState(
    language === "km" ? "km" : "en"
  );

  useEffect(() => {
    if (quote) setDocumentLanguage(language === "km" ? "km" : "en");
  }, [quote, language]);

  if (!quote) return null;

  const status = effectiveQuoteStatus(quote);
  const label = (english, khmer) =>
    documentLanguage === "km" ? khmer : english;
  const itemName = (item) =>
    documentLanguage === "km"
      ? item.products?.name_km || item.product_name
      : item.product_name;

  function exportQuote() {
    const rows = [
      [label("Quotation", "សម្រង់តម្លៃ"), quote.quote_number],
      [label("Customer", "អតិថិជន"), quote.customers?.name || label("Walk-in customer", "អតិថិជនទូទៅ")],
      [label("Branch", "សាខា"), branch?.name || ""],
      [label("Created", "កាលបរិច្ឆេទបង្កើត"), quoteDateTime(quote.created_at)],
      [label("Valid until", "មានសុពលភាពដល់"), quoteDate(quote.valid_until)],
      [],
      [
        "#",
        label("Product", "ផលិតផល"),
        label("Code", "កូដ"),
        label("Quantity", "បរិមាណ"),
        label("Unit price", "តម្លៃឯកតា"),
        label("Discount", "បញ្ចុះតម្លៃ"),
        label("Total", "សរុប")
      ],
      ...(quote.sales_quote_items || []).map((item, index) => [
        index + 1,
        itemName(item),
        item.sku || item.barcode || "",
        `${stockNumber(item.quantity)} ${item.sale_unit_name || ""}`,
        money(item.unit_price, quote.currency),
        money(item.discount_amount, quote.currency),
        money(item.line_total, quote.currency)
      ]),
      [],
      [label("Subtotal", "សរុបរង"), money(quote.subtotal, quote.currency)],
      [label("Discount", "បញ្ចុះតម្លៃ"), money(quote.discount_amount, quote.currency)],
      [label("Tax", "ពន្ធ"), money(quote.tax_amount, quote.currency)],
      [label("Quotation total", "សរុបសម្រង់តម្លៃ"), money(quote.total_amount, quote.currency)],
      [label("Notes", "កំណត់សម្គាល់"), quote.notes || ""],
      [label("Terms", "លក្ខខណ្ឌ"), quote.terms || ""]
    ];

    downloadCsv(`${quote.quote_number}-${documentLanguage}.csv`, rows);
  }

  return (
    <Modal
      title={quote.quote_number}
      onClose={onClose}
      wide
    >
      <div className="quote-print-wrapper">
        <div className="quote-language-toolbar" data-print-hide>
          <Languages size={18} />
          <button
            type="button"
            className={documentLanguage === "en" ? "active" : ""}
            onClick={() => setDocumentLanguage("en")}
          >
            English
          </button>
          <button
            type="button"
            className={documentLanguage === "km" ? "active" : ""}
            onClick={() => setDocumentLanguage("km")}
          >
            ខ្មែរ
          </button>
        </div>

        <article className="quote-print-document">
          <header className="quote-print-header">
            <div className="quote-print-shop">
              {shop?.shop_logo_url && (
                <img
                  src={shop.shop_logo_url}
                  alt=""
                />
              )}

              <div>
                <h2>
                  {shop?.shop_name || "Tiny POS"}
                </h2>

                {shop?.shop_address && (
                  <p>{shop.shop_address}</p>
                )}

                {shop?.shop_phone && (
                  <p>{shop.shop_phone}</p>
                )}

                {shop?.shop_email && (
                  <p>{shop.shop_email}</p>
                )}

                {shop?.tax_id && (
                  <p>{label("Tax ID", "លេខអត្តសញ្ញាណពន្ធ")}: {shop.tax_id}</p>
                )}
              </div>
            </div>

            <div className="quote-print-title">
              <strong>{label("QUOTATION", "សម្រង់តម្លៃ")}</strong>
              <span>{quote.quote_number}</span>
              <b className={`quote-status ${status}`}>
                {quoteStatusLabel(status)}
              </b>
            </div>
          </header>

          <section className="quote-print-parties">
            <div>
              <span>{label("Quoted to", "សម្រង់ជូន")}</span>
              <strong>
                {quote.customers?.name
                  || label("Walk-in customer", "អតិថិជនទូទៅ")}
              </strong>

              {quote.customers?.customer_code && (
                <p>{quote.customers.customer_code}</p>
              )}

              {quote.customers?.company_name && (
                <p>{quote.customers.company_name}</p>
              )}

              {quote.customers?.phone && (
                <p>{quote.customers.phone}</p>
              )}

              {quote.customers?.email && (
                <p>{quote.customers.email}</p>
              )}

              {quote.customers?.address && (
                <p>{quote.customers.address}</p>
              )}
            </div>

            <div>
              <div>
                <span>{label("Branch", "សាខា")}</span>
                <strong>{branch?.name || label("Current branch", "សាខាបច្ចុប្បន្ន")}</strong>
              </div>

              <div>
                <span>{label("Created", "កាលបរិច្ឆេទបង្កើត")}</span>
                <strong>{quoteDateTime(quote.created_at)}</strong>
              </div>

              <div>
                <span>{label("Valid until", "មានសុពលភាពដល់")}</span>
                <strong>{quoteDate(quote.valid_until)}</strong>
              </div>

              <div>
                <span>{label("Currency", "រូបិយប័ណ្ណ")}</span>
                <strong>{quote.currency}</strong>
              </div>

              {quote.price_list_name && (
                <div>
                  <span>{label("Price list", "បញ្ជីតម្លៃ")}</span>
                  <strong>{quote.price_list_name}</strong>
                </div>
              )}
            </div>
          </section>

          <table className="quote-print-table">
            <thead>
              <tr>
                <th>#</th>
                <th>{label("Product", "ផលិតផល")}</th>
                <th>{label("Code", "កូដ")}</th>
                <th>{label("Quantity", "បរិមាណ")}</th>
                <th>{label("Unit price", "តម្លៃឯកតា")}</th>
                <th>{label("Discount", "បញ្ចុះតម្លៃ")}</th>
                <th>{label("Total", "សរុប")}</th>
              </tr>
            </thead>

            <tbody>
              {(quote.sales_quote_items || []).map((item, index) => (
                <tr key={item.id}>
                  <td>{index + 1}</td>
                  <td>
                    <strong>{itemName(item)}</strong>
                    {documentLanguage === "km"
                      && item.products?.name_km
                      && item.products.name_km !== item.product_name && (
                      <small>{item.product_name}</small>
                    )}
                  </td>
                  <td>{item.sku || item.barcode || "—"}</td>
                  <td>{stockNumber(item.quantity)} {item.sale_unit_name}</td>
                  <td>{money(item.unit_price, quote.currency)}</td>
                  <td>{money(item.discount_amount, quote.currency)}</td>
                  <td>{money(item.line_total, quote.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <section className="quote-print-bottom">
            <div className="quote-print-notes">
              {quote.notes && (
                <p><strong>{label("Note", "កំណត់សម្គាល់")}:</strong> {quote.notes}</p>
              )}
              {quote.terms && (
                <p><strong>{label("Terms", "លក្ខខណ្ឌ")}:</strong> {quote.terms}</p>
              )}
              {quote.cancel_reason && (
                <p><strong>{label("Cancellation", "ការលុបចោល")}:</strong> {quote.cancel_reason}</p>
              )}
            </div>

            <div className="quote-print-totals">
              <div>
                <span>{label("Subtotal", "សរុបរង")}</span>
                <strong>{money(quote.subtotal, quote.currency)}</strong>
              </div>
              <div>
                <span>
                  {quote.coupon_code
                    ? `${label("Coupon", "គូប៉ុង")} ${quote.coupon_code}`
                    : label("Discount", "បញ្ចុះតម្លៃ")}
                </span>
                <strong>-{money(quote.discount_amount, quote.currency)}</strong>
              </div>
              <div>
                <span>{label("Tax", "ពន្ធ")}</span>
                <strong>{money(quote.tax_amount, quote.currency)}</strong>
              </div>
              <div className="quote-print-grand">
                <span>{label("Quotation total", "សរុបសម្រង់តម្លៃ")}</span>
                <strong>{money(quote.total_amount, quote.currency)}</strong>
              </div>
            </div>
          </section>

          <footer className="quote-print-footer">
            <p>
              {label(
                "This quotation does not reserve stock and is not a tax invoice or payment receipt.",
                "សម្រង់តម្លៃនេះមិនកក់ស្តុក និងមិនមែនជាវិក្កយបត្រពន្ធ ឬបង្កាន់ដៃទូទាត់ទេ។"
              )}
            </p>
            <div>
              <span>{label("Prepared by", "រៀបចំដោយ")}</span>
              <span>{label("Customer approval", "ការយល់ព្រមរបស់អតិថិជន")}</span>
            </div>
          </footer>
        </article>

        <div className="quote-print-actions" data-print-hide>
          <button type="button" className="secondary-button" onClick={onClose}>
            {label("Close", "បិទ")}
          </button>

          <button type="button" className="secondary-button" onClick={exportQuote}>
            <Download size={18} />
            {label("Export CSV", "នាំចេញ CSV")}
          </button>

          <button type="button" className="secondary-button" onClick={() => window.print()}>
            <Printer size={18} />
            {label("Print quotation", "បោះពុម្ពសម្រង់តម្លៃ")}
          </button>

          {canCreateOrder && quoteCanConvert(quote) && (
            <button
              type="button"
              className="secondary-button"
              onClick={() => onCreateOrder(quote)}
              disabled={orderBusy || !quote.customer_id}
              title={
                quote.customer_id
                  ? "Create a reservable sales order"
                  : "Choose a customer before creating a sales order"
              }
            >
              <ClipboardList size={18} />
              {orderBusy
                ? label("Creating order...", "កំពុងបង្កើតបញ្ជាទិញ...")
                : label("Create Sales Order", "បង្កើតបញ្ជាទិញលក់")}
            </button>
          )}

          {quoteCanConvert(quote) && (
            <button
              type="button"
              className="primary-button"
              onClick={() => onConvert(quote)}
            >
              <ShoppingCart size={18} />
              {label("Open in New Sale", "បើកក្នុងការលក់ថ្មី")}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
