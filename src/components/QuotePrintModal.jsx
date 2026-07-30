import {
  Printer,
  ShoppingCart
} from "lucide-react";
import Modal from "./Modal";
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

export default function QuotePrintModal({
  quote,
  shop,
  branch,
  onClose,
  onConvert
}) {
  if (!quote) return null;

  const status =
    effectiveQuoteStatus(quote);

  return (
    <Modal
      title={quote.quote_number}
      onClose={onClose}
      wide
    >
      <div className="quote-print-wrapper">
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
                  <p>Tax ID: {shop.tax_id}</p>
                )}
              </div>
            </div>

            <div className="quote-print-title">
              <strong>QUOTATION</strong>
              <span>{quote.quote_number}</span>
              <b className={`quote-status ${status}`}>
                {quoteStatusLabel(status)}
              </b>
            </div>
          </header>

          <section className="quote-print-parties">
            <div>
              <span>Quoted to</span>
              <strong>
                {quote.customers?.name
                  || "Walk-in customer"}
              </strong>

              {quote.customers?.customer_code && (
                <p>
                  {quote.customers.customer_code}
                </p>
              )}

              {quote.customers?.company_name && (
                <p>
                  {quote.customers.company_name}
                </p>
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
                <span>Branch</span>
                <strong>
                  {branch?.name || "Current branch"}
                </strong>
              </div>

              <div>
                <span>Created</span>
                <strong>
                  {quoteDateTime(
                    quote.created_at
                  )}
                </strong>
              </div>

              <div>
                <span>Valid until</span>
                <strong>
                  {quoteDate(
                    quote.valid_until
                  )}
                </strong>
              </div>

              <div>
                <span>Currency</span>
                <strong>{quote.currency}</strong>
              </div>
            </div>
          </section>

          <table className="quote-print-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Product</th>
                <th>Code</th>
                <th>Quantity</th>
                <th>Unit price</th>
                <th>Discount</th>
                <th>Total</th>
              </tr>
            </thead>

            <tbody>
              {(quote.sales_quote_items || [])
                .map((item, index) => (
                  <tr key={item.id}>
                    <td>{index + 1}</td>

                    <td>
                      {item.product_name}
                    </td>

                    <td>
                      {item.sku
                        || item.barcode
                        || "—"}
                    </td>

                    <td>
                      {stockNumber(item.quantity)}
                      {" "}
                      {item.sale_unit_name}
                    </td>

                    <td>
                      {money(
                        item.unit_price,
                        quote.currency
                      )}
                    </td>

                    <td>
                      {money(
                        item.discount_amount,
                        quote.currency
                      )}
                    </td>

                    <td>
                      {money(
                        item.line_total,
                        quote.currency
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>

          <section className="quote-print-bottom">
            <div className="quote-print-notes">
              {quote.notes && (
                <p>
                  <strong>Note:</strong>
                  {" "}
                  {quote.notes}
                </p>
              )}

              {quote.terms && (
                <p>
                  <strong>Terms:</strong>
                  {" "}
                  {quote.terms}
                </p>
              )}

              {quote.cancel_reason && (
                <p>
                  <strong>Cancellation:</strong>
                  {" "}
                  {quote.cancel_reason}
                </p>
              )}
            </div>

            <div className="quote-print-totals">
              <div>
                <span>Subtotal</span>
                <strong>
                  {money(
                    quote.subtotal,
                    quote.currency
                  )}
                </strong>
              </div>

              <div>
                <span>
                  {quote.coupon_code
                    ? `Coupon ${quote.coupon_code}`
                    : "Discount"}
                </span>
                <strong>
                  -{money(
                    quote.discount_amount,
                    quote.currency
                  )}
                </strong>
              </div>

              <div>
                <span>Tax</span>
                <strong>
                  {money(
                    quote.tax_amount,
                    quote.currency
                  )}
                </strong>
              </div>

              <div className="quote-print-grand">
                <span>Quotation total</span>
                <strong>
                  {money(
                    quote.total_amount,
                    quote.currency
                  )}
                </strong>
              </div>
            </div>
          </section>

          <footer className="quote-print-footer">
            <p>
              This quotation does not reserve stock
              and is not a tax invoice or payment
              receipt.
            </p>

            <div>
              <span>Prepared by</span>
              <span>Customer approval</span>
            </div>
          </footer>
        </article>

        <div className="quote-print-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
          >
            Close
          </button>

          <button
            type="button"
            className="secondary-button"
            onClick={() => window.print()}
          >
            <Printer size={18} />
            Print quotation
          </button>

          {quoteCanConvert(quote) && (
            <button
              type="button"
              className="primary-button"
              onClick={() => onConvert(quote)}
            >
              <ShoppingCart size={18} />
              Open in New Sale
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
