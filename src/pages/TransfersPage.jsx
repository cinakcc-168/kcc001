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
  const { supabase, profile, shop } = useAuth();
  const canManage = ["owner", "admin", "manager"].includes(profile?.role);

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
          item.products?.barcode
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
          item.products?.barcode
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

        {tab === "transfers" ? (
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="received">Received</option>
            <option value="cancelled">Cancelled</option>
          </select>
        ) : (
          <button
            type="button"
            className="danger-button"
            onClick={() => setSupplierReturnOpen(true)}
            disabled={purchases.every((purchase) =>
              (purchase.purchase_items || []).every(
                (item) => Number(item.returnable_quantity || 0) <= 0
              )
            )}
          >
            <RotateCcw size={18} />
            Return to supplier
          </button>
        )}
      </section>

      {tab === "transfers" ? (
        <section className="panel transfer-list-panel">
          {loading ? (
            <div className="empty-state">
              <RefreshCw className="spin" size={34} />
              <p>Loading transfers...</p>
            </div>
          ) : visibleTransfers.length === 0 ? (
            <div className="empty-state">
              <ArrowLeftRight size={46} />
              <h2>No matching stock transfers</h2>
              <p>Create a transfer or change the current search and status filters.</p>
            </div>
          ) : (
            <div className="transfer-list">
              {visibleTransfers.map((transfer) => {
                const outgoing =
                  transfer.source_branch_id === profile.branch_id;
                const canReceive =
                  transfer.status === "pending" &&
                  transfer.destination_branch_id === profile.branch_id;
                const canCancel =
                  transfer.status === "pending" && outgoing;
                const totalUnits = (transfer.stock_transfer_items || []).reduce(
                  (sum, item) => sum + Number(item.quantity || 0),
                  0
                );

                return (
                  <article className="transfer-card" key={transfer.id}>
                    <div className="transfer-card-heading">
                      <div>
                        <strong>{transfer.transfer_number}</strong>
                        <span>{dateTime(transfer.created_at)}</span>
                      </div>
                      <span className={`status-pill ${statusClass(transfer.status)}`}>
                        {transfer.status}
                      </span>
                    </div>

                    <div className="transfer-route">
                      <div>
                        <span>From</span>
                        <strong>{transfer.source_branch?.name || "Source"}</strong>
                      </div>
                      <ArrowLeftRight size={22} />
                      <div>
                        <span>To</span>
                        <strong>
                          {transfer.destination_branch?.name || "Destination"}
                        </strong>
                      </div>
                    </div>

                    <div className="transfer-items-preview">
                      {(transfer.stock_transfer_items || []).map((item) => (
                        <div key={item.id}>
                          <span>
                            <strong>{item.products?.name || "Product"}</strong>
                            <small>
                              {item.products?.sku || item.products?.barcode || "No code"}
                            </small>
                          </span>
                          <strong>
                            {stockNumber(item.quantity)} {item.products?.unit_name || "pcs"}
                          </strong>
                        </div>
                      ))}
                    </div>

                    <div className="transfer-card-footer">
                      <div>
                        <span>{stockNumber(totalUnits)} total units</span>
                        {transfer.notes && <small>{transfer.notes}</small>}
                        {transfer.receive_notes && (
                          <small>Received: {transfer.receive_notes}</small>
                        )}
                        {transfer.cancel_reason && (
                          <small>Cancelled: {transfer.cancel_reason}</small>
                        )}
                      </div>

                      <div className="transfer-card-actions">
                        {canCancel && (
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() =>
                              setTransferAction({ transfer, action: "cancel" })
                            }
                          >
                            <Ban size={17} />
                            Cancel
                          </button>
                        )}
                        {canReceive && (
                          <button
                            type="button"
                            className="primary-button"
                            onClick={() =>
                              setTransferAction({ transfer, action: "receive" })
                            }
                          >
                            <PackageCheck size={17} />
                            Receive
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
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
                            <strong>{stockNumber(item.quantity)}</strong>
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
