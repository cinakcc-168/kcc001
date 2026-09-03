import { FileText, Languages, Printer, Receipt, SlidersHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Modal from "./Modal";
import ProductBarcode from "./ProductBarcode";
import SaleInvoiceDocument from "./SaleInvoiceDocument";
import { useAuth } from "../context/AuthContext";
import { money, stockNumber } from "../lib/catalog";
import { printElementDocument } from "../lib/listDocuments";

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

function getProductPromotionLabel(item, currency = "USD") {
  const promo = item.active_promotion || item.promotion || item.promo;
  if (promo) {
    const type = String(promo.discount_type || promo.type || "").toLowerCase();
    const val = Number(promo.discount_value || promo.discount_amount || promo.value || promo.amount || 0);
    if (type === "percent" && val > 0) {
      return `PRO -${val}%`;
    }
    if ((type === "fixed" || type === "amount") && val > 0) {
      return `PRO -${money(val, currency)}`;
    }
  }

  const promoDiscount = Number(item.promotion_discount_amount || 0);
  const qty = Number(item.quantity || 1);
  if (promoDiscount > 0 && qty > 0) {
    if (item.promotion_discount_type === "percent" && item.promotion_discount_value > 0) {
      return `PRO -${item.promotion_discount_value}%`;
    }
    const unitDiscount = promoDiscount / qty;
    return `PRO -${money(unitDiscount, currency)}`;
  }

  const stdPrice = Number(item.standard_unit_price ?? item.list_price ?? 0);
  const sellingPrice = Number(item.selected_unit_price ?? item.unit_price ?? item.selling_price ?? 0);
  if (stdPrice > sellingPrice && sellingPrice > 0) {
    const unitDiscount = stdPrice - sellingPrice;
    const pct = Math.round((unitDiscount / stdPrice) * 100);
    if (Math.abs((unitDiscount / stdPrice) * 100 - pct) < 0.1 && pct > 0) {
      return `PRO -${pct}%`;
    }
    return `PRO -${money(unitDiscount, currency)}`;
  }

  return null;
}

export default function ReceiptModal({ receipt, onClose }) {
  const { shop } = useAuth();
  const defaultReceiptLanguage = shop?.receipt_default_language === "km" ? "km" : "en";
  const isAskChoiceSetting = shop?.sale_document_type === "inline"
    || shop?.sale_document_type === "choice"
    || shop?.sale_document_type === "ask";

  const getInitialDocType = () => {
    if (isAskChoiceSetting) return null;
    return shop?.sale_document_type === "invoice" ? "invoice" : "receipt";
  };

  const [docType, setDocType] = useState(getInitialDocType);
  const [receiptLanguage, setReceiptLanguage] = useState(defaultReceiptLanguage);
  const receiptPrintRef = useRef(null);

  useEffect(() => {
    if (receipt) {
      setReceiptLanguage(defaultReceiptLanguage);
      const isAskChoice = shop?.sale_document_type === "inline"
        || shop?.sale_document_type === "choice"
        || shop?.sale_document_type === "ask";
      setDocType(isAskChoice ? null : (shop?.sale_document_type === "invoice" ? "invoice" : "receipt"));
    }
  }, [receipt, defaultReceiptLanguage, shop?.sale_document_type]);

  const label = (english, khmer) => receiptLanguage === "km" ? khmer : english;
  const locale = receiptLanguage === "km" ? "km-KH" : "en-US";

  if (!receipt) return null;

  const receiptWidth = Number(shop?.receipt_width_mm || 80);
  const isInvoice = docType === "invoice";
  const invoicePaperSize = shop?.invoice_paper_size === "A4" ? "A4" : "A5";
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

  const isKhmer = receiptLanguage === "km";

  const explicitPromo = Number(receipt.promotionDiscountAmount || receipt.promotion_discount_amount || 0);
  const cartItemPromoSum = (receipt.cart || []).reduce((sum, item) => {
    const promoDiscount = Number(item.promotion_discount_amount || 0);
    if (promoDiscount > 0) return sum + promoDiscount;

    const qty = Number(item.quantity || 0);
    const sellingPrice = Number(item.selected_unit_price ?? item.selling_price ?? item.unit_price ?? 0);
    const stdPrice = Number(item.standard_unit_price ?? item.list_price ?? 0);
    if (stdPrice > sellingPrice && sellingPrice > 0) {
      return sum + ((stdPrice - sellingPrice) * qty);
    }

    if (item.active_promotion || item.promotion) {
      const normal = Number(item.standard_unit_price ?? item.list_price ?? sellingPrice);
      return sum + Math.max(0, normal - sellingPrice) * qty;
    }
    return sum;
  }, 0);

  const totalPromotionDiscount = Math.max(explicitPromo, cartItemPromoSum);

  const calculatedGrossSubtotal = (receipt.cart || []).reduce((sum, item) => {
    const qty = Number(item.quantity || 0);
    const promoDiscount = Number(item.promotion_discount_amount || 0);
    const sellingPrice = Number(item.selected_unit_price ?? item.selling_price ?? item.unit_price ?? 0);
    const stdPrice = Number(
      item.standard_unit_price
      ?? item.list_price
      ?? (promoDiscount > 0 && qty > 0 ? sellingPrice + (promoDiscount / qty) : sellingPrice)
    );
    return sum + (qty * stdPrice);
  }, 0);

  const subtotalDisplay = calculatedGrossSubtotal > 0
    ? calculatedGrossSubtotal
    : Number(receipt.subtotal || 0) + totalPromotionDiscount;

  const totalTax = Number(receipt.taxAmount || receipt.tax_amount || 0);
  const totalAmount = Number(receipt.totalAmount || receipt.total_amount || 0);

  const genericDiscount = Math.max(
    0,
    Math.round((subtotalDisplay - totalPromotionDiscount + totalTax - totalAmount + Number.EPSILON) * 100) / 100
  );
  const receiptShopName = isKhmer
    ? shop?.shop_name_km || shop?.shop_name || receipt.shopName || "Tiny POS"
    : shop?.shop_name || receipt.shopName || "Tiny POS";
  const receiptHeader = isKhmer
    ? shop?.receipt_header_km || ""
    : shop?.receipt_header || "";
  const receiptAddress = isKhmer
    ? shop?.shop_address_km || shop?.shop_address || receipt.shopAddress || ""
    : shop?.shop_address || receipt.shopAddress || "";
  const receiptFooter = isKhmer
    ? shop?.receipt_footer_km || "សូមអរគុណសម្រាប់ការទិញ។"
    : shop?.receipt_footer || receipt.footer || "Thank you for your purchase.";
  const logoPosition = shop?.receipt_logo_position === "above" ? "above" : "inline";

  const statusText = (value) => {
    const normalized = String(value || "").toLowerCase();
    if (!isKhmer) return normalized.replaceAll("_", " ").toUpperCase();
    return ({
      completed: "បានបញ្ចប់",
      partially_refunded: "សងប្រាក់មួយផ្នែក",
      refunded: "បានសងប្រាក់",
      voided: "បានលុបចោល",
      pending: "កំពុងរង់ចាំ"
    })[normalized] || normalized.replaceAll("_", " ");
  };

  const paymentText = (value) => {
    const normalized = String(value || "other").toLowerCase();
    if (!isKhmer) return normalized.toUpperCase();
    return ({
      cash: "សាច់ប្រាក់",
      bank: "ធនាគារ",
      khqr: "KHQR",
      card: "កាត",
      credit: "ឥណទាន",
      split: "ចម្រុះ",
      other: "ផ្សេងៗ"
    })[normalized] || normalized;
  };

  function printReceipt() {
    if (!docType) return;
    const printable = receiptPrintRef.current;
    if (!printable) return;

    const documentLabel = isInvoice
      ? label("Invoice", "វិក្កយបត្រ")
      : label("Receipt", "បង្កាន់ដៃ");
    const title = `${receiptShopName} ${documentLabel}`;
    const page = isInvoice
      ? `${invoicePaperSize} portrait`
      : "auto";

    printElementDocument({
      title,
      element: printable,
      page,
      includeAppStyles: true,
      styles: isInvoice ? `
        .tiny-pos-print-frame-content{width:100%!important;max-width:100%!important;margin:0 auto!important;padding:0!important}
        .sale-invoice-document{width:100%!important;max-width:100%!important;margin:0 auto!important;padding:0!important;box-shadow:none!important;border:0!important;background:#fff!important;color:#111!important}
        .sale-invoice-table{width:100%!important;table-layout:fixed!important;border-collapse:collapse!important}
        .sale-invoice-table th,.sale-invoice-table td{white-space:normal!important;overflow-wrap:anywhere!important;border:1px solid #a1a1aa!important;padding:4px 3px!important;vertical-align:middle!important}
        .sale-invoice-table.has-code-pic col.invoice-col-no,.sale-invoice-table.has-code-pic th.invoice-col-no{width:6%!important}
        .sale-invoice-table.has-code-pic col.invoice-col-code-pic,.sale-invoice-table.has-code-pic th.invoice-col-code-pic{width:16%!important}
        .sale-invoice-table.has-code-pic col.invoice-col-desc,.sale-invoice-table.has-code-pic th.invoice-col-desc{width:40%!important}
        .sale-invoice-table.has-code-pic col.invoice-col-qty,.sale-invoice-table.has-code-pic th.invoice-col-qty{width:8%!important}
        .sale-invoice-table.has-code-pic col.invoice-col-unit,.sale-invoice-table.has-code-pic th.invoice-col-unit{width:8%!important}
        .sale-invoice-table.has-code-pic col.invoice-col-unit-price,.sale-invoice-table.has-code-pic th.invoice-col-unit-price{width:11%!important}
        .sale-invoice-table.has-code-pic col.invoice-col-amount,.sale-invoice-table.has-code-pic th.invoice-col-amount{width:11%!important}
        .sale-invoice-table.no-code-pic col.invoice-col-no,.sale-invoice-table.no-code-pic th.invoice-col-no{width:6%!important}
        .sale-invoice-table.no-code-pic col.invoice-col-desc,.sale-invoice-table.no-code-pic th.invoice-col-desc{width:56%!important}
        .sale-invoice-table.no-code-pic col.invoice-col-qty,.sale-invoice-table.no-code-pic th.invoice-col-qty{width:9%!important}
        .sale-invoice-table.no-code-pic col.invoice-col-unit,.sale-invoice-table.no-code-pic th.invoice-col-unit{width:9%!important}
        .sale-invoice-table.no-code-pic col.invoice-col-unit-price,.sale-invoice-table.no-code-pic th.invoice-col-unit-price{width:10%!important}
        .sale-invoice-table.no-code-pic col.invoice-col-amount,.sale-invoice-table.no-code-pic th.invoice-col-amount{width:10%!important}
        .invoice-code-pic-cell{display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:space-between!important;width:100%!important;max-width:54px!important;aspect-ratio:1/1!important;margin:0 auto!important;padding:1px!important;box-sizing:border-box!important;overflow:hidden!important}
        .invoice-code-part{flex:0 0 20%!important;height:20%!important;max-height:20%!important;width:100%!important;display:flex!important;align-items:center!important;justify-content:center!important;overflow:hidden!important}
        .invoice-product-code-text{display:block!important;width:100%!important;max-width:100%!important;overflow-wrap:anywhere!important;word-break:break-all!important;font-size:7pt!important;line-height:1.1!important;font-weight:700!important;text-align:center!important}
        .invoice-image-part{flex:0 0 80%!important;height:80%!important;max-height:80%!important;width:100%!important;display:flex!important;align-items:center!important;justify-content:center!important;overflow:hidden!important;padding-top:1px!important}
        .invoice-product-img{max-width:100%!important;max-height:100%!important;width:auto!important;height:auto!important;object-fit:contain!important;border:1px solid #d4d4d8!important;border-radius:2px!important;background:#fff!important;display:block!important}
        .invoice-product-img-empty{width:100%!important;height:100%!important;display:flex!important;align-items:center!important;justify-content:center!important;background:#fafafa!important;border:1px dashed #d4d4d8!important;border-radius:2px!important}
        .invoice-empty-dash{color:#a1a1aa!important;font-size:7pt!important}
        .receipt-language-toolbar,.receipt-doc-toolbar,.receipt-actions,[data-print-hide]{display:none!important}
        @page{size:${invoicePaperSize} portrait;margin:${invoicePaperSize === "A4" ? "8mm" : "7mm"}}
      ` : `
        .tiny-pos-print-frame-content{width:min(100%,${receiptWidth}mm)!important;margin:0 auto!important;padding:0!important}
        .receipt-document{width:100%!important;max-width:${receiptWidth}mm!important;margin:0 auto!important;padding:0!important;box-shadow:none!important;background:#fff!important;color:#111!important}
        .receipt-wrapper{padding:0!important}.receipt-language-toolbar,.receipt-doc-toolbar,.receipt-actions,[data-print-hide]{display:none!important}
        .receipt-shop,.receipt-meta,.receipt-lines,.receipt-totals,.receipt-footer,.receipt-invoice-barcode{break-inside:avoid}
        .receipt-logo{max-width:86px!important;max-height:62px!important;object-fit:contain!important}
        @page{margin:4mm}
      `
    });
  }

  return (
    <Modal
      title={receipt.offlinePending ? label("Offline receipt saved", "បានរក្សាទុកបង្កាន់ដៃក្រៅបណ្តាញ") : label("Sale completed", "ការលក់បានបញ្ចប់")}
      onClose={onClose}
      wide={isInvoice || !docType}
      className={`receipt-modal no-translate ${isInvoice ? "sale-invoice-modal" : ""}`}
    >
      <div className="receipt-wrapper">
        {receipt.offlinePending && (
          <div className="notice warning offline-receipt-notice">
            Pending synchronization. This local receipt becomes a final invoice only after the server accepts it.
          </div>
        )}
        <div className="receipt-modal-header-tools" data-print-hide>
          <div className="receipt-doc-toggle-group">
            <button
              type="button"
              className={`receipt-doc-toggle-btn ${docType === "receipt" ? "active" : ""}`}
              onClick={() => setDocType("receipt")}
            >
              <Receipt size={15} />
              <span>{label("Receipt (80mm)", "បង្កាន់ដៃ (80mm)")}</span>
            </button>
            <button
              type="button"
              className={`receipt-doc-toggle-btn ${docType === "invoice" ? "active" : ""}`}
              onClick={() => setDocType("invoice")}
            >
              <FileText size={15} />
              <span>{label(`Invoice (${invoicePaperSize})`, `វិក្កយបត្រ (${invoicePaperSize})`)}</span>
            </button>
          </div>

          <div className="receipt-language-toolbar">
            <Languages size={16} />
            <button type="button" className={receiptLanguage === "en" ? "active" : ""} onClick={() => setReceiptLanguage("en")}>English</button>
            <button type="button" className={receiptLanguage === "km" ? "active" : ""} onClick={() => setReceiptLanguage("km")}>ខ្មែរ</button>
          </div>
        </div>

        <div ref={receiptPrintRef}>
          {!docType ? (
            <div className="receipt-doc-choice-prompt">
              <div className="receipt-doc-choice-header">
                <SlidersHorizontal size={28} className="receipt-doc-choice-icon" />
                <div>
                  <h3>{label("Choose Document Format", "ជ្រើសរើសប្រភេទឯកសារ")}</h3>
                  <p>
                    {label(
                      "Please select whether to view and print a Receipt or an Invoice for this sale:",
                      "សូមជ្រើសរើសរវាងបង្កាន់ដៃ ឬវិក្កយបត្រសម្រាប់កា​រលក់នេះ៖"
                    )}
                  </p>
                </div>
              </div>

              <div className="receipt-doc-choice-grid">
                <button
                  type="button"
                  className="receipt-doc-choice-card"
                  onClick={() => setDocType("receipt")}
                >
                  <div className="receipt-doc-choice-card-icon">
                    <Receipt size={32} />
                  </div>
                  <div className="receipt-doc-choice-card-text">
                    <strong>{label("Receipt (80mm)", "បង្កាន់ដៃ (80mm)")}</strong>
                    <small>{label("Standard thermal receipt roll for POS printer", "ក្រដាសបង្កាន់ដៃ POS 80mm")}</small>
                  </div>
                </button>

                <button
                  type="button"
                  className="receipt-doc-choice-card"
                  onClick={() => setDocType("invoice")}
                >
                  <div className="receipt-doc-choice-card-icon">
                    <FileText size={32} />
                  </div>
                  <div className="receipt-doc-choice-card-text">
                    <strong>{label(`Invoice (${invoicePaperSize})`, `វិក្កយបត្រ (${invoicePaperSize})`)}</strong>
                    <small>{label(`${invoicePaperSize} printable sheet with bilingual invoice details & totals`, `ក្រដាសវិក្កយបត្រ ${invoicePaperSize}`)}</small>
                  </div>
                </button>
              </div>
            </div>
          ) : isInvoice ? (
            <SaleInvoiceDocument receipt={receipt} shop={shop} language={receiptLanguage} />
          ) : (
            <article
              className="receipt-document"
              style={{ "--receipt-width": `${receiptWidth}mm` }}
            >
              <div className={`receipt-shop receipt-logo-${logoPosition}`}>
                <div className="receipt-brand-line">
                  {showLogo && shop?.shop_logo_url && (
                    <img className="receipt-logo" src={shop.shop_logo_url} alt="" />
                  )}
                  <h2>{receiptShopName}</h2>
                </div>
                {receiptHeader && <p>{receiptHeader}</p>}
                {showAddress && receiptAddress && (
                  <p>{receiptAddress}</p>
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
                      {statusText(receipt.saleStatus)}
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
                {receipt.priceListName && (
                  <div>
                    <span>{label("Price list", "បញ្ជីតម្លៃ")}</span>
                    <strong>{receipt.priceListName}</strong>
                  </div>
                )}
              </div>

              {showBarcode && receipt.invoiceNumber && (
                <div className="receipt-invoice-barcode">
                  <ProductBarcode
                    value={receipt.invoiceNumber}
                    format="CODE128"
                    height={38}
                    width={1.25}
                    showValue={true}
                  />
                </div>
              )}

              <div className="receipt-lines">
                {(receipt.cart || []).map((item, index) => {
                  const promoLabel = getProductPromotionLabel(item, receipt.currency);

                  const unitPrice = Number(
                    item.selected_unit_price
                    ?? item.selling_price
                    ?? item.unit_price
                    ?? 0
                  );

                  const normalUnitPrice = promoLabel
                    ? Number(
                        item.standard_unit_price
                        ?? item.list_price
                        ?? item.selling_price
                        ?? (unitPrice + (Number(item.promotion_discount_amount || 0) / Math.max(1, Number(item.quantity || 1))))
                        ?? unitPrice
                      )
                    : unitPrice;

                  const lineTotal = item.line_total !== undefined
                    ? Number(item.line_total || 0)
                    : (promoLabel
                        ? Number(item.quantity || 0) * unitPrice
                        : Number(item.quantity || 0) * unitPrice - Number(item.line_discount_amount || item.discount_amount || 0));

                  const nonPromoLineDiscount = promoLabel
                    ? 0
                    : Number(item.line_discount_amount || item.discount_amount || 0);

                  const itemName = isKhmer && item.name_km
                    ? `${item.name_km}${item.name && item.name !== item.name_km ? ` (${item.name})` : ""}`
                    : item.name || item.name_km || "—";
                  const unitName = item.selected_unit_name || item.sale_unit_name || item.unit_name || "";

                  return (
                    <div className="receipt-line" key={item.id || `${item.product_id || "item"}-${index}`}>
                      <div
                        className="receipt-line-info"
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr",
                          gridAutoRows: "auto",
                          gap: "2px",
                          minWidth: 0
                        }}
                      >
                        <strong
                          className="receipt-line-product-name"
                          style={{ display: "block", minWidth: 0, overflowWrap: "anywhere" }}
                        >
                          {itemName}
                        </strong>
                        <small
                          className="receipt-line-unit-price"
                          style={{ display: "block", lineHeight: 1.25 }}
                        >
                          {stockNumber(item.quantity)} {unitName} × {money(normalUnitPrice, receipt.currency)}
                          {promoLabel ? `  ${promoLabel}` : ""}
                        </small>
                        {nonPromoLineDiscount > 0 && (
                          <small className="receipt-line-discount" style={{ display: "block", lineHeight: 1.25 }}>
                            -{money(nonPromoLineDiscount, receipt.currency)}
                          </small>
                        )}
                      </div>
                      <strong>{money(lineTotal, receipt.currency)}</strong>
                    </div>
                  );
                })}
              </div>

              <div className="receipt-totals">
                <div><span>{label("Sub-Total", "សរុបរង")}</span><strong>{money(subtotalDisplay, receipt.currency)}</strong></div>
                {Number(receipt.priceAdjustmentAmount || 0) !== 0 && (
                  <div>
                    <span>{label("Price adjustment", "ការកែសម្រួលតម្លៃ")}</span>
                    <strong>{money(receipt.priceAdjustmentAmount, receipt.currency)}</strong>
                  </div>
                )}
                {totalPromotionDiscount > 0 && (
                  <div>
                    <span>{label("Promotion Discount", "បញ្ចុះតម្លៃប្រូម៉ូសិន")}</span>
                    <strong>-{money(totalPromotionDiscount, receipt.currency)}</strong>
                  </div>
                )}
                {genericDiscount > 0 && (
                  <div>
                    <span>{label("Discount", "បញ្ចុះតម្លៃ")}</span>
                    <strong>-{money(genericDiscount, receipt.currency)}</strong>
                  </div>
                )}
                {Number(receipt.taxAmount || 0) > 0 && (
                  <div><span>{label("Tax", "ពន្ធ")}</span><strong>{money(receipt.taxAmount, receipt.currency)}</strong></div>
                )}
                <hr />
                <div><span>{label("Total", "សរុប")}</span><strong>{money(receipt.totalAmount, receipt.currency)}</strong></div>
                <div><span>{label(`Total (${alternateCurrency})`, `សរុប (${alternateCurrency})`)}</span><strong>{money(alternateTotal, alternateCurrency)}</strong></div>
                {Number(receipt.refundedAmount || 0) > 0 && (
                  <div><span>{label("Refunded", "បានសងប្រាក់")}</span><strong>-{money(receipt.refundedAmount, receipt.currency)}</strong></div>
                )}
                {Number(receipt.netTotal ?? receipt.totalAmount) !== Number(receipt.totalAmount) && (
                  <div><span>{label("Net Total", "សរុបសុទ្ធ")}</span><strong>{money(receipt.netTotal, receipt.currency)}</strong></div>
                )}
                <div><span>{label("Payment method", "វិធីសាស្ត្រទូទាត់")}</span><strong>{paymentText(paymentMethod)}</strong></div>

                {paymentRows.length > 0 ? (
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
                            <strong>{paymentText(payment.method || "other")}</strong>
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
                    <div><span>{label("Received", "ទទួល")}</span><strong>{money(receipt.amountReceived, receipt.currency)}</strong></div>
                    <div><span>{label("Change", "ប្រាក់អាប់")}</span><strong>{money(receipt.changeAmount, receipt.currency)}</strong></div>
                  </>
                )}
              </div>

              <div className="receipt-footer">
                {receiptFooter}
              </div>
            </article>
          )}
        </div>

        <div className="receipt-actions">
          <button type="button" className="secondary-button" onClick={onClose}>{label("Close", "បិទ")}</button>
          <button
            type="button"
            className="primary-button"
            onClick={printReceipt}
            disabled={!docType}
            title={!docType ? label("Please choose document type first", "សូមជ្រើសរើសប្រភេទឯកសារជាមុនសិន") : ""}
          >
            <Printer size={18} />{" "}
            {!docType
              ? label("Select document to print", "ជ្រើសរើសឯកសារដើម្បីបោះពុម្ព")
              : isInvoice
              ? label("Print invoice", "បោះពុម្ពវិក្កយបត្រ")
              : label("Print receipt", "បោះពុម្ពបង្កាន់ដៃ")}
          </button>
        </div>
      </div>
    </Modal>
  );
}

