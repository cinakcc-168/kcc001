import { Printer } from "lucide-react";
import Modal from "./Modal";
import { money, stockNumber } from "../lib/catalog";
import { dateOnly, dateTime, purchaseBalance, purchasePaymentStatus } from "../lib/purchaseOrders";

export default function PurchaseOrderPrintModal({ purchase, shop, branch, onClose }) {
  if (!purchase) return null;

  return (
    <Modal title={purchase.purchase_number} onClose={onClose} wide>
      <div className="po-print-wrapper">
        <article className="po-print-document">
          <header className="po-print-header">
            <div className="po-print-shop">
              {shop?.shop_logo_url && <img src={shop.shop_logo_url} alt="" />}
              <div>
                <h2>{shop?.shop_name || "Tiny POS"}</h2>
                {shop?.shop_address && <p>{shop.shop_address}</p>}
                {shop?.shop_phone && <p>{shop.shop_phone}</p>}
                {shop?.shop_email && <p>{shop.shop_email}</p>}
              </div>
            </div>
            <div className="po-print-title">
              <strong>PURCHASE ORDER</strong>
              <span>{purchase.purchase_number}</span>
            </div>
          </header>

          <section className="po-print-parties">
            <div>
              <span>Supplier</span>
              <strong>{purchase.suppliers?.name || "—"}</strong>
              <p>{purchase.suppliers?.supplier_code || ""}</p>
              {purchase.suppliers?.contact_name && <p>{purchase.suppliers.contact_name}</p>}
              {purchase.suppliers?.phone && <p>{purchase.suppliers.phone}</p>}
              {purchase.suppliers?.email && <p>{purchase.suppliers.email}</p>}
              {purchase.suppliers?.address && <p>{purchase.suppliers.address}</p>}
            </div>
            <div>
              <div><span>Branch</span><strong>{branch?.name || "Main Branch"}</strong></div>
              <div><span>Created</span><strong>{dateTime(purchase.created_at)}</strong></div>
              <div><span>Expected</span><strong>{dateOnly(purchase.expected_date)}</strong></div>
              <div><span>Status</span><strong>{String(purchase.status).toUpperCase()}</strong></div>
              <div><span>Payment</span><strong>{purchasePaymentStatus(purchase).toUpperCase()}</strong></div>
            </div>
          </section>

          <table className="po-print-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Product</th>
                <th>Code</th>
                <th>Qty</th>
                <th>Unit cost</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {(purchase.purchase_items || []).map((item, index) => (
                <tr key={item.id}>
                  <td>{index + 1}</td>
                  <td>{item.products?.name || "Product"}</td>
                  <td>{item.products?.sku || item.products?.barcode || "—"}</td>
                  <td>{stockNumber(item.quantity)} {item.products?.unit_name || "pcs"}</td>
                  <td>{money(item.unit_cost, purchase.currency)}</td>
                  <td>{money(item.line_total, purchase.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <section className="po-print-bottom">
            <div className="po-print-notes">
              {purchase.payment_terms && <p><strong>Payment terms:</strong> {purchase.payment_terms}</p>}
              {purchase.delivery_address && <p><strong>Delivery:</strong> {purchase.delivery_address}</p>}
              {purchase.supplier_invoice_number && <p><strong>Supplier invoice:</strong> {purchase.supplier_invoice_number}</p>}
              {purchase.notes && <p><strong>Notes:</strong> {purchase.notes}</p>}
            </div>
            <div className="po-print-totals">
              <div><span>Subtotal</span><strong>{money(purchase.subtotal, purchase.currency)}</strong></div>
              <div><span>Discount</span><strong>-{money(purchase.discount_amount, purchase.currency)}</strong></div>
              <div><span>Tax</span><strong>{money(purchase.tax_amount, purchase.currency)}</strong></div>
              <div className="po-print-grand"><span>Total</span><strong>{money(purchase.total_amount, purchase.currency)}</strong></div>
              <div><span>Paid</span><strong>{money(purchase.amount_paid, purchase.currency)}</strong></div>
              <div><span>Balance due</span><strong>{money(purchaseBalance(purchase), purchase.currency)}</strong></div>
            </div>
          </section>

          <footer className="po-print-signatures">
            <div><span>Prepared by</span></div>
            <div><span>Approved by</span></div>
            <div><span>Supplier signature</span></div>
          </footer>
        </article>

        <div className="po-print-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Close</button>
          <button type="button" className="primary-button" onClick={() => window.print()}>
            <Printer size={18} /> Print purchase order
          </button>
        </div>
      </div>
    </Modal>
  );
}
