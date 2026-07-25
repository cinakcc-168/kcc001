import { Printer } from "lucide-react";
import Modal from "./Modal";
import ProductBarcode from "./ProductBarcode";
import { useAuth } from "../context/AuthContext";
import { money, stockNumber } from "../lib/catalog";

function dateTime(value) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export default function ReturnReceiptModal({ receipt, onClose }) {
  const { shop } = useAuth();

  if (!receipt) return null;

  const receiptWidth = Number(shop?.receipt_width_mm || 80);

  return (
    <Modal title="Refund completed" onClose={onClose}>
      <div className="receipt-wrapper">
        <article
          className="receipt-document return-receipt-document"
          style={{ "--receipt-width": `${receiptWidth}mm` }}
        >
          <div className="receipt-shop">
            {shop?.receipt_show_logo !== false && shop?.shop_logo_url && (
              <img className="receipt-logo" src={shop.shop_logo_url} alt="" />
            )}
            <h2>{shop?.shop_name || receipt.shopName}</h2>
            <strong>RETURN / REFUND RECEIPT</strong>
            {shop?.receipt_show_address !== false && (shop?.shop_address || receipt.shopAddress) && (
              <p>{shop?.shop_address || receipt.shopAddress}</p>
            )}
            {shop?.receipt_show_phone !== false && (shop?.shop_phone || receipt.shopPhone) && (
              <p>{shop?.shop_phone || receipt.shopPhone}</p>
            )}
          </div>

          <div className="receipt-meta">
            <div><span>Return</span><strong>{receipt.returnNumber}</strong></div>
            <div><span>Original invoice</span><strong>{receipt.invoiceNumber}</strong></div>
            <div><span>Date</span><strong>{dateTime(receipt.processedAt)}</strong></div>
            {shop?.receipt_show_cashier !== false && (
              <div><span>Processed by</span><strong>{receipt.processedBy}</strong></div>
            )}
            {shop?.receipt_show_customer !== false && (
              <div><span>Customer</span><strong>{receipt.customerName || "Walk-in"}</strong></div>
            )}
          </div>

          {shop?.receipt_show_barcode !== false && (
            <div className="receipt-invoice-barcode">
              <ProductBarcode value={receipt.returnNumber} format="CODE128" height={28} width={1.15} />
              <small>{receipt.returnNumber}</small>
            </div>
          )}

          <div className="receipt-lines">
            {(receipt.items || []).map((item) => (
              <div key={`${item.sale_item_id}-${item.product_name}`}>
                <span>
                  <strong>{item.product_name}</strong>
                  <small>
                    {stockNumber(item.quantity)} × {money(item.unit_refund, receipt.currency)}
                    {item.restock ? " · Restocked" : " · Not restocked"}
                  </small>
                </span>
                <strong>-{money(item.line_refund, receipt.currency)}</strong>
              </div>
            ))}
          </div>

          <div className="receipt-totals">
            {Number(receipt.taxRefund || 0) > 0 && (
              <div><span>Tax included</span><strong>{money(receipt.taxRefund, receipt.currency)}</strong></div>
            )}
            <div className="receipt-grand-total">
              <span>Total refunded</span>
              <strong>-{money(receipt.refundAmount, receipt.currency)}</strong>
            </div>
            <div><span>Refund method</span><strong>{String(receipt.refundMethod).toUpperCase()}</strong></div>
            {receipt.refundReference && (
              <div><span>Reference</span><strong>{receipt.refundReference}</strong></div>
            )}
          </div>

          <div className="return-reason">
            <strong>Reason</strong>
            <p>{receipt.reason}</p>
          </div>

          <div className="receipt-footer">
            {shop?.receipt_footer || "Refund processed by Tiny POS"}
          </div>
        </article>

        <div className="receipt-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Close</button>
          <button type="button" className="primary-button" onClick={() => window.print()}>
            <Printer size={18} /> Print refund receipt
          </button>
        </div>
      </div>
    </Modal>
  );
}
