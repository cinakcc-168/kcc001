import { Printer } from "lucide-react";
import Modal from "./Modal";
import ProductBarcode from "./ProductBarcode";
import { useAuth } from "../context/AuthContext";
import { money, stockNumber } from "../lib/catalog";

function dateTime(value) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function dateOnly(value) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium"
  }).format(
    new Date(`${String(value).slice(0, 10)}T00:00:00`)
  );
}

export default function ReceiptModal({ receipt, onClose }) {
  const { shop } = useAuth();

  if (!receipt) return null;

  const receiptWidth = Number(shop?.receipt_width_mm || 80);
  const showLogo = shop?.receipt_show_logo !== false;
  const showAddress = shop?.receipt_show_address !== false;
  const showPhone = shop?.receipt_show_phone !== false;
  const showCustomer = shop?.receipt_show_customer !== false;
  const showCashier = shop?.receipt_show_cashier !== false;
  const showBarcode = shop?.receipt_show_barcode !== false;

  return (
    <Modal title="Sale completed" onClose={onClose}>
      <div className="receipt-wrapper">
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
            {shop?.tax_id && <p>Tax ID: {shop.tax_id}</p>}
          </div>

          <div className="receipt-meta">
            <div><span>Invoice</span><strong>{receipt.invoiceNumber}</strong></div>
          {receipt.sourceQuoteNumber && (
            <div>
              <span>Quotation</span>
              <strong>{receipt.sourceQuoteNumber}</strong>
            </div>
          )}
          {receipt.sourceSalesOrderNumber && (
            <div>
              <span>Sales Order</span>
              <strong>{receipt.sourceSalesOrderNumber}</strong>
            </div>
          )}
          {receipt.sourceDeliveryNumber && (
            <div>
              <span>Delivery Note</span>
              <strong>{receipt.sourceDeliveryNumber}</strong>
            </div>
          )}
            <div><span>Date</span><strong>{dateTime(receipt.completedAt)}</strong></div>
            {receipt.saleStatus && receipt.saleStatus !== "completed" && (
              <div>
                <span>Status</span>
                <strong>
                  {String(receipt.saleStatus)
                    .replaceAll("_", " ")
                    .toUpperCase()}
                </strong>
              </div>
            )}
            {showCashier && (
              <div><span>Cashier</span><strong>{receipt.cashierName}</strong></div>
            )}
            {showCustomer && (
              <div>
                <span>Customer</span>
                <strong>{receipt.customerName || "Walk-in"}</strong>
              </div>
            )}
            {showCustomer && receipt.customerName && (
              <div>
                <span>Customer profile</span>
                <strong>
                  {[receipt.customerCode, receipt.customerType]
                    .filter(Boolean)
                    .join(" · ")}
                </strong>
              </div>
            )}
            {receipt.priceListName && (
              <div>
                <span>Price list</span>
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
                  <strong>{item.name}</strong>
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
            <div><span>Subtotal</span><strong>{money(receipt.subtotal, receipt.currency)}</strong></div>
            {Number(receipt.priceAdjustmentAmount || 0) !== 0 && (
              <div>
                <span>
                  {Number(receipt.priceAdjustmentAmount) > 0
                    ? "Price-list savings"
                    : "Price-list markup"}
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
            <div><span>Discount</span><strong>-{money(receipt.discountAmount, receipt.currency)}</strong></div>
            {Number(receipt.taxAmount) > 0 && (
              <div><span>Tax</span><strong>{money(receipt.taxAmount, receipt.currency)}</strong></div>
            )}
            <div className="receipt-grand-total">
              <span>Total</span><strong>{money(receipt.totalAmount, receipt.currency)}</strong>
            </div>
            {Number(receipt.refundedAmount || 0) > 0 && (
              <>
                <div>
                  <span>Refunded</span>
                  <strong>
                    -{money(receipt.refundedAmount, receipt.currency)}
                  </strong>
                </div>
                <div>
                  <span>Net after refunds</span>
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
            <div><span>Payment</span><strong>{receipt.paymentMethod.toUpperCase()}</strong></div>
            {receipt.paymentMethod === "credit" ? (
              <>
                <div>
                  <span>Paid now</span>
                  <strong>{money(0, receipt.currency)}</strong>
                </div>
                <div>
                  <span>Credit due date</span>
                  <strong>{dateOnly(receipt.creditDueDate)}</strong>
                </div>
                {receipt.creditOutstanding !== null
                  && receipt.creditOutstanding !== undefined && (
                  <div>
                    <span>Invoice outstanding</span>
                    <strong>
                      {money(
                        receipt.creditOutstanding,
                        receipt.currency
                      )}
                    </strong>
                  </div>
                )}
                <div>
                  <span>
                    {receipt.creditBalanceAfter !== null
                      && receipt.creditBalanceAfter !== undefined
                      ? "Customer account balance"
                      : "Invoice credit amount"}
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
            ) : (
              <>
                <div><span>Received</span><strong>{money(receipt.amountReceived, receipt.currency)}</strong></div>
                <div><span>Change</span><strong>{money(receipt.changeAmount, receipt.currency)}</strong></div>
              </>
            )}
          </div>

          <div className="receipt-footer">
            {shop?.receipt_footer || receipt.footer || "Thank you for your purchase."}
          </div>
        </article>

        <div className="receipt-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Close</button>
          <button type="button" className="primary-button" onClick={() => window.print()}>
            <Printer size={18} /> Print receipt
          </button>
        </div>
      </div>
    </Modal>
  );
}
