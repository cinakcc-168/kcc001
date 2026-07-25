import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Eye,
  Printer,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  Search
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import ReceiptModal from "../components/ReceiptModal";
import RefundModal from "../components/RefundModal";
import ReturnReceiptModal from "../components/ReturnReceiptModal";
import { money, stockNumber } from "../lib/catalog";
import {
  defaultReturnDateRange,
  loadReturnsWorkspace,
  processSaleReturn
} from "../lib/returns";

function dateTime(value) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function searchableSale(sale) {
  return [
    sale.invoice_number,
    sale.customers?.name,
    sale.customers?.phone,
    ...(sale.sale_items || []).flatMap((item) => [
      item.product_name,
      item.barcode
    ])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function searchableReturn(refund) {
  return [
    refund.return_number,
    refund.sales?.invoice_number,
    refund.sales?.customers?.name,
    refund.sales?.customers?.phone,
    refund.reason,
    ...(refund.return_items || []).flatMap((item) => [
      item.sale_items?.product_name,
      item.sale_items?.barcode
    ])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export default function ReturnsPage() {
  const { supabase, profile, shop } = useAuth();
  const canRefund = ["owner", "admin", "manager"].includes(profile?.role);

  const [filters, setFilters] = useState(defaultReturnDateRange);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("sales");
  const [sales, setSales] = useState([]);
  const [returns, setReturns] = useState([]);
  const [selectedSale, setSelectedSale] = useState(null);
  const [refundReceipt, setRefundReceipt] = useState(null);
  const [saleReceipt, setSaleReceipt] = useState(null);
  const [historyReceipt, setHistoryReceipt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");

  const refresh = useCallback(async () => {
    if (!supabase || !profile?.organization_id || !profile?.branch_id) {
      return;
    }

    try {
      setLoading(true);
      const data = await loadReturnsWorkspace(
        supabase,
        profile,
        filters
      );
      setSales(data.sales);
      setReturns(data.returns);
    } catch (error) {
      setMessageType("error");
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }, [supabase, profile, filters]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filteredSales = useMemo(() => {
    const needle = search.trim().toLowerCase();

    if (!needle) return sales;

    return sales.filter((sale) =>
      searchableSale(sale).includes(needle)
    );
  }, [sales, search]);

  const filteredReturns = useMemo(() => {
    const needle = search.trim().toLowerCase();

    if (!needle) return returns;

    return returns.filter((refund) =>
      searchableReturn(refund).includes(needle)
    );
  }, [returns, search]);

  function openSaleReceipt(sale) {
    const payment = sale.payments?.[0];

    setSaleReceipt({
      invoiceNumber: sale.invoice_number,
      completedAt: sale.completed_at || sale.created_at,
      shopName: shop?.shop_name || "Tiny POS",
      shopPhone: shop?.shop_phone,
      shopAddress: shop?.shop_address,
      footer: shop?.receipt_footer,
      cashierName: "POS Staff",
      customerName: sale.customers?.name,
      cart: (sale.sale_items || []).map((item) => ({
        id: item.id,
        name: item.product_name,
        quantity: Number(item.quantity),
        selling_price: Number(item.unit_price),
        currency: sale.currency
      })),
      subtotal: Number(sale.subtotal || 0),
      discountAmount: Number(sale.discount_amount || 0),
      taxAmount: Number(sale.tax_amount || 0),
      totalAmount: Number(sale.total_amount || 0),
      amountReceived: Number(
        payment?.tendered_amount || sale.paid_amount || 0
      ),
      changeAmount: Number(
        payment?.change_amount || sale.change_amount || 0
      ),
      paymentMethod: payment?.method || "other",
      currency: sale.currency
    });
  }

  function buildHistoryReceipt(refund) {
    return {
      returnNumber: refund.return_number,
      invoiceNumber: refund.sales?.invoice_number || "—",
      processedAt: refund.processed_at,
      processedBy: "POS Staff",
      customerName: refund.sales?.customers?.name,
      shopName: shop?.shop_name || "Tiny POS",
      shopPhone: shop?.shop_phone,
      shopAddress: shop?.shop_address,
      currency: refund.currency,
      refundAmount: Number(refund.refund_amount || 0),
      taxRefund: Number(refund.tax_refund || 0),
      refundMethod: refund.refund_method,
      refundReference: refund.refund_reference,
      reason: refund.reason,
      items: (refund.return_items || []).map((item) => ({
        sale_item_id: item.sale_item_id,
        product_name:
          item.sale_items?.product_name || "Returned item",
        quantity: Number(item.quantity || 0),
        unit_refund: Number(item.unit_refund || 0),
        line_refund: Number(item.line_refund || 0),
        restock: Boolean(item.restock)
      }))
    };
  }

  async function submitRefund(values) {
    if (!selectedSale) return;

    try {
      setBusy(true);
      setMessage("");

      const result = await processSaleReturn(supabase, values);

      const receiptItems = values.items.map((selected) => {
        const saleItem = selectedSale.sale_items.find(
          (item) => item.id === selected.sale_item_id
        );

        const portion =
          Number(saleItem?.quantity || 0) > 0
            ? Number(selected.quantity)
              / Number(saleItem.quantity)
            : 0;

        const lineNet =
          Number(saleItem?.line_total || 0) * portion;
        const totalSaleLines = selectedSale.sale_items.reduce(
          (sum, item) => sum + Number(item.line_total || 0),
          0
        );
        const lineTax =
          totalSaleLines > 0
            ? Number(selectedSale.tax_amount || 0)
              * (Number(saleItem?.line_total || 0) / totalSaleLines)
              * portion
            : 0;
        const lineRefund =
          Math.round((lineNet + lineTax + Number.EPSILON) * 100)
          / 100;

        return {
          sale_item_id: selected.sale_item_id,
          product_name: saleItem?.product_name || "Returned item",
          quantity: Number(selected.quantity),
          unit_refund:
            Number(selected.quantity) > 0
              ? lineRefund / Number(selected.quantity)
              : 0,
          line_refund: lineRefund,
          restock: selected.restock
        };
      });

      setRefundReceipt({
        returnNumber: result.return_number,
        invoiceNumber: result.invoice_number,
        processedAt: result.processed_at,
        processedBy: profile.full_name || "POS Staff",
        customerName: selectedSale.customers?.name,
        shopName: shop?.shop_name || "Tiny POS",
        shopPhone: shop?.shop_phone,
        shopAddress: shop?.shop_address,
        currency: result.currency,
        refundAmount: Number(result.refund_amount || 0),
        taxRefund: Number(result.tax_refund || 0),
        refundMethod: values.refund_method,
        refundReference: values.refund_reference,
        reason: values.reason,
        items: receiptItems
      });

      setSelectedSale(null);
      setMessageType("success");
      setMessage(
        `${result.return_number} completed. Refunded ${money(
          result.refund_amount,
          result.currency
        )}.`
      );
      await refresh();
    } catch (error) {
      setMessageType("error");
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  if (!canRefund) {
    return (
      <section className="panel empty-state">
        <RotateCcw size={46} />
        <h2>Refund access is restricted</h2>
        <p>
          Only an owner, admin, or manager can open Returns & Refunds.
        </p>
      </section>
    );
  }

  return (
    <div className="page-stack returns-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">AFTER-SALES</p>
          <h1>Returns & Refunds</h1>
          <p className="muted">
            Find an invoice, refund selected quantities, and optionally
            return products to stock.
          </p>
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={refresh}
          disabled={loading}
        >
          <RefreshCw
            size={18}
            className={loading ? "spin" : ""}
          />
          Refresh
        </button>
      </div>

      {message && (
        <div className={`notice ${messageType}`}>
          {message}
        </div>
      )}

      <section className="panel returns-toolbar">
        <div className="search-box">
          <Search size={18} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search invoice, customer, phone, product or barcode"
          />
        </div>

        <label>
          <span>From</span>
          <input
            type="date"
            value={filters.from}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                from: event.target.value
              }))
            }
          />
        </label>

        <label>
          <span>To</span>
          <input
            type="date"
            value={filters.to}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                to: event.target.value
              }))
            }
          />
        </label>
      </section>

      <div className="returns-tabs">
        <button
          type="button"
          className={tab === "sales" ? "active" : ""}
          onClick={() => setTab("sales")}
        >
          <ReceiptText size={18} />
          Returnable sales
          <span>{filteredSales.length}</span>
        </button>
        <button
          type="button"
          className={tab === "history" ? "active" : ""}
          onClick={() => setTab("history")}
        >
          <CalendarDays size={18} />
          Refund history
          <span>{filteredReturns.length}</span>
        </button>
      </div>

      {tab === "sales" ? (
        <section className="panel return-sales-panel">
          {loading ? (
            <div className="empty-state">
              <RefreshCw className="spin" />
              <p>Loading sales...</p>
            </div>
          ) : filteredSales.length === 0 ? (
            <div className="empty-state">
              <ReceiptText size={44} />
              <h2>No sales found</h2>
              <p>Change the date range or search text.</p>
            </div>
          ) : (
            <div className="return-sales-list">
              {filteredSales.map((sale) => {
                const remainingItems = sale.sale_items.filter(
                  (item) => Number(item.returnable_quantity || 0) > 0
                );
                const fullyRefunded = remainingItems.length === 0;

                return (
                  <article className="return-sale-card" key={sale.id}>
                    <div className="return-sale-main">
                      <div>
                        <strong>{sale.invoice_number}</strong>
                        <span>
                          {dateTime(sale.completed_at || sale.created_at)}
                        </span>
                      </div>
                      <span
                        className={`status-pill ${
                          fullyRefunded ? "inactive" : "active"
                        }`}
                      >
                        {String(sale.status).replaceAll("_", " ")}
                      </span>
                    </div>

                    <div className="return-sale-info">
                      <div>
                        <span>Customer</span>
                        <strong>
                          {sale.customers?.name || "Walk-in"}
                        </strong>
                      </div>
                      <div>
                        <span>Total</span>
                        <strong>
                          {money(sale.total_amount, sale.currency)}
                        </strong>
                      </div>
                      <div>
                        <span>Refunded</span>
                        <strong>
                          {money(sale.refunded_amount, sale.currency)}
                        </strong>
                      </div>
                      <div>
                        <span>Returnable lines</span>
                        <strong>{remainingItems.length}</strong>
                      </div>
                    </div>

                    <div className="return-sale-items">
                      {sale.sale_items.map((item) => (
                        <div key={item.id}>
                          <span>
                            <strong>{item.product_name}</strong>
                            <small>
                              Sold {stockNumber(item.quantity)}
                              {" · "}
                              Returned {stockNumber(item.returned_quantity)}
                            </small>
                          </span>
                          <strong>
                            {stockNumber(item.returnable_quantity)} left
                          </strong>
                        </div>
                      ))}
                    </div>

                    <div className="return-sale-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => openSaleReceipt(sale)}
                      >
                        <Printer size={17} />
                        Original receipt
                      </button>
                      <button
                        type="button"
                        className="danger-button"
                        disabled={fullyRefunded}
                        onClick={() => setSelectedSale(sale)}
                      >
                        <RotateCcw size={17} />
                        {fullyRefunded ? "Fully refunded" : "Refund items"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      ) : (
        <section className="panel return-history-panel">
          {loading ? (
            <div className="empty-state">
              <RefreshCw className="spin" />
              <p>Loading refunds...</p>
            </div>
          ) : filteredReturns.length === 0 ? (
            <div className="empty-state">
              <RotateCcw size={44} />
              <h2>No refunds found</h2>
              <p>There are no refunds in this date range.</p>
            </div>
          ) : (
            <div className="return-history-table-wrap">
              <table className="return-history-table">
                <thead>
                  <tr>
                    <th>Return</th>
                    <th>Original invoice</th>
                    <th>Customer</th>
                    <th>Date</th>
                    <th>Method</th>
                    <th>Amount</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filteredReturns.map((refund) => (
                    <tr key={refund.id}>
                      <td data-label="Return">
                        <strong>{refund.return_number}</strong>
                      </td>
                      <td data-label="Original invoice">
                        {refund.sales?.invoice_number || "—"}
                      </td>
                      <td data-label="Customer">
                        {refund.sales?.customers?.name || "Walk-in"}
                      </td>
                      <td data-label="Date">
                        {dateTime(refund.processed_at)}
                      </td>
                      <td data-label="Method">
                        {String(refund.refund_method).toUpperCase()}
                      </td>
                      <td data-label="Amount">
                        <strong>
                          {money(refund.refund_amount, refund.currency)}
                        </strong>
                      </td>
                      <td data-label="Receipt">
                        <button
                          type="button"
                          className="icon-button"
                          title="View refund receipt"
                          onClick={() =>
                            setHistoryReceipt(
                              buildHistoryReceipt(refund)
                            )
                          }
                        >
                          <Eye size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <RefundModal
        sale={selectedSale}
        busy={busy}
        onClose={() => setSelectedSale(null)}
        onSubmit={submitRefund}
      />

      <ReceiptModal
        receipt={saleReceipt}
        onClose={() => setSaleReceipt(null)}
      />

      <ReturnReceiptModal
        receipt={refundReceipt || historyReceipt}
        onClose={() => {
          setRefundReceipt(null);
          setHistoryReceipt(null);
        }}
      />
    </div>
  );
}
