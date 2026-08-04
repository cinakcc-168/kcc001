import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight,
  Ban,
  PackageCheck,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Truck
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import TransferFormModal from "../components/TransferFormModal";
import TransferActionModal from "../components/TransferActionModal";
import SupplierReturnModal from "../components/SupplierReturnModal";
import ResponsiveDataList from "../components/ResponsiveDataList";
import { money, stockNumber } from "../lib/catalog";
import {
  cancelStockTransfer,
  createStockTransfer,
  dateTime,
  loadTransferWorkspace,
  processSupplierReturn,
  receiveStockTransfer
} from "../lib/transfers";

function statusClass(status) {
  if (status === "received" || status === "completed") return "active";
  if (status === "cancelled") return "inactive";
  return "warning";
}

export default function TransfersPage() {
  const { supabase, profile, shop, canAny } = useAuth();
  const canManage = canAny([
    "transfers.create",
    "transfers.receive",
    "transfers.cancel"
  ]);

  const [tab, setTab] = useState("transfers");
  const [branches, setBranches] = useState([]);
  const [products, setProducts] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [supplierReturns, setSupplierReturns] = useState([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");
  const [newTransferOpen, setNewTransferOpen] = useState(false);
  const [transferAction, setTransferAction] = useState(null);
  const [supplierReturnOpen, setSupplierReturnOpen] = useState(false);

  const refresh = useCallback(async () => {
    if (!supabase || !profile?.organization_id || !profile?.branch_id) return;

    try {
      setLoading(true);
      const data = await loadTransferWorkspace(supabase, profile);
      setBranches(data.branches);
      setProducts(data.products);
      setTransfers(data.transfers);
      setPurchases(data.purchases);
      setSupplierReturns(data.supplierReturns);
    } catch (error) {
      setMessageType("error");
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }, [supabase, profile]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const visibleTransfers = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return transfers.filter((transfer) => {
      const searchable = [
        transfer.transfer_number,
        transfer.source_branch?.name,
        transfer.destination_branch?.name,
        transfer.notes,
        ...(transfer.stock_transfer_items || []).flatMap((item) => [
          item.products?.name,
          item.products?.sku,
          item.products?.barcode,
          item.return_unit_name
        ])
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return (
        (!needle || searchable.includes(needle)) &&
        (status === "all" || transfer.status === status)
      );
    });
  }, [transfers, search, status]);

  const visibleSupplierReturns = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return supplierReturns.filter((supplierReturn) => {
      const searchable = [
        supplierReturn.return_number,
        supplierReturn.purchases?.purchase_number,
        supplierReturn.suppliers?.name,
        supplierReturn.reason,
        supplierReturn.supplier_reference,
        ...(supplierReturn.purchase_return_items || []).flatMap((item) => [
          item.products?.name,
          item.products?.sku,
          item.products?.barcode,
          item.return_unit_name
        ])
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return !needle || searchable.includes(needle);
    });
  }, [supplierReturns, search]);

  const metrics = useMemo(() => {
    const pendingOutgoing = transfers.filter(
      (row) =>
        row.status === "pending" &&
        row.source_branch_id === profile?.branch_id
    );
    const pendingIncoming = transfers.filter(
      (row) =>
        row.status === "pending" &&
        row.destination_branch_id === profile?.branch_id
    );

    return {
      pendingOutgoing: pendingOutgoing.length,
      pendingIncoming: pendingIncoming.length,
      inTransitUnits: [...pendingOutgoing, ...pendingIncoming].reduce(
        (sum, transfer) =>
          sum +
          (transfer.stock_transfer_items || []).reduce(
            (itemSum, item) => itemSum + Number(item.quantity || 0),
            0
          ),
        0
      ),
      supplierReturnValue: supplierReturns.reduce(
        (sum, row) => sum + Number(row.total_amount || 0),
        0
      )
    };
  }, [transfers, supplierReturns, profile?.branch_id]);

  async function saveTransfer(values) {
    try {
      setBusy(true);
      const result = await createStockTransfer(supabase, values);
      setNewTransferOpen(false);
      setMessageType("success");
      setMessage(
        `${result.transfer_number} sent with ${stockNumber(result.total_units)} units in transit.`
      );
      await refresh();
    } catch (error) {
      setMessageType("error");
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveTransferAction(text) {
    if (!transferAction) return;

    try {
      setBusy(true);
      const result =
        transferAction.action === "receive"
          ? await receiveStockTransfer(
              supabase,
              transferAction.transfer.id,
              text
            )
          : await cancelStockTransfer(
              supabase,
              transferAction.transfer.id,
              text
            );

      setTransferAction(null);
      setMessageType("success");
      setMessage(
        `${result.transfer_number} ${result.status === "received" ? "received" : "cancelled"}.`
      );
      await refresh();
    } catch (error) {
      setMessageType("error");
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveSupplierReturn(values) {
    try {
      setBusy(true);
      const result = await processSupplierReturn(supabase, values);
      setSupplierReturnOpen(false);
      setMessageType("success");
      setMessage(
        `${result.return_number} completed for ${money(
          result.total_amount,
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

  if (!canManage) {
    return (
      <section className="panel empty-state">
        <ArrowLeftRight size={46} />
        <h2>Transfer access is restricted</h2>
        <p>Only an owner, admin, or manager can manage stock transfers.</p>
      </section>
    );
  }

  return (
    <div className="page-stack transfers-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">MULTI-BRANCH INVENTORY</p>
          <h1>Stock Transfers</h1>
          <p className="muted">
            Move stock between branches and return received products to suppliers.
          </p>
        </div>

        <div className="heading-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={refresh}
            disabled={loading}
          >
            <RefreshCw size={18} className={loading ? "spin" : ""} />
            Refresh
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => setNewTransferOpen(true)}
            disabled={branches.length < 2}
          >
            <Plus size={18} />
            New transfer
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`notice ${messageType}`}
          onClick={() => setMessage("")}
        >
          {message}
        </div>
      )}

      {branches.length < 2 && (
        <div className="notice warning">
          Create and activate at least two branches before making a stock transfer.
        </div>
      )}

      <div className="transfer-metrics">
        <article>
          <Truck size={21} />
          <span>Outgoing pending</span>
          <strong>{metrics.pendingOutgoing}</strong>
        </article>
        <article>
          <PackageCheck size={21} />
          <span>Waiting to receive</span>
          <strong>{metrics.pendingIncoming}</strong>
        </article>
        <article>
          <ArrowLeftRight size={21} />
          <span>Units in transit</span>
          <strong>{stockNumber(metrics.inTransitUnits)}</strong>
        </article>
        <article>
          <RotateCcw size={21} />
          <span>Supplier returns</span>
          <strong>
            {money(metrics.supplierReturnValue, shop?.base_currency || "USD")}
          </strong>
        </article>
      </div>

      <div className="transfer-tabs">
        <button
          type="button"
          className={tab === "transfers" ? "active" : ""}
          onClick={() => setTab("transfers")}
        >
          <ArrowLeftRight size={18} />
          Branch transfers
          <span>{visibleTransfers.length}</span>
        </button>
        <button
          type="button"
          className={tab === "supplier" ? "active" : ""}
          onClick={() => setTab("supplier")}
        >
          <RotateCcw size={18} />
          Supplier returns
          <span>{visibleSupplierReturns.length}</span>
        </button>
      </div>

      <section className="panel transfer-toolbar">
        <label className="search-box">
          <Search size={18} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={
              tab === "transfers"
                ? "Search transfer, branch, product or barcode"
                : "Search return, purchase, supplier or product"
            }
          />
        </label>

        {tab === "transfers" && (
          <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter transfers by status">
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="received">Received</option>
            <option value="cancelled">Cancelled</option>
          </select>
        )}
      </section>

      {tab === "transfers" ? (
        <ResponsiveDataList
          storageKey="stock-transfers"
          title="Branch transfer list"
          subtitle={`${profile?.branches?.name || "Current branch"} · Current search and status filters`}
          rows={visibleTransfers}
          filename={`tiny-pos-stock-transfers-${new Date().toISOString().slice(0, 10)}.xls`}
          summary={[
            { label: "Outgoing pending", value: metrics.pendingOutgoing },
            { label: "Waiting to receive", value: metrics.pendingIncoming },
            { label: "Units in transit", value: stockNumber(metrics.inTransitUnits) }
          ]}
          emptyTitle={loading ? "Loading transfers..." : "No matching stock transfers"}
          emptyText="Create a transfer or change the current search and status filters."
          columns={[
            { label: "Transfer", width: 170, documentValue: (transfer) => transfer.transfer_number, render: (transfer) => <><strong>{transfer.transfer_number}</strong><small>{dateTime(transfer.created_at)}</small></> },
            { label: "From", width: 150, value: (transfer) => transfer.source_branch?.name || "Source" },
            { label: "To", width: 150, value: (transfer) => transfer.destination_branch?.name || "Destination" },
            { label: "Products", width: 300, documentValue: (transfer) => (transfer.stock_transfer_items || []).map((item) => `${item.products?.name || "Product"}: ${stockNumber(item.quantity)} ${item.products?.unit_name || "pcs"}`).join("; "), render: (transfer) => <div className="compact-list transfer-table-lines">{(transfer.stock_transfer_items || []).map((item) => <div key={item.id}><span><strong>{item.products?.name || "Product"}</strong><small>{item.products?.sku || item.products?.barcode || "No code"}</small></span><strong>{stockNumber(item.quantity)} {item.products?.unit_name || "pcs"}</strong></div>)}</div> },
            { label: "Total units", width: 100, value: (transfer) => stockNumber((transfer.stock_transfer_items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0)) },
            { label: "Status", width: 100, documentValue: (transfer) => transfer.status, render: (transfer) => <span className={`status-pill ${statusClass(transfer.status)}`}>{transfer.status}</span> },
            { label: "Notes", width: 220, value: (transfer) => transfer.receive_notes || transfer.cancel_reason || transfer.notes || "—" },
            { label: "Actions", actionsOnly: true, excludeDocument: true, render: (transfer) => {
              const outgoing = transfer.source_branch_id === profile.branch_id;
              const canReceive = transfer.status === "pending" && transfer.destination_branch_id === profile.branch_id;
              const canCancel = transfer.status === "pending" && outgoing;
              return <div className="transfer-card-actions">{canCancel && <button type="button" className="secondary-button compact-button" onClick={() => setTransferAction({ transfer, action: "cancel" })}><Ban size={17} />Cancel</button>}{canReceive && <button type="button" className="primary-button compact-button" onClick={() => setTransferAction({ transfer, action: "receive" })}><PackageCheck size={17} />Receive</button>}</div>;
            } }
          ]}
          renderCard={(transfer) => {
            const outgoing = transfer.source_branch_id === profile.branch_id;
            const canReceive = transfer.status === "pending" && transfer.destination_branch_id === profile.branch_id;
            const canCancel = transfer.status === "pending" && outgoing;
            const totalUnits = (transfer.stock_transfer_items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
            return (
              <article className="responsive-data-card transfer-card">
                <header><div><strong>{transfer.transfer_number}</strong><small>{dateTime(transfer.created_at)}</small></div><span className={`status-pill ${statusClass(transfer.status)}`}>{transfer.status}</span></header>
                <div className="transfer-route"><div><span>From</span><strong>{transfer.source_branch?.name || "Source"}</strong></div><ArrowLeftRight size={20} /><div><span>To</span><strong>{transfer.destination_branch?.name || "Destination"}</strong></div></div>
                <div className="transfer-items-preview">{(transfer.stock_transfer_items || []).map((item) => <div key={item.id}><span><strong>{item.products?.name || "Product"}</strong><small>{item.products?.sku || item.products?.barcode || "No code"}</small></span><strong>{stockNumber(item.quantity)} {item.products?.unit_name || "pcs"}</strong></div>)}</div>
                <div><span>Total units</span><strong>{stockNumber(totalUnits)}</strong></div>
                {(transfer.notes || transfer.receive_notes || transfer.cancel_reason) && <p>{transfer.receive_notes || transfer.cancel_reason || transfer.notes}</p>}
                <footer>{canCancel && <button type="button" className="secondary-button compact-button" onClick={() => setTransferAction({ transfer, action: "cancel" })}><Ban size={17} />Cancel</button>}{canReceive && <button type="button" className="primary-button compact-button" onClick={() => setTransferAction({ transfer, action: "receive" })}><PackageCheck size={17} />Receive</button>}</footer>
              </article>
            );
          }}
        />
      ) : (
        <section className="panel supplier-return-history">
          {loading ? (
            <div className="empty-state">
              <RefreshCw className="spin" size={34} />
              <p>Loading supplier returns...</p>
            </div>
          ) : visibleSupplierReturns.length === 0 ? (
            <div className="empty-state">
              <RotateCcw size={46} />
              <h2>No supplier returns</h2>
              <p>Use Return to supplier after a received purchase.</p>
            </div>
          ) : (
            <div className="supplier-return-table-wrap">
              <table className="supplier-return-table">
                <thead>
                  <tr>
                    <th>Return</th>
                    <th>Purchase</th>
                    <th>Supplier</th>
                    <th>Products</th>
                    <th>Date</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleSupplierReturns.map((supplierReturn) => (
                    <tr key={supplierReturn.id}>
                      <td data-label="Return">
                        <strong>{supplierReturn.return_number}</strong>
                        <small>{supplierReturn.reason}</small>
                      </td>
                      <td data-label="Purchase">
                        {supplierReturn.purchases?.purchase_number || "—"}
                      </td>
                      <td data-label="Supplier">
                        {supplierReturn.suppliers?.name || "No supplier"}
                      </td>
                      <td data-label="Products">
                        {(supplierReturn.purchase_return_items || []).map((item) => (
                          <div className="supplier-return-line" key={item.id}>
                            <span>{item.products?.name || "Product"}</span>
                            <strong>
                              {stockNumber(item.quantity)}
                              {" "}
                              {item.return_unit_name || "units"}
                            </strong>
                          </div>
                        ))}
                      </td>
                      <td data-label="Date">{dateTime(supplierReturn.created_at)}</td>
                      <td data-label="Value">
                        <strong>
                          {money(
                            supplierReturn.total_amount,
                            supplierReturn.currency
                          )}
                        </strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {newTransferOpen && (
        <TransferFormModal
          branches={branches}
          products={products.filter(
            (product) => Number(product.stock_quantity || 0) > 0
          )}
          currentBranchId={profile.branch_id}
          busy={busy}
          onClose={() => setNewTransferOpen(false)}
          onSubmit={saveTransfer}
        />
      )}

      <TransferActionModal
        transfer={transferAction?.transfer}
        action={transferAction?.action}
        busy={busy}
        onClose={() => setTransferAction(null)}
        onSubmit={saveTransferAction}
      />

      {supplierReturnOpen && (
        <SupplierReturnModal
          purchases={purchases.filter((purchase) =>
            (purchase.purchase_items || []).some(
              (item) => Number(item.returnable_quantity || 0) > 0
            )
          )}
          products={products}
          busy={busy}
          onClose={() => setSupplierReturnOpen(false)}
          onSubmit={saveSupplierReturn}
        />
      )}
    </div>
  );
}
