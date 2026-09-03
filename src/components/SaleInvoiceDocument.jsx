import { money, stockNumber } from "../lib/catalog";
import { normalizeMediaUrl } from "../lib/media";

function formatDateTime(value, locale = "en-US") {
  if (!value) return "—";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatDate(value, locale = "en-US") {
  const source = value ? new Date(value) : new Date();
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(source);
}

function paymentLabel(value, isKhmer) {
  const normalized = String(value || "other").toLowerCase();
  if (!isKhmer) {
    if (normalized === "split") return "CASH + BANK";
    return normalized.toUpperCase();
  }

  return ({
    cash: "សាច់ប្រាក់",
    bank: "ធនាគារ",
    khqr: "KHQR",
    card: "កាត",
    credit: "ឥណទាន",
    split: "សាច់ប្រាក់ + ធនាគារ",
    other: "ផ្សេងៗ"
  })[normalized] || normalized;
}

function lineUnit(item) {
  return item.selected_unit_name || item.sale_unit_name || item.unit_name || "unit";
}

function linePrice(item) {
  return Number(item.selected_unit_price ?? item.selling_price ?? item.unit_price ?? 0);
}

function lineDiscount(item) {
  return Number(item.line_discount_amount ?? item.discount_amount ?? 0);
}

function lineAmount(item, promoLabel) {
  const sellingPrice = Number(item.selected_unit_price ?? item.selling_price ?? item.unit_price ?? 0);
  const qty = Number(item.quantity || 0);
  const promoDiscount = Number(item.promotion_discount_amount || 0);

  const normalUnitPrice = promoLabel
    ? Number(
        item.standard_unit_price
        ?? item.list_price
        ?? item.selling_price
        ?? (sellingPrice + (promoDiscount / Math.max(1, qty)))
        ?? sellingPrice
      )
    : Number(
        item.standard_unit_price
        ?? item.list_price
        ?? sellingPrice
      );

  if (promoLabel) {
    if (promoDiscount > 0) {
      return qty * normalUnitPrice - promoDiscount;
    }
    return qty * sellingPrice;
  }

  return qty * normalUnitPrice;
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

export default function SaleInvoiceDocument({ receipt, shop, language = "en" }) {
  if (!receipt) return null;

  const isKhmer = language === "km";
  const locale = isKhmer ? "km-KH" : "en-US";
  const label = (en, km) => isKhmer ? km : en;
  const exchangeRate = Math.max(0.0001, Number(
    receipt.exchangeRate || shop?.usd_to_khr_rate || 4100
  ));
  const total = Number(receipt.totalAmount || 0);
  const totalUsd = receipt.currency === "USD" ? total : total / exchangeRate;
  const totalKhr = receipt.currency === "KHR" ? total : total * exchangeRate;
  const paymentRows = Array.isArray(receipt.payments) ? receipt.payments : [];
  const paymentMethod = String(
    receipt.paymentMethod
    || (paymentRows.length > 1 ? "split" : paymentRows[0]?.method)
    || "other"
  );

  const shopName = isKhmer
    ? shop?.shop_name_km || shop?.shop_name || receipt.shopName || "Tiny POS"
    : shop?.shop_name || receipt.shopName || "Tiny POS";
  const shopAddress = isKhmer
    ? shop?.shop_address_km || shop?.shop_address || receipt.shopAddress || ""
    : shop?.shop_address || receipt.shopAddress || "";
  const shopHeader = isKhmer
    ? shop?.receipt_header_km || ""
    : shop?.receipt_header || "";
  const invoiceTitle = isKhmer
    ? shop?.invoice_title_km || "វិក្កយបត្រ"
    : shop?.invoice_title || "INVOICE";
  const invoiceFooter = isKhmer
    ? shop?.invoice_footer_km || shop?.receipt_footer_km || "សូមអរគុណចំពោះការគាំទ្រ!"
    : shop?.invoice_footer || shop?.receipt_footer || receipt.footer || "Thank you for your purchase.";

  const showLogo = shop?.invoice_show_logo !== false;
  const showShopName = shop?.invoice_show_shop_name !== false;
  const showAddress = shop?.invoice_show_address !== false;
  const showContact = shop?.invoice_show_contact !== false;
  const showTaxId = shop?.invoice_show_tax_id !== false;
  const showCustomer = shop?.invoice_show_customer !== false;
  const showCashier = shop?.invoice_show_cashier !== false;
  const showReceived = shop?.invoice_show_received !== false;
  const showChange = shop?.invoice_show_change !== false;
  const showSignatures = shop?.invoice_show_signatures !== false;
  const showProductCode = shop?.invoice_show_product_code !== undefined
    ? shop.invoice_show_product_code !== false
    : (typeof window !== "undefined" && window.localStorage.getItem("invoice_show_product_code") === "false" ? false : true);
  const paperSize = shop?.invoice_paper_size === "A4" ? "A4" : "A5";

  const creditAmount = Number(
    receipt.creditAmount
    ?? receipt.credit_amount
    ?? (paymentMethod === "credit" ? receipt.totalAmount : 0)
  );
  const isCreditSale = paymentMethod === "credit" || paymentRows.some(p => p.method === "credit") || creditAmount > 0;

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

  const genericDiscount = Math.max(
    0,
    Math.round((subtotalDisplay - totalPromotionDiscount + totalTax - total + Number.EPSILON) * 100) / 100
  );

  return (
    <article
      className={`sale-invoice-document ${isKhmer ? "khmer" : "english"} paper-${paperSize.toLowerCase()}`}
      data-paper-size={paperSize}
      data-i18n-skip
    >
      <header className="sale-invoice-shop-header">
        {showLogo && shop?.shop_logo_url && (
          <img className="sale-invoice-logo" src={shop.shop_logo_url} alt="Shop Logo" />
        )}
        <div className="sale-invoice-shop-copy">
          {showShopName && <h1>{shopName}</h1>}
          {showAddress && shopAddress && <p>{shopAddress}</p>}
          {showContact && (shop?.shop_phone || receipt.shopPhone || shop?.shop_email) && (
            <p>
              {[shop?.shop_phone || receipt.shopPhone, shop?.shop_email]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
          {showTaxId && shop?.tax_id && (
            <p>{label("Tax ID", "លេខអត្តសញ្ញាណពន្ធ")}: {shop.tax_id}</p>
          )}
          {shopHeader && <p className="sale-invoice-shop-note">{shopHeader}</p>}
        </div>
      </header>

      <section className="sale-invoice-heading">
        <h2>{invoiceTitle}</h2>
        <span className="sale-invoice-title-rule" />
        <div className="sale-invoice-heading-meta">
          <div><span>{label("Invoice No.", "លេខវិក្កយបត្រ")}</span><strong>{receipt.invoiceNumber}</strong></div>
          <div><span>{label("Date", "កាលបរិច្ឆេទ")}</span><strong>{formatDateTime(receipt.completedAt, locale)}</strong></div>
          {showCustomer && (
            <div><span>{label("Customer", "អតិថិជន")}</span><strong>{receipt.customerName || label("Walk-in customer", "អតិថិជនទូទៅ")}</strong></div>
          )}
          {showCashier && (
            <div><span>{label("Cashier", "អ្នកគិតលុយ")}</span><strong>{receipt.cashierName || "POS Staff"}</strong></div>
          )}
        </div>
      </section>

      <div className="sale-invoice-table-wrap">
        <table className={`sale-invoice-table ${showProductCode ? "has-code-pic" : "no-code-pic"}`}>
          <colgroup>
            <col className="invoice-col-no" />
            {showProductCode && <col className="invoice-col-code-pic" />}
            <col className="invoice-col-desc" />
            <col className="invoice-col-qty" />
            <col className="invoice-col-unit" />
            <col className="invoice-col-unit-price" />
            <col className="invoice-col-amount" />
          </colgroup>
          <thead>
            <tr>
              <th className="invoice-col-no">{label("No.", "ល.រ")}</th>
              {showProductCode && <th className="invoice-col-code-pic">{label("Code / Pic", "កូដ / រូបភាព")}</th>}
              <th className="invoice-col-desc">{label("Item Description", "បរិយាយមុខទំនិញ")}</th>
              <th className="invoice-col-qty">{label("Qty", "ចំនួន")}</th>
              <th className="invoice-col-unit">{label("Unit", "ឯកតា")}</th>
              <th className="invoice-col-unit-price invoice-col-money">{label("Unit Price", "តម្លៃឯកតា")}</th>
              <th className="invoice-col-amount invoice-col-money">{label("Amount", "ទឹកប្រាក់")}</th>
            </tr>
          </thead>
          <tbody>
            {(receipt.cart || []).map((item, index) => {
              const promoLabel = getProductPromotionLabel(item, receipt.currency);
              const normalUnitPrice = promoLabel
                ? Number(
                    item.standard_unit_price
                    ?? item.list_price
                    ?? item.selling_price
                    ?? (linePrice(item) + (Number(item.promotion_discount_amount || 0) / Math.max(1, Number(item.quantity || 1))))
                    ?? linePrice(item)
                  )
                : linePrice(item);
              const description = isKhmer && item.name_km
                ? `${item.name_km}${item.name && item.name !== item.name_km ? ` (${item.name})` : ""}`
                : item.name || item.name_km || "—";
              const codeStr = item.code || item.sku || item.product_code || item.barcode || item.product?.sku || item.product?.barcode || "";
              const rawImageCandidate =
                item.image_url
                || item.image
                || item.product_image_url
                || item.product_images
                || item.photo_url
                || item.thumbnail
                || item.product?.image_url
                || item.product?.image
                || item.product?.product_images
                || item.product?.photo_url
                || item.product?.thumbnail;
              const thumbUrl = normalizeMediaUrl(rawImageCandidate);
              return (
                <tr key={item.id || `${item.product_id || "item"}-${index}`}>
                  <td className="invoice-col-no">{String(index + 1)}</td>
                  {showProductCode && (
                    <td className="invoice-col-code-pic">
                      <div className="invoice-code-pic-cell">
                        <div className="invoice-code-part">
                          <span className="invoice-product-code-text">{codeStr || "—"}</span>
                        </div>
                        <div className="invoice-image-part">
                          {thumbUrl ? (
                            <img
                              src={thumbUrl}
                              alt={item.name || "Product"}
                              className="invoice-product-img"
                              loading="eager"
                            />
                          ) : (
                            <div className="invoice-product-img-empty">
                              <span className="invoice-empty-dash">—</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  )}
                  <td className="invoice-col-desc">
                    <strong className="invoice-item-name">{description}</strong>
                    {item.variant_name && <span className="invoice-item-sub">{item.variant_name}</span>}
                    {promoLabel && (
                      <span className="invoice-item-promo" style={{ display: "block", fontSize: "0.85em", color: "#374151", fontWeight: 600, marginTop: "2px" }}>
                        {promoLabel}
                      </span>
                    )}
                  </td>
                  <td className="invoice-col-qty">{stockNumber(item.quantity)}</td>
                  <td className="invoice-col-unit">{lineUnit(item)}</td>
                  <td className="invoice-col-unit-price invoice-col-money">{money(normalUnitPrice, receipt.currency)}</td>
                  <td className="invoice-col-amount invoice-col-money"><strong>{money(lineAmount(item, promoLabel), receipt.currency)}</strong></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section className="sale-invoice-settlement">
        <div className="sale-invoice-totals-box">
          <div><span>{label("Sub-Total", "សរុបរង")}</span><strong>{money(subtotalDisplay, receipt.currency)}</strong></div>
          {totalPromotionDiscount > 0 && (
            <div><span>{label("Promotion Discount", "បញ្ចុះតម្លៃប្រូម៉ូសិន")}</span><strong>-{money(totalPromotionDiscount, receipt.currency)}</strong></div>
          )}
          {genericDiscount > 0 && (
            <div><span>{label("Discount", "បញ្ចុះតម្លៃ")}</span><strong>-{money(genericDiscount, receipt.currency)}</strong></div>
          )}
          {Number(receipt.taxAmount || 0) > 0 && (
            <div><span>{label("Tax", "ពន្ធ")}</span><strong>{money(receipt.taxAmount, receipt.currency)}</strong></div>
          )}
          <div className="sale-invoice-total-divider" />
          <div className="sale-invoice-grand-total"><span>{label("GRAND TOTAL (USD)", "ប្រាក់សរុប (USD)")}</span><strong>{money(totalUsd, "USD")}</strong></div>
          <div><span>{label("GRAND TOTAL (KHR)", "ប្រាក់សរុបជាប្រាក់រៀល")}</span><strong>{money(totalKhr, "KHR")}</strong></div>
          <div><span>{label("Payment", "ការទូទាត់")}</span><strong>{paymentLabel(paymentMethod, isKhmer)}</strong></div>

          {isCreditSale && (
            <div className="sale-invoice-credit-row">
              <span>{label("Credit Amount", "ប្រាក់ជំពាក់")}</span>
              <strong>{money(creditAmount || total, receipt.currency)}</strong>
            </div>
          )}

          <div className="sale-invoice-total-divider" />

          {showReceived && paymentRows.length > 0 ? (
            paymentRows.map((payment, index) => {
              const tenderCurrency = payment.tender_currency || payment.currency || receipt.currency;
              const tenderAmount = Number(
                payment.tender_amount
                ?? payment.amount_received
                ?? payment.settlement_amount
                ?? 0
              );
              const settlement = payment.settlement_amount;
              const change = Number(payment.change_amount ?? payment.tender_change_amount ?? 0);
              return (
                <div className="sale-invoice-payment-row" key={`${payment.method || "payment"}-${index}`}>
                  <span>{label("Received", "ទទួល")} · {paymentLabel(payment.method, isKhmer)}</span>
                  <strong>
                    {money(tenderAmount, tenderCurrency)}
                    {settlement !== undefined && tenderCurrency !== receipt.currency && (
                      <small>= {money(settlement, receipt.currency)}</small>
                    )}
                  </strong>
                  {showChange && change > 0 && (
                    <span className="sale-invoice-payment-change">
                      {label("Change", "ប្រាក់អាប់")}: <b>{money(change, tenderCurrency)}</b>
                    </span>
                  )}
                </div>
              );
            })
          ) : showReceived ? (
            <>
              <div><span>{label("Received", "ទទួល")}</span><strong>{money(receipt.amountReceived, receipt.currency)}</strong></div>
              {showChange && <div><span>{label("Change", "ប្រាក់អាប់")}</span><strong>{money(receipt.changeAmount, receipt.currency)}</strong></div>}
            </>
          ) : null}
        </div>
      </section>

      {showSignatures && (
        <section className="sale-invoice-signatures">
          <div>
            <span>{label("Seller Signature", "ហត្ថលេខាអ្នកលក់")}</span>
            <i />
            <small>{label("Date", "កាលបរិច្ឆេទ")}: ____/____/______</small>
          </div>
          <div>
            <span>{label("Buyer Signature", "ហត្ថលេខាអ្នកទិញ")}</span>
            <i />
            <small>{label("Date", "កាលបរិច្ឆេទ")}: ____/____/______</small>
          </div>
        </section>
      )}

      <footer className="sale-invoice-footer">
        {invoiceFooter}
        <small>{formatDate(receipt.completedAt, locale)}</small>
      </footer>
    </article>
  );
}
