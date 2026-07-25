import { Printer } from "lucide-react";
import Modal from "./Modal";
import { money, stockNumber } from "../lib/catalog";

function dateTime(value) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export default function ReturnReceiptModal({ receipt, onClose }) {
  if (!receipt) return null;

  return (
    <Modal title="Refund completed" onClose={onClose}>
      <div className="receipt-wrapper">
        <article className="receipt-document return-receipt-document">
          <div className="receipt-shop">
            <h2>{receipt.shopName}</h2>
            <strong>RETURN / REFUND RECEIPT</strong>
            {receipt.shopAddress && <p>{receipt.shopAddress}</p>}
            {receipt.shopPhone && <p>{receipt.shopPhone}</p>}
          </div>

          <div className="receipt-meta">
            <div>
              <span>Return</span>
              <strong>{receipt.returnNumber}</strong>
            </div>
            <div>
              <span>Original invoice</span>
              <strong>{receipt.invoiceNumber}</strong>
            </div>
            <div>
              <span>Date</span>
              <strong>{dateTime(receipt.processedAt)}</strong>
            </div>
            <div>
              <span>Processed by</span>
              <strong>{receipt.processedBy}</strong>
            </div>
            <div>
              <span>Customer</span>
              <strong>{receipt.customerName || "Walk-in"}</strong>
            </div>
          </div>

          <div className="receipt-lines">
            {(receipt.items || []).map((item) => (
              <div key={`${item.sale_item_id}-${item.product_name}`}>
                <span>
                  <strong>{item.product_name}</strong>
                  <small>
                    {stockNumber(item.quantity)}
                    {" × "}
                    {money(item.unit_refund, receipt.currency)}
                    {item.restock ? " · Restocked" : " · Not restocked"}
                  </small>
                </span>
                <strong>
                  -{money(item.line_refund, receipt.currency)}
                </strong>
              </div>
            ))}
          </div>

          <div className="receipt-totals">
            {Number(receipt.taxRefund || 0) > 0 && (
              <div>
                <span>Tax included</span>
                <strong>{money(receipt.taxRefund, receipt.currency)}</strong>
              </div>
            )}
            <div className="receipt-grand-total">
              <span>Total refunded</span>
              <strong>
                -{money(receipt.refundAmount, receipt.currency)}
              </strong>
            </div>
            <div>
              <span>Refund method</span>
              <strong>{String(receipt.refundMethod).toUpperCase()}</strong>
            </div>
            {receipt.refundReference && (
              <div>
                <span>Reference</span>
                <strong>{receipt.refundReference}</strong>
              </div>
            )}
          </div>

          <div className="return-reason">
            <strong>Reason</strong>
            <p>{receipt.reason}</p>
          </div>

          <div className="receipt-footer">
            Refund processed by Tiny POS
          </div>
        </article>

        <div className="receipt-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
          >
            Close
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => window.print()}
          >
            <Printer size={18} />
            Print refund receipt
          </button>
        </div>
      </div>
    </Modal>
  );
}
