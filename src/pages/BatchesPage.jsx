import { AlertTriangle, Boxes, CalendarClock, PencilLine, Plus, RefreshCw, Search, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import BatchFormModal from "../components/BatchFormModal";
import BatchAdjustmentModal from "../components/BatchAdjustmentModal";
import { money, stockNumber } from "../lib/catalog";
import { adjustInventoryBatch, batchDate, batchDaysRemaining, changeInventoryBatchStatus,
  createInventoryBatch, effectiveBatchStatus, loadBatchWorkspace } from "../lib/batches";

export default function BatchesPage() {
  const { supabase, profile, can } = useAuth();
  const canAdjust = can("inventory.adjust");
  const [products,setProducts]=useState([]); const [batches,setBatches]=useState([]); const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false); const [message,setMessage]=useState(""); const [messageType,setMessageType]=useState("success");
  const [search,setSearch]=useState(""); const [status,setStatus]=useState("available"); const [productId,setProductId]=useState("all");
  const [formOpen,setFormOpen]=useState(false); const [adjusting,setAdjusting]=useState(null);
  const refresh=useCallback(async()=>{ if(!supabase||!profile?.branch_id)return; try{setLoading(true);const data=await loadBatchWorkspace(supabase,profile);setProducts(data.products);setBatches(data.batches);}catch(e){setMessageType("error");setMessage(e.message);}finally{setLoading(false);}},[supabase,profile]);
  useEffect(()=>{refresh();},[refresh]);
  const rows=useMemo(()=>{const needle=search.trim().toLowerCase();return batches.filter((b)=>{
    const eff=effectiveBatchStatus(b); if(productId!=="all"&&b.product_id!==productId)return false;
    if(status==="available"&&!(["active","expiring"].includes(eff)))return false; if(status!=="all"&&status!=="available"&&eff!==status)return false;
    return !needle||[b.batch_number,b.products?.name,b.products?.sku,b.products?.barcode,b.suppliers?.name,b.purchase_receipt_items?.purchase_receipts?.receipt_number].filter(Boolean).join(" ").toLowerCase().includes(needle);
  });},[batches,search,status,productId]);
  const metrics=useMemo(()=>{let active=0,expiring=0,expired=0,quarantined=0,value=0;for(const b of batches){const s=effectiveBatchStatus(b);if(s==="active")active++;if(s==="expiring")expiring++;if(s==="expired")expired++;if(s==="quarantined")quarantined++;value+=b.quantity*b.unit_cost;}return{active,expiring,expired,quarantined,value};},[batches]);
  const unassigned=useMemo(()=>products.filter(p=>p.batch_tracking).reduce((sum,p)=>{const assigned=batches.filter(b=>b.product_id===p.id).reduce((x,b)=>x+b.quantity,0);return sum+Math.max(0,p.stock_quantity-assigned);},0),[products,batches]);
  function announce(type,text){setMessageType(type);setMessage(text);}
  async function saveBatch(values){try{setBusy(true);const result=await createInventoryBatch(supabase,values);setFormOpen(false);announce("success",`Batch ${result.batch.batch_number} saved.`);await refresh();}catch(e){announce("error",e.message);}finally{setBusy(false);}}
  async function saveAdjustment(values){try{setBusy(true);const result=await adjustInventoryBatch(supabase,values);setAdjusting(null);announce("success",`Batch updated to ${stockNumber(result.batch.quantity)} units.`);await refresh();}catch(e){announce("error",e.message);}finally{setBusy(false);}}
  async function toggleStatus(batch){const target=batch.status==="quarantined"?"active":"quarantined";let reason="";if(target==="quarantined"){reason=window.prompt(`Reason for quarantining ${batch.batch_number}:`)||"";if(reason.trim().length<3)return;}try{setBusy(true);await changeInventoryBatchStatus(supabase,batch.id,target,reason);announce("success",`Batch ${batch.batch_number} marked ${target}.`);await refresh();}catch(e){announce("error",e.message);}finally{setBusy(false);}}
  return <div className="page-stack batch-page">
    <div className="page-heading"><div><p className="eyebrow">LOT TRACEABILITY</p><h1>Batch & Expiry Center</h1><p className="muted">Track lots, expiry dates, FIFO/FEFO picking, quarantine and batch valuation.</p></div>
      <div className="page-heading-actions"><button className="primary-button" onClick={()=>setFormOpen(true)} disabled={!canAdjust}><Plus size={18}/>Add batch</button><button className="secondary-button" onClick={refresh} disabled={loading}><RefreshCw size={18} className={loading?"spin":""}/>Refresh</button></div></div>
    {message&&<div className={`notice ${messageType}`} onClick={()=>setMessage("")}>{message}</div>}
    <div className="batch-metrics"><article><Boxes size={21}/><span>Available batches</span><strong>{metrics.active+metrics.expiring}</strong></article>
      <article><CalendarClock size={21}/><span>Expiring within 30 days</span><strong>{metrics.expiring}</strong></article>
      <article><AlertTriangle size={21}/><span>Expired</span><strong>{metrics.expired}</strong></article>
      <article><ShieldAlert size={21}/><span>Quarantined</span><strong>{metrics.quarantined}</strong></article>
      <article><Boxes size={21}/><span>Unassigned existing units</span><strong>{stockNumber(unassigned)}</strong></article></div>
    {unassigned>0&&<div className="notice warning">Some existing stock is not assigned to a lot. Use Add Batch with “Assign existing unbatched stock” before selling batch-tracked products.</div>}
    <section className="panel batch-toolbar"><label className="search-box"><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search product, batch, supplier or GRN"/></label>
      <select value={productId} onChange={e=>setProductId(e.target.value)}><option value="all">All products</option>{products.filter(p=>p.batch_tracking).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
      <select value={status} onChange={e=>setStatus(e.target.value)}><option value="available">Available for sale</option><option value="active">Active</option><option value="expiring">Expiring</option><option value="expired">Expired</option><option value="quarantined">Quarantined</option><option value="depleted">Depleted</option><option value="all">All statuses</option></select></section>
    <section className="panel batch-table-panel">{loading?<div className="empty-state"><RefreshCw className="spin" size={35}/><p>Loading batches...</p></div>:rows.length===0?<div className="empty-state"><Boxes size={48}/><h2>No matching batches</h2><p>Receive a batch-tracked purchase or add an opening batch.</p></div>:<div className="batch-table-wrap"><table className="batch-table"><thead><tr><th>Product / lot</th><th>Received</th><th>Expiry</th><th>Status</th><th>Quantity</th><th>Unit cost</th><th>Value</th><th>Source</th><th>Actions</th></tr></thead><tbody>{rows.map(b=>{const eff=effectiveBatchStatus(b);const days=batchDaysRemaining(b.expiry_date);return <tr key={b.id}><td data-label="Product / lot"><strong>{b.products?.name}</strong><small>{b.batch_number} · {b.products?.sku||"No code"} · {b.products?.picking_policy?.toUpperCase()}</small></td>
      <td data-label="Received">{batchDate(b.received_date)}</td><td data-label="Expiry"><strong>{batchDate(b.expiry_date)}</strong>{days!==null&&<small>{days<0?`${Math.abs(days)} days expired`:`${days} days remaining`}</small>}</td>
      <td data-label="Status"><span className={`batch-status ${eff}`}>{eff}</span></td><td data-label="Quantity"><strong>{stockNumber(b.quantity)} {b.products?.unit_name}</strong><small>Initial {stockNumber(b.initial_quantity)}</small></td>
      <td data-label="Unit cost">{money(b.unit_cost,b.products?.currency||"USD")}</td><td data-label="Value"><strong>{money(b.quantity*b.unit_cost,b.products?.currency||"USD")}</strong></td>
      <td data-label="Source">{b.purchase_receipt_items?.purchase_receipts?.receipt_number||b.source_type}</td><td data-label="Actions"><div className="batch-row-actions"><button className="icon-button" onClick={()=>setAdjusting(b)} disabled={!canAdjust||b.status==="depleted"} title="Adjust batch"><PencilLine size={17}/></button>
      <button className="secondary-button compact" onClick={()=>toggleStatus(b)} disabled={!canAdjust||b.status==="depleted"}>{b.status==="quarantined"?"Release":"Quarantine"}</button></div></td></tr>;})}</tbody></table></div>}</section>
    <BatchFormModal open={formOpen} products={products} busy={busy} onClose={()=>setFormOpen(false)} onSubmit={saveBatch}/>
    <BatchAdjustmentModal batch={adjusting} busy={busy} onClose={()=>setAdjusting(null)} onSubmit={saveAdjustment}/>
  </div>;
}
