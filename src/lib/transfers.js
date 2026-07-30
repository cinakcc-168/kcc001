export function dateTime(value) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export async function loadTransferWorkspace(supabase, profile) {
  const orgId = profile.organization_id;
  const branchId = profile.branch_id;

  const [branchResult, productResult, transferResult, purchaseResult, returnResult] =
    await Promise.all([
      supabase
        .from("branches")
        .select("id,name,code,is_active")
        .eq("organization_id", orgId)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("products")
        .select(`
          id,
          name,
          name_km,
          sku,
          barcode,
          unit_name,
          currency,
          is_active,
          track_stock,
          inventory_balances (
            branch_id,
            quantity,
            average_cost
          )
        `)
        .eq("organization_id", orgId)
        .eq("is_active", true)
        .eq("track_stock", true)
        .order("name"),
      supabase
        .from("stock_transfers")
        .select(`
          id,
          transfer_number,
          source_branch_id,
          destination_branch_id,
          status,
          notes,
          created_at,
          received_at,
          receive_notes,
          cancelled_at,
          cancel_reason,
          source_branch:branches!stock_transfers_source_branch_id_fkey (
            id,
            name,
            code
          ),
          destination_branch:branches!stock_transfers_destination_branch_id_fkey (
            id,
            name,
            code
          ),
          stock_transfer_items (
            id,
            product_id,
            quantity,
            unit_cost,
            products (
              id,
              name,
              sku,
              barcode,
              unit_name,
              currency
            )
          )
        `)
        .eq("organization_id", orgId)
        .or(`source_branch_id.eq.${branchId},destination_branch_id.eq.${branchId}`)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("purchases")
        .select(`
          id,
          purchase_number,
          branch_id,
          supplier_id,
          status,
          currency,
          total_amount,
          received_at,
          first_received_at,
          last_received_at,
          created_at,
          suppliers (
            id,
            name
          ),
          purchase_items (
            id,
            product_id,
            product_unit_id,
            purchase_unit_name,
            unit_factor,
            quantity,
            base_quantity,
            received_quantity,
            base_received_quantity,
            unit_cost,
            base_unit_cost,
            line_total,
            products (
              id,
              name,
              sku,
              barcode,
              unit_name,
              currency
            )
          )
        `)
        .eq("organization_id", orgId)
        .eq("branch_id", branchId)
        .in("status", ["ordered", "received"])
        .order("last_received_at", { ascending: false, nullsFirst: false })
        .limit(100),
      supabase
        .from("purchase_returns")
        .select(`
          id,
          return_number,
          purchase_id,
          supplier_id,
          status,
          currency,
          total_amount,
          reason,
          supplier_reference,
          created_at,
          suppliers (
            id,
            name
          ),
          purchases (
            id,
            purchase_number
          ),
          purchase_return_items (
            id,
            purchase_item_id,
            product_id,
            quantity,
            base_quantity,
            return_unit_name,
            unit_factor,
            unit_cost,
            base_unit_cost,
            line_total,
            products (
              id,
              name,
              sku,
              barcode,
              unit_name,
              currency
            )
          )
        `)
        .eq("organization_id", orgId)
        .eq("branch_id", branchId)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(200)
    ]);

  for (const result of [
    branchResult,
    productResult,
    transferResult,
    purchaseResult,
    returnResult
  ]) {
    if (result.error) throw result.error;
  }

  const products = (productResult.data || []).map((product) => {
    const balance = (product.inventory_balances || []).find(
      (row) => row.branch_id === branchId
    );

    return {
      ...product,
      stock_quantity: Number(balance?.quantity || 0),
      average_cost: Number(balance?.average_cost || 0)
    };
  });

  const returnedByPurchaseItem = new Map();

  for (const supplierReturn of returnResult.data || []) {
    for (const item of supplierReturn.purchase_return_items || []) {
      returnedByPurchaseItem.set(
        item.purchase_item_id,
        Number(returnedByPurchaseItem.get(item.purchase_item_id) || 0)
          + Number(item.quantity || 0)
      );
    }
  }

  const purchases = (purchaseResult.data || []).map((purchase) => ({
    ...purchase,
    purchase_items: (purchase.purchase_items || []).map((item) => {
      const returnedQuantity = Number(
        returnedByPurchaseItem.get(item.id) || 0
      );
      const unitFactor = Number(item.unit_factor || 1);

      return {
        ...item,
        unit_factor: unitFactor,
        quantity: Number(item.quantity || 0),
        base_quantity: Number(
          item.base_quantity
          ?? Number(item.quantity || 0) * unitFactor
        ),
        received_quantity: Number(
          item.received_quantity || 0
        ),
        base_received_quantity: Number(
          item.base_received_quantity || 0
        ),
        unit_cost: Number(item.unit_cost || 0),
        base_unit_cost: Number(
          item.base_unit_cost
          ?? Number(item.unit_cost || 0)
            / Math.max(unitFactor, 0.001)
        ),
        returned_quantity: returnedQuantity,
        returnable_quantity: Math.max(
          0,
          Number(item.received_quantity || 0)
            - returnedQuantity
        )
      };
    })
  })).filter((purchase) =>
    (purchase.purchase_items || []).some(
      (item) => Number(item.received_quantity || 0) > 0
    )
  );

  return {
    branches: branchResult.data || [],
    products,
    transfers: transferResult.data || [],
    purchases,
    supplierReturns: returnResult.data || []
  };
}

export async function createStockTransfer(supabase, values) {
  const { data, error } = await supabase.rpc("create_stock_transfer_v3", {
    p_destination_branch_id: values.destination_branch_id,
    p_items: values.items.map((item) => ({
      product_id: item.product_id,
      quantity: Number(item.quantity)
    })),
    p_notes: values.notes?.trim() || null
  });

  if (error) throw error;
  return data;
}

export async function receiveStockTransfer(supabase, transferId, notes) {
  const { data, error } = await supabase.rpc("receive_stock_transfer_v3", {
    p_transfer_id: transferId,
    p_notes: notes?.trim() || null
  });

  if (error) throw error;
  return data;
}

export async function cancelStockTransfer(supabase, transferId, reason) {
  const { data, error } = await supabase.rpc("cancel_stock_transfer_v3", {
    p_transfer_id: transferId,
    p_reason: reason.trim()
  });

  if (error) throw error;
  return data;
}

export async function processSupplierReturn(supabase, values) {
  const { data, error } = await supabase.rpc("process_supplier_return_v5", {
    p_purchase_id: values.purchase_id,
    p_items: values.items.map((item) => ({
      purchase_item_id: item.purchase_item_id,
      quantity: Number(item.quantity)
    })),
    p_reason: values.reason.trim(),
    p_supplier_reference: values.supplier_reference?.trim() || null
  });

  if (error) throw error;
  return data;
}
