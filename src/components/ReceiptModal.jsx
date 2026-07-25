import { Printer } from "lucide-react";
import Modal from "./Modal";
import { money, stockNumber } from "../lib/catalog";

function dateTime(value) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export default function ReceiptModal({ receipt, onClose }) {
  if (!receipt) return null;

  return (
    <Modal title="Sale completed" onClose={onClose}>
      <div className="receipt-wrapper">
        <article className="receipt-document">
          <div className="receipt-shop">
            <h2>{receipt.shopName}</h2>
            {receipt.shopAddress && <p>{receipt.shopAddress}</p>}
            {receipt.shopPhone && <p>{receipt.shopPhone}</p>}
          </div>

          <div className="receipt-meta">
            <div><span>Invoice</span><strong>{receipt.invoiceNumber}</strong></div>
            <div><span>Date</span><strong>{dateTime(receipt.completedAt)}</strong></div>
            <div><span>Cashier</span><strong>{receipt.cashierName}</strong></div>
            <div><span>Customer</span><strong>{receipt.customerName || "Walk-in"}</strong></div>
          </div>

          <div className="receipt-lines">
            {receipt.cart.map((item) => (
              <div key={item.id}>
                <span>
                  <strong>{item.name}</strong>
                  <small>{stockNumber(item.quantity)} × {money(item.selling_price, item.currency)}</small>
                </span>
                <strong>{money(Number(item.quantity) * Number(item.selling_price), item.currency)}</strong>
              </div>
            ))}
          </div>

          <div className="receipt-totals">
            <div><span>Subtotal</span><strong>{money(receipt.subtotal, receipt.currency)}</strong></div>
            <div><span>Discount</span><strong>-{money(receipt.discountAmount, receipt.currency)}</strong></div>
            {Number(receipt.taxAmount) > 0 && (
              <div><span>Tax</span><strong>{money(receipt.taxAmount, receipt.currency)}</strong></div>
            )}
            <div className="receipt-grand-total"><span>Total</span><strong>{money(receipt.totalAmount, receipt.currency)}</strong></div>
            <div><span>Payment</span><strong>{receipt.paymentMethod.toUpperCase()}</strong></div>
            <div><span>Received</span><strong>{money(receipt.amountReceived, receipt.currency)}</strong></div>
            <div><span>Change</span><strong>{money(receipt.changeAmount, receipt.currency)}</strong></div>
          </div>

          <div className="receipt-footer">{receipt.footer || "Thank you for your purchase."}</div>
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
