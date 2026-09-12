import {
  Copy,
  LayoutGrid,
  Printer,
  RotateCcw,
  Table2
} from "lucide-react";
import { useEffect, useState } from "react";
import { useLanguage } from "../context/LanguageContext";
import { normalizeMediaUrl } from "../lib/media";
import Modal from "./Modal";
import {
  money,
  stockNumber
} from "../lib/catalog";
import {
  invoiceDate,
  invoiceDateTime,
  invoiceStatusLabel,
  paymentMethodLabel
} from "../lib/invoices";

function getPromoLabel(item, currency = "USD") {
  const promo = item.active_promotion || item.promotion;
  if (promo) {
    const type = String(promo.discount_type || promo.type || "").toLowerCase();
    const val = Number(promo.discount_value || promo.discount_amount || 0);
    if (type === "percent" && val > 0) return `PRO -${val}%`;
    if ((type === "fixed" || type === "amount") && val > 0) return `PRO -${money(val, currency)}`;
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

  const stdPrice = Number(item.list_price || item.standard_unit_price || 0);
  const sellingPrice = Number(item.unit_price || item.selected_unit_price || 0);
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

export default function InvoiceDetailModal({
  invoice,
  canViewProfit,
  canRefund,
  onClose,
  onPrint,
  onOpenReturn
}) {
  const { t, language } = useLanguage();
  const [itemViewMode, setItemViewMode] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 850px)").matches
      ? "cards"
      : "table"
  );

  useEffect(() => {
    if (!invoice?.id) return;
    setItemViewMode(
      typeof window !== "undefined" && window.matchMedia("(max-width: 850px)").matches
        ? "cards"
        : "table"
    );
  }, [invoice?.id]);

  if (!invoice) return null;

  const items = invoice.items || [];

  const explicitPromo = Number(invoice.promotion_discount_amount || invoice.promotionDiscountAmount || 0);
  const itemsPromoSum = items.reduce((sum, item) => {
    const promoDiscount = Number(item.promotion_discount_amount || 0);
    if (promoDiscount > 0) return sum + promoDiscount;

    const qty = Number(item.quantity || 0);
    const listPrice = Number(item.list_price || item.standard_unit_price || 0);
    const unitPrice = Number(item.unit_price || item.selected_unit_price || 0);
    if (listPrice > unitPrice && unitPrice > 0) {
      return sum + ((listPrice - unitPrice) * qty);
    }
    return sum;
  }, 0);

  const totalPromotionDiscount = Math.max(explicitPromo, itemsPromoSum);

  const calculatedGrossSubtotal = items.reduce((sum, item) => {
    const qty = Number(item.quantity || 0);
    const promoDiscount = Number(item.promotion_discount_amount || 0);
    const sellingPrice = Number(item.unit_price || item.selected_unit_price || 0);
    const stdPrice = Number(
      item.list_price
      ?? item.standard_unit_price
      ?? (promoDiscount > 0 && qty > 0 ? sellingPrice + (promoDiscount / qty) : sellingPrice)
    );
    return sum + (qty * stdPrice);
  }, 0);

  const subtotalDisplay = calculatedGrossSubtotal > 0
    ? calculatedGrossSubtotal
    : Number(invoice.subtotal || 0) + totalPromotionDiscount;

  const totalTax = Number(invoice.tax_amount || 0);
  const totalAmount = Number(invoice.total_amount || 0);

  const genericDiscount = Math.max(
    0,
    Math.round((subtotalDisplay - totalPromotionDiscount + totalTax - totalAmount + Number.EPSILON) * 100) / 100
  );

  async function copyNumber() {
    try {
      await navigator.clipboard.writeText(
        invoice.invoice_number
      );
    } catch {
      window.prompt(
        "Copy invoice number:",
        invoice.invoice_number
      );
    }
  }

  return (
    <Modal
      title={invoice.invoice_number}
      onClose={onClose}
      wide
    >
      <div className="invoice-detail">
        <section className="invoice-detail-header">
          <div>
            <span>{t("Invoice")}</span>
            <strong>
              {invoice.invoice_number}
            </strong>
            <small>
              {invoiceDateTime(
                invoice.completed_at
                || invoice.created_at,
                language
              )}
            </small>
          </div>

          <div>
            <span>{t("Branch")}</span>
            <strong>
              {invoice.branch_name}
            </strong>
            <small>
              {invoice.branch_code || "—"}
            </small>
          </div>

          <div>
            <span>{t("Customer")}</span>
            <strong>
              {invoice.customer?.name
                || t("Walk-in customer")}
            </strong>
            <small>
              {[
                invoice.customer?.customer_code,
                invoice.customer?.phone
              ]
                .filter(Boolean)
                .join(" · ")
                || t("No customer profile")}
            </small>
          </div>

          <div>
            <span>{t("Cashier")}</span>
            <strong>
              {invoice.cashier_name}
            </strong>
          </div>
        </section>

        <section className="invoice-detail-badges">
          <span className={`invoice-status ${invoice.status}`}>
            {t(invoiceStatusLabel(invoice.status))}
          </span>

          <span className={`invoice-payment-status ${invoice.payment_status}`}>
            {t(invoiceStatusLabel(
              invoice.payment_status
            ))}
          </span>

          <span className="invoice-payment-method">
            {t(paymentMethodLabel(
              invoice.payment_method
            ))}
          </span>

          {invoice.source_quote_number && (
            <span>
              {t("Quote")} {invoice.source_quote_number}
            </span>
          )}

          {invoice.price_list_name && (
            <span>
              {t("Price list")}: {invoice.price_list_name}
            </span>
          )}
        </section>

        <section className="invoice-detail-items">
          <div className="invoice-detail-items-toolbar">
            <div>
              <strong>{t("Invoice items")}</strong>
              <small>{(invoice.items || []).length} {t("items")}</small>
            </div>
            <div className="invoice-detail-view-toggle" aria-label="Invoice item view">
              <button
                type="button"
                className={itemViewMode === "table" ? "active" : ""}
                onClick={() => setItemViewMode("table")}
              >
                <Table2 size={17} /> {t("Table")}
              </button>
              <button
                type="button"
                className={itemViewMode === "cards" ? "active" : ""}
                onClick={() => setItemViewMode("cards")}
              >
                <LayoutGrid size={17} /> {t("Cards")}
              </button>
            </div>
          </div>

          {itemViewMode === "cards" ? (
            <div className="invoice-detail-item-card-grid">
              {(invoice.items || []).map((item) => {
                const codeVal = item.product_code || item.code || item.sku || item.barcode || "";
                const rawImg = item.image_url || item.image || item.product_image_url || item.photo_url || item.thumbnail;
                const thumbUrl = normalizeMediaUrl(rawImg);
                return (
                  <article className="invoice-detail-item-card" key={item.id}>
                    <header>
                      <div className="invoice-detail-card-head">
                        {thumbUrl ? (
                          <img src={thumbUrl} alt="" className="invoice-detail-item-thumb" />
                        ) : null}
                        <div className="invoice-detail-card-title">
                          <strong>{item.product_name}</strong>
                          <small>{codeVal ? `[${codeVal}]` : t("No code")}</small>
                          {getPromoLabel(item, invoice.currency) && (
                            <div className="promotion-inline-tag">{getPromoLabel(item, invoice.currency)}</div>
                          )}
                        </div>
                      </div>
                      <strong>{money(item.line_total, invoice.currency)}</strong>
                    </header>
                    <div className="invoice-detail-item-fields">
                      <div><span>{t("Quantity")}</span><strong>{stockNumber(item.quantity)} {t(item.sale_unit_name || "pcs")}</strong><small>{stockNumber(item.base_quantity)} {t("base units")}</small></div>
                      <div><span>{t("List price")}</span><strong>{money(item.list_price, invoice.currency)}</strong></div>
                      <div><span>{t("Sale price")}</span><strong>{money(item.unit_price, invoice.currency)}</strong></div>
                      <div><span>{t("Discount")}</span><strong>{money(item.discount_amount, invoice.currency)}</strong></div>
                      {canViewProfit && <div><span>{t("Profit")}</span><strong>{money(item.line_profit, invoice.currency)}</strong></div>}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="invoice-detail-table-wrap">
              <table className="invoice-detail-table">
                <thead>
                  <tr>
                    <th>{t("Product")}</th>
                    <th>{t("Quantity")}</th>
                    <th>{t("List price")}</th>
                    <th>{t("Sale price")}</th>
                    <th>{t("Discount")}</th>
                    <th>{t("Total")}</th>
                    {canViewProfit && <th>{t("Profit")}</th>}
                  </tr>
                </thead>

                <tbody>
                  {(invoice.items || []).map((item) => {
                    const codeVal = item.product_code || item.code || item.sku || item.barcode || "";
                    const rawImg = item.image_url || item.image || item.product_image_url || item.photo_url || item.thumbnail;
                    const thumbUrl = normalizeMediaUrl(rawImg);
                    return (
                      <tr key={item.id}>
                        <td data-label={t("Product")}>
                          <div className="invoice-detail-product-cell">
                            {thumbUrl ? (
                              <img src={thumbUrl} alt="" className="invoice-detail-item-thumb" />
                            ) : null}
                            <div className="invoice-detail-product-text">
                              <strong>{item.product_name}</strong>
                              <small>{codeVal ? `[${codeVal}]` : t("No code")}</small>
                              {getPromoLabel(item, invoice.currency) && (
                                <div className="promotion-inline-tag">{getPromoLabel(item, invoice.currency)}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td data-label={t("Quantity")}>
                          {stockNumber(item.quantity)} {t(item.sale_unit_name || "pcs")}
                          <small>{stockNumber(item.base_quantity)} {t("base units")}</small>
                        </td>
                        <td data-label={t("List price")}>{money(item.list_price, invoice.currency)}</td>
                        <td data-label={t("Sale price")}>{money(item.unit_price, invoice.currency)}</td>
                        <td data-label={t("Discount")}>{money(item.discount_amount, invoice.currency)}</td>
                        <td data-label={t("Total")}><strong>{money(item.line_total, invoice.currency)}</strong></td>
                        {canViewProfit && <td data-label={t("Profit")}>{money(item.line_profit, invoice.currency)}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="invoice-detail-columns">
          <section className="invoice-detail-section">
            <h3>{t("Payments")}</h3>

            {invoice.credit_account_id && (
              <article className="invoice-credit-summary">
                <div>
                  <span>{t("Credit due date")}</span>
                  <strong>
                    {invoiceDate(
                      invoice.credit_due_date,
                      language
                    )}
                  </strong>
                </div>

                <div>
                  <span>{t("Credit invoice")}</span>
                  <strong>
                    {money(
                      invoice.credit_amount,
                      invoice.currency
                    )}
                  </strong>
                </div>

                <div>
                  <span>{t("Outstanding")}</span>
                  <strong>
                    {money(
                      invoice.credit_outstanding,
                      invoice.currency
                    )}
                  </strong>
                </div>
              </article>
            )}

            {(invoice.payments || []).length === 0 ? (
              <p className="muted">
                {invoice.credit_account_id
                  ? t("No credit collections recorded yet.")
                  : t("No payment records.")}
              </p>
            ) : (
              <div className="invoice-payment-list">
                {invoice.payments.map((payment) => (
                  <article key={payment.id}>
                    <div>
                      <strong>
                        {t(paymentMethodLabel(
                          payment.method
                        ))}
                      </strong>
                      <span>
                        {invoiceDateTime(
                          payment.paid_at,
                          language
                        )}
                        {payment.is_credit_collection
                          ? ` · ${t("Credit collection")}`
                          : ""}
                      </span>
                    </div>

                    <div>
                      <strong>
                        {money(
                          payment.amount,
                          payment.currency
                        )}
                      </strong>
                      <span>
                        {payment.reference_number
                          || t("No reference")}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="invoice-detail-section">
            <h3>{t("Returns & refunds")}</h3>

            {(invoice.returns || []).length === 0 ? (
              <p className="muted">
                {t("No returns for this invoice.")}
              </p>
            ) : (
              <div className="invoice-return-list">
                {invoice.returns.map((refund) => (
                  <article key={refund.id}>
                    <div>
                      <strong>
                        {refund.return_number}
                      </strong>
                      <span>
                        {invoiceDateTime(
                          refund.processed_at,
                          language
                        )}
                        {" · "}
                        {t(paymentMethodLabel(
                          refund.refund_method
                        ))}
                      </span>
                    </div>

                    <div>
                      <strong>
                        -{money(
                          refund.refund_amount,
                          refund.currency
                        )}
                      </strong>
                      <span>
                        {refund.reason || t("No reason")}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>

        <section className="invoice-detail-total-grid">
          <div>
            <span>{t("Sub-Total")}</span>
            <strong>
              {money(
                subtotalDisplay,
                invoice.currency
              )}
            </strong>
          </div>

          {Number(invoice.price_adjustment_amount || 0) !== 0 && (
            <div>
              <span>{t("Price adjustment")}</span>
              <strong>
                {money(
                  invoice.price_adjustment_amount,
                  invoice.currency
                )}
              </strong>
            </div>
          )}

          {totalPromotionDiscount > 0 && (
            <div>
              <span>{t("Promotion Discount")}</span>
              <strong>
                -{money(
                  totalPromotionDiscount,
                  invoice.currency
                )}
              </strong>
            </div>
          )}

          {genericDiscount > 0 && (
            <div>
              <span>{t("Discount")}</span>
              <strong>
                -{money(
                  genericDiscount,
                  invoice.currency
                )}
              </strong>
            </div>
          )}

          {totalTax > 0 && (
            <div>
              <span>{t("Tax")}</span>
              <strong>
                {money(
                  totalTax,
                  invoice.currency
                )}
              </strong>
            </div>
          )}

          <div>
            <span>{t("Gross total")}</span>
            <strong>
              {money(
                invoice.total_amount,
                invoice.currency
              )}
            </strong>
          </div>

          <div>
            <span>{t("Refunded")}</span>
            <strong>
              -{money(
                invoice.refunded_amount,
                invoice.currency
              )}
            </strong>
          </div>

          <div className="invoice-net-total">
            <span>{t("Net total")}</span>
            <strong>
              {money(
                invoice.net_total,
                invoice.currency
              )}
            </strong>
          </div>

          {canViewProfit && (
            <div>
              <span>{t("Net profit")}</span>
              <strong>
                {money(
                  invoice.net_profit,
                  invoice.currency
                )}
              </strong>
            </div>
          )}
        </section>

        {invoice.notes && (
          <section className="invoice-detail-notes">
            <strong>{t("Invoice note")}</strong>
            <p>{invoice.notes}</p>
          </section>
        )}

        <div className="modal-actions invoice-detail-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={copyNumber}
          >
            <Copy size={17} />
            {t("Copy number")}
          </button>

          {canRefund
            && !["voided", "refunded"]
              .includes(invoice.status) && (
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                onOpenReturn(invoice)
              }
            >
              <RotateCcw size={17} />
              {t("Return / refund")}
            </button>
          )}

          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
          >
            {t("Close")}
          </button>

          <button
            type="button"
            className="primary-button"
            onClick={() => onPrint(invoice)}
          >
            <Printer size={18} />
            Reprint receipt
          </button>
        </div>
      </div>
    </Modal>
  );
}
