import { Languages, Printer } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Modal from "./Modal";
import ProductBarcode from "./ProductBarcode";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { money, stockNumber } from "../lib/catalog";

function dateTime(value, locale = "en-US") {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function dateOnly(value, locale = "en-US") {
  if (!value) return "—";

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium"
  }).format(
    new Date(`${String(value).slice(0, 10)}T00:00:00`)
  );
}

export default function ReceiptModal({ receipt, onClose }) {
  const { shop } = useAuth();
  const { language } = useLanguage();
  const [receiptLanguage, setReceiptLanguage] = useState(language === "km" ? "km" : "en");
  const receiptPrintRef = useRef(null);

  useEffect(() => {
    if (receipt) setReceiptLanguage(language === "km" ? "km" : "en");
  }, [receipt, language]);

  const label = (english, khmer) => receiptLanguage === "km" ? khmer : english;
  const locale = receiptLanguage === "km" ? "km-KH" : "en-US";

  if (!receipt) return null;

  const receiptWidth = Number(shop?.receipt_width_mm || 80);
  const showLogo = shop?.receipt_show_logo !== false;
  const showAddress = shop?.receipt_show_address !== false;
  const showPhone = shop?.receipt_show_phone !== false;
  const showCustomer = shop?.receipt_show_customer !== false;
  const showCashier = shop?.receipt_show_cashier !== false;
  const showBarcode = shop?.receipt_show_barcode !== false;
  const exchangeRate = Math.max(0.0001, Number(
    receipt.exchangeRate
    || shop?.usd_to_khr_rate
    || 4100
  ));
  const alternateCurrency = receipt.currency === "USD" ? "KHR" : "USD";
  const alternateTotal = receipt.currency === "USD"
    ? Number(receipt.totalAmount || 0) * exchangeRate
    : Number(receipt.totalAmount || 0) / exchangeRate;
  const paymentRows = Array.isArray(receipt.payments)
    ? receipt.payments
    : [];
  const paymentMethod = String(
    receipt.paymentMethod
    || (paymentRows.length > 1 ? "split" : paymentRows[0]?.method)
    || "other"
  );

  function printReceipt() {
    const printable = receiptPrintRef.current;

    if (!printable) {
      window.print();
      return;
    }

    const printWindow = window.open("", "_blank", "noopener,noreferrer,width=440,height=900");

    if (!printWindow) {
      window.print();
      return;
    }

    const title = `${shop?.shop_name || receipt.shopName || "Tiny POS"} Receipt`;
    const content = printable.innerHTML;

    printWindow.document.open();
    printWindow.document.write(`<!doctype html>
<html lang="${receiptLanguage === "km" ? "km" : "en"}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      :root { color-scheme: light; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 12mm;
        background: #fff;
        color: #111;
        font-family: "Noto Sans Khmer", Arial, sans-serif;
      }
      .print-shell {
        width: min(100%, ${receiptWidth}mm);
        margin: 0 auto;
      }
      .receipt-document {
        width: 100%;
        margin: 0 auto;
        padding: 0;
        color: #111;
        font-family: "Noto Sans Khmer", Arial, sans-serif;
        font-size: 12px;
      }
      .receipt-shop {
        text-align: center;
        border-bottom: 1px dashed #555;
        padding-bottom: 10px;
      }
      .receipt-logo {
        display: block;
        max-width: 86px;
        max-height: 62px;
        object-fit: contain;
        margin: 0 auto 7px;
      }
      .receipt-shop h2 { margin: 0 0 5px; font-size: 22px; }
      .receipt-shop p { margin: 2px 0; }
      .receipt-meta,
      .receipt-totals { display: grid; gap: 5px; padding: 10px 0; border-bottom: 1px dashed #555; }
      .receipt-meta > div,
      .receipt-totals > div,
      .receipt-payment-part { display: flex; justify-content: space-between; gap: 12px; }
      .receipt-lines { display: grid; }
      .receipt-lines > div { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px dotted #aaa; }
      .receipt-lines > div > span,
      .receipt-payment-part > span { display: grid; gap: 3px; }
      .receipt-lines small,
      .receipt-payment-part small,
      .receipt-grand-total small,
      .receipt-invoice-barcode small { color: #555; }
      .receipt-grand-total {
        display: grid !important;
        grid-template-columns: 1fr auto;
        align-items: end;
        font-size: 16px;
        padding-top: 6px;
      }
      .receipt-grand-total small { grid-column: 1 / -1; text-align: right; font-size: 10px; }
      .receipt-payment-parts { display: grid !important; gap: 0 !important; border-top: 1px dotted #aaa; }
      .receipt-payment-part { padding: 6px 0; border-bottom: 1px dotted #aaa; }
      .receipt-footer { text-align: center; padding-top: 12px; }
      .receipt-invoice-barcode { display: grid; place-items: center; gap: 3px; padding: 8px 0; border-bottom: 1px dashed #555; color: #000; }
      .receipt-invoice-barcode svg, .generated-barcode { max-width: 100%; height: auto; }
      @page {
        size: auto;
        margin: 10mm;
      }
      @media print {
        body { padding: 0; }
      }
    </style>
  </head>
  <body>
    <div class="print-shell">${content}</div>
    <script>
      window.addEventListener('load', function () {
        setTimeout(function () {
          window.focus();
          window.print();
        }, 250);
      });
    <\/script>
  </body>
</html>`);
    printWindow.document.close();
  }

  return (
    <Modal title={receipt.offlinePending ? label("Offline receipt saved", "បានរក្សាទុកវិក្កយបត្រក្រៅបណ្តាញ") : label("Sale completed", "ការលក់បានបញ្ចប់")} onClose={onClose}>
      <div className="receipt-wrapper">
        {receipt.offlinePending && (
          <div className="notice warning offline-receipt-notice">
            Pending synchronization. This local receipt becomes a final invoice only after the server accepts it.
          </div>
        )}
        <div className="receipt-language-toolbar" data-print-hide>
          <Languages size={18} />
          <button type="button" className={receiptLanguage === "en" ? "active" : ""} onClick={() => setReceiptLanguage("en")}>English</button>
          <button type="button" className={receiptLanguage === "km" ? "active" : ""} onClick={() => setReceiptLanguage("km")}>ខ្មែរ</button>
        </div>
        <div ref={receiptPrintRef}>
          <article
            className="receipt-document"
            style={{ "--receipt-width": `${receiptWidth}mm` }}
          >
            <div className="receipt-shop">
              {showLogo && shop?.shop_logo_url && (
                <img className="receipt-logo" src={shop.shop_logo_url} alt="" />
              )}
              <h2>{shop?.shop_name || receipt.shopName}</h2>
              {shop?.receipt_header && <p>{shop.receipt_header}</p>}
              {showAddress && (shop?.shop_address || receipt.shopAddress) && (
                <p>{shop?.shop_address || receipt.shopAddress}</p>
              )}
              {showPhone && (shop?.shop_phone || receipt.shopPhone) && (
                <p>{shop?.shop_phone || receipt.shopPhone}</p>
              )}
              {showPhone && shop?.shop_email && <p>{shop.shop_email}</p>}
              {shop?.tax_id && <p>{label("Tax ID", "លេខអត្តសញ្ញាណពន្ធ")}: {shop.tax_id}</p>}
            </div>

            <div className="receipt-meta">
              <div><span>{label("Invoice", "វិក្កយបត្រ")}</span><strong>{receipt.invoiceNumber}</strong></div>
              {receipt.sourceQuoteNumber && (
                <div>
                  <span>{label("Quotation", "សម្រង់តម្លៃ")}</span>
                  <strong>{receipt.sourceQuoteNumber}</strong>
                </div>
              )}
              {receipt.sourceSalesOrderNumber && (
                <div>
                  <span>{label("Sales Order", "បញ្ជាទិញលក់")}</span>
                  <strong>{receipt.sourceSalesOrderNumber}</strong>
                </div>
              )}
              {receipt.sourceDeliveryNumber && (
                <div>
                  <span>{label("Delivery Note", "ប័ណ្ណប្រគល់ទំនិញ")}</span>
                  <strong>{receipt.sourceDeliveryNumber}</strong>
                </div>
              )}
              <div><span>{label("Date", "កាលបរិច្ឆេទ")}</span><strong>{dateTime(receipt.completedAt, locale)}</strong></div>
              {receipt.saleStatus && receipt.saleStatus !== "completed" && (
                <div>
                  <span>{label("Status", "ស្ថានភាព")}</span>
                  <strong>
                    {String(receipt.saleStatus)
                      .replaceAll("_", " ")
                      .toUpperCase()}
                  </strong>
                </div>
              )}
              {showCashier && (
                <div><span>{label("Cashier", "អ្នកគិតលុយ")}</span><strong>{receipt.cashierName}</strong></div>
              )}
              {showCustomer && (
                <div>
                  <span>{label("Customer", "អតិថិជន")}</span>
                  <strong>{receipt.customerName || label("Walk-in", "អតិថិជនទូទៅ")}</strong>
                </div>
              )}
              {showCustomer && receipt.customerName && (
                <div>
                  <span>{label("Customer profile", "ប្រភេទអតិថិជន")}</span>
                  <strong>
                    {[receipt.customerCode, receipt.customerType]
                      .filter(Boolean)
                      .join(" · ")}
                  </strong>
                </div>
              )}
              {receipt.priceListName && (
                <div>
                  <span>{label("Price list", "បញ្ជីតម្លៃ")}</span>
                  <strong>{receipt.priceListName}</strong>
                </div>
              )}
            </div>

            {showBarcode && (
              <div className="receipt-invoice-barcode">
                <ProductBarcode
                  value={receipt.invoiceNumber}
                  format="CODE128"
                  height={28}
                  width={1.15}
                />
                <small>{receipt.invoiceNumber}</small>
              </div>
            )}

            <div className="receipt-lines">
              {receipt.cart.map((item) => (
                <div key={item.id}>
                  <span>
                    <strong>
                      {receiptLanguage === "km"
                        ? item.name_km || item.name
                        : item.name}
                    </strong>
                    {receiptLanguage === "km"
                      && item.name_km
                      && item.name_km !== item.name && (
                      <small>{item.name}</small>
                    )}
                    <small>
                      {stockNumber(item.quantity)}{" "}
                      {item.selected_unit_name || item.sale_unit_name || item.unit_name}
                      {" × "}
                      {money(item.selected_unit_price ?? item.selling_price, item.currency)}
                    </small>
                  </span>
                  <strong>
                    {money(
                      Number(item.quantity) * Number(item.selected_unit_price ?? item.selling_price),
                      item.currency
                    )}
                  </strong>
                </div>
              ))}
            </div>

            <div className="receipt-totals">
              <div><span>{label("Subtotal", "សរុបរង")}</span><strong>{money(receipt.subtotal, receipt.currency)}</strong></div>
              {Number(receipt.priceAdjustmentAmount || 0) !== 0 && (
                <div>
                  <span>
                    {Number(receipt.priceAdjustmentAmount) > 0
                      ? label("Price-list savings", "សន្សំពីបញ្ជីតម្លៃ")
                      : label("Price-list markup", "តម្លៃបន្ថែមពីបញ្ជីតម្លៃ")}
                  </span>
                  <strong>
                    {Number(receipt.priceAdjustmentAmount) > 0 ? "-" : "+"}
                    {money(
                      Math.abs(Number(receipt.priceAdjustmentAmount)),
                      receipt.currency
                    )}
                  </strong>
                </div>
              )}
              <div><span>{label("Discount", "បញ្ចុះតម្លៃ")}</span><strong>-{money(receipt.discountAmount, receipt.currency)}</strong></div>
              {Number(receipt.taxAmount) > 0 && (
                <div><span>{label("Tax", "ពន្ធ")}</span><strong>{money(receipt.taxAmount, receipt.currency)}</strong></div>
              )}
              <div className="receipt-grand-total">
                <span>{label("Total", "សរុប")}</span>
                <strong>{money(receipt.totalAmount, receipt.currency)}</strong>
                <small>≈ {money(alternateTotal, alternateCurrency)}</small>
              </div>
              {Number(receipt.refundedAmount || 0) > 0 && (
                <>
                  <div>
                    <span>{label("Refunded", "បានសងប្រាក់")}</span>
                    <strong>
                      -{money(receipt.refundedAmount, receipt.currency)}
                    </strong>
                  </div>
                  <div>
                    <span>{label("Net after refunds", "សរុបក្រោយសងប្រាក់")}</span>
                    <strong>
                      {money(
                        receipt.netTotal
                        ?? Number(receipt.totalAmount || 0)
                          - Number(receipt.refundedAmount || 0),
                        receipt.currency
                      )}
                    </strong>
                  </div>
                </>
              )}
              <div><span>{label("Payment", "ការទូទាត់")}</span><strong>{paymentMethod.toUpperCase()}</strong></div>
              {paymentMethod === "credit" ? (
                <>
                  <div>
                    <span>{label("Paid now", "បានបង់ឥឡូវ")}</span>
                    <strong>{money(0, receipt.currency)}</strong>
                  </div>
                  <div>
                    <span>{label("Credit due date", "ថ្ងៃផុតកំណត់ឥណទាន")}</span>
                    <strong>{dateOnly(receipt.creditDueDate, locale)}</strong>
                  </div>
                  {receipt.creditOutstanding !== null
                    && receipt.creditOutstanding !== undefined && (
                    <div>
                      <span>{label("Invoice outstanding", "ប្រាក់នៅសល់លើវិក្កយបត្រ")}</span>
                      <strong>{money(receipt.creditOutstanding, receipt.currency)}</strong>
                    </div>
                  )}
                  <div>
                    <span>
                      {receipt.creditBalanceAfter !== null
                        && receipt.creditBalanceAfter !== undefined
                        ? label("Customer account balance", "សមតុល្យគណនីអតិថិជន")
                        : label("Invoice credit amount", "ចំនួនឥណទានវិក្កយបត្រ")}
                    </span>
                    <strong>
                      {money(
                        receipt.creditBalanceAfter
                        ?? receipt.creditAmount
                        ?? receipt.totalAmount,
                        receipt.currency
                      )}
                    </strong>
                  </div>
                </>
              ) : paymentRows.length ? (
                <div className="receipt-payment-parts">
                  {paymentRows.map((payment, index) => {
                    const tenderCurrency = payment.tender_currency
                      || payment.currency
                      || receipt.currency;
                    const tenderAmount = Number(
                      payment.tender_amount
                      ?? payment.amount_received
                      ?? payment.settlement_amount
                      ?? 0
                    );
                    const change = Number(
                      payment.change_amount
                      ?? payment.tender_change_amount
                      ?? 0
                    );
                    return (
                      <div className="receipt-payment-part" key={`${payment.method || "payment"}-${index}`}>
                        <span>
                          <strong>{String(payment.method || "other").toUpperCase()}</strong>
                          {payment.reference_number && <small>{payment.reference_number}</small>}
                        </span>
                        <span>
                          <strong>{money(tenderAmount, tenderCurrency)}</strong>
                          {payment.settlement_amount !== undefined
                            && tenderCurrency !== receipt.currency && (
                            <small>={money(payment.settlement_amount, receipt.currency)}</small>
                          )}
                          {change > 0 && (
                            <small>{label("Change", "ប្រាក់អាប់")}: {money(change, tenderCurrency)}</small>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <>
                  <div><span>{label("Received", "ប្រាក់ទទួល")}</span><strong>{money(receipt.amountReceived, receipt.currency)}</strong></div>
                  <div><span>{label("Change", "ប្រាក់អាប់")}</span><strong>{money(receipt.changeAmount, receipt.currency)}</strong></div>
                </>
              )}
            </div>

            <div className="receipt-footer">
              {shop?.receipt_footer || receipt.footer || label("Thank you for your purchase.", "សូមអរគុណសម្រាប់ការទិញ។")}
            </div>
          </article>
        </div>

        <div className="receipt-actions">
          <button type="button" className="secondary-button" onClick={onClose}>{label("Close", "បិទ")}</button>
          <button type="button" className="primary-button" onClick={printReceipt}>
            <Printer size={18} /> {label("Print receipt", "បោះពុម្ពវិក្កយបត្រ")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
