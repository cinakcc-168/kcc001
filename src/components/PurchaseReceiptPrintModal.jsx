import { Printer } from "lucide-react";
import Modal from "./Modal";
import {
  money,
  stockNumber
} from "../lib/catalog";
import { dateTime } from "../lib/purchaseOrders";

export default function PurchaseReceiptPrintModal({
  receipt,
  purchase,
  shop,
  branch,
  onClose
}) {
  if (!receipt || !purchase) return null;

  const receiptValue = (
    receipt.purchase_receipt_items || []
  ).reduce(
    (sum, item) =>
      sum + Number(item.line_total || 0),
    0
  );

  return (
    <Modal
      title={receipt.receipt_number}
      onClose={onClose}
      wide
    >
      <div className="grn-print-wrapper">
        <article className="grn-print-document">
          <header className="grn-print-header">
            <div className="grn-print-shop">
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
              </div>
            </div>

            <div className="grn-print-title">
              <strong>GOODS RECEIVED NOTE</strong>
              <span>{receipt.receipt_number}</span>
            </div>
          </header>

          <section className="grn-print-meta">
            <div>
              <span>Purchase order</span>
              <strong>
                {purchase.purchase_number}
              </strong>
            </div>

            <div>
              <span>Supplier</span>
              <strong>
                {purchase.suppliers?.name || "—"}
              </strong>
            </div>

            <div>
              <span>Branch</span>
              <strong>
                {branch?.name || "Current branch"}
              </strong>
            </div>

            <div>
              <span>Received</span>
              <strong>
                {dateTime(receipt.received_at)}
              </strong>
            </div>

            <div>
              <span>Supplier invoice</span>
              <strong>
                {receipt.supplier_invoice_number || "—"}
              </strong>
            </div>

            <div>
              <span>Currency</span>
              <strong>{purchase.currency}</strong>
            </div>
          </section>

          <table className="grn-print-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Product</th>
                <th>Code</th>
                <th>Received quantity</th>
                <th>Base quantity</th>
                <th>Cost</th>
                <th>Total</th>
              </tr>
            </thead>

            <tbody>
              {(
                receipt.purchase_receipt_items || []
              ).map((item, index) => (
                <tr key={item.id}>
                  <td>{index + 1}</td>
                  <td>
                    {item.products?.name || "Product"}
                  </td>
                  <td>
                    {item.products?.sku
                      || item.products?.barcode
                      || "—"}
                  </td>
                  <td>
                    {stockNumber(item.quantity)}{" "}
                    {item.purchase_unit_name}
                  </td>
                  <td>
                    {stockNumber(item.base_quantity)}{" "}
                    {item.products?.unit_name || "pcs"}
                  </td>
                  <td>
                    {money(
                      item.unit_cost,
                      purchase.currency
                    )}
                  </td>
                  <td>
                    {money(
                      item.line_total,
                      purchase.currency
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <section className="grn-print-bottom">
            <div>
              {receipt.notes && (
                <p>
                  <strong>Receiving notes:</strong>{" "}
                  {receipt.notes}
                </p>
              )}
            </div>

            <div>
              <span>Goods-received value</span>
              <strong>
                {money(
                  receiptValue,
                  purchase.currency
                )}
              </strong>
            </div>
          </section>

          <footer className="grn-print-signatures">
            <div><span>Received by</span></div>
            <div><span>Checked by</span></div>
            <div><span>Supplier / Driver</span></div>
          </footer>
        </article>

        <div className="grn-print-actions">
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
            Print goods-received note
          </button>
        </div>
      </div>
    </Modal>
  );
}
