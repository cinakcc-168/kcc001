function beginningOfDay(dateString) {
  return new Date(`${dateString}T00:00:00`).toISOString();
}

function endOfDay(dateString) {
  return new Date(`${dateString}T23:59:59.999`).toISOString();
}

export function defaultReturnDateRange() {
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - 30);

  return {
    from: from.toISOString().slice(0, 10),
    to: today.toISOString().slice(0, 10)
  };
}

export function estimateRefund(sale, selections) {
  const saleItems = sale?.sale_items || [];
  const saleLineTotal = saleItems.reduce(
    (sum, item) => sum + Number(item.line_total || 0),
    0
  );

  let netRefund = 0;
  let taxRefund = 0;
  let costAmount = 0;

  for (const selection of selections) {
    const item = saleItems.find((row) => row.id === selection.sale_item_id);
    const quantity = Number(selection.quantity || 0);

    if (!item || quantity <= 0) continue;

    const soldQuantity = Number(item.quantity || 0);
    if (soldQuantity <= 0) continue;

    const itemNet = Number(item.line_total || 0) * quantity / soldQuantity;
    const itemTax =
      saleLineTotal > 0
        ? Number(sale.tax_amount || 0)
          * (Number(item.line_total || 0) / saleLineTotal)
          * (quantity / soldQuantity)
        : 0;

    netRefund += itemNet;
    taxRefund += itemTax;
    costAmount += Number(item.unit_cost || 0) * quantity;
  }

  const roundMoney = (value) =>
    Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

  return {
    netRefund: roundMoney(netRefund),
    taxRefund: roundMoney(taxRefund),
    totalRefund: roundMoney(netRefund + taxRefund),
    costAmount: Math.round((costAmount + Number.EPSILON) * 10000) / 10000,
    profitReversal:
      Math.round((netRefund - costAmount + Number.EPSILON) * 10000) / 10000
  };
}

export async function loadReturnsWorkspace(
  supabase,
  profile,
  filters
) {
  const saleQuery = supabase
    .from("sales")
    .select(`
      id,
      organization_id,
      branch_id,
      invoice_number,
      customer_id,
      cashier_id,
      status,
      payment_status,
      currency,
      subtotal,
      discount_amount,
      tax_amount,
      total_amount,
      paid_amount,
      change_amount,
      cost_amount,
      gross_profit,
      credit_account_id,
      credit_due_date,
      credit_amount,
      notes,
      created_at,
      completed_at,
      customers (
        id,
        name,
        phone
      ),
      payments (
        id,
        method,
        amount,
        tendered_amount,
        change_amount,
        reference_number,
        paid_at
      ),
      sale_items (
        id,
        product_id,
        product_name,
        barcode,
        quantity,
        base_quantity,
        sale_unit_name,
        unit_factor,
        unit_price,
        unit_cost,
        discount_amount,
        tax_amount,
        line_total,
        line_profit
      )
    `)
    .eq("organization_id", profile.organization_id)
    .eq("branch_id", profile.branch_id)
    .in("status", ["completed", "partially_refunded", "refunded"])
    .gte("completed_at", beginningOfDay(filters.from))
    .lte("completed_at", endOfDay(filters.to))
    .order("completed_at", { ascending: false })
    .limit(200);

  const historyQuery = supabase
    .from("returns")
    .select(`
      id,
      organization_id,
      branch_id,
      return_number,
      original_sale_id,
      customer_id,
      status,
      currency,
      refund_amount,
      refund_method,
      refund_reference,
      credit_account_id,
      credit_refund_amount,
      reason,
      processed_by,
      processed_at,
      tax_refund,
      cost_amount,
      profit_reversal,
      sales!returns_original_sale_id_fkey (
        id,
        invoice_number,
        completed_at,
        customers (
          id,
          name,
          phone
        )
      ),
      return_items (
        id,
        sale_item_id,
        product_id,
        quantity,
        base_quantity,
        return_unit_name,
        unit_factor,
        unit_refund,
        line_refund,
        restock,
        tax_refund,
        unit_cost,
        line_cost,
        line_profit_reversal,
        sale_items!return_items_sale_item_id_fkey (
          product_name,
          barcode,
          sale_unit_name,
          unit_factor,
          unit_price
        )
      )
    `)
    .eq("organization_id", profile.organization_id)
    .eq("branch_id", profile.branch_id)
    .eq("status", "completed")
    .gte("processed_at", beginningOfDay(filters.from))
    .lte("processed_at", endOfDay(filters.to))
    .order("processed_at", { ascending: false })
    .limit(200);

  const [saleResult, historyResult] = await Promise.all([
    saleQuery,
    historyQuery
  ]);

  if (saleResult.error) throw saleResult.error;
  if (historyResult.error) throw historyResult.error;

  const sales = saleResult.data || [];
  const saleIds = sales.map((sale) => sale.id);

  let saleReturns = [];

  if (saleIds.length > 0) {
    const { data, error } = await supabase
      .from("returns")
      .select(`
        id,
        original_sale_id,
        status,
        refund_amount,
        return_items (
          sale_item_id,
          quantity,
          tax_refund
        )
      `)
      .eq("organization_id", profile.organization_id)
      .eq("status", "completed")
      .in("original_sale_id", saleIds);

    if (error) throw error;
    saleReturns = data || [];
  }

  const returnedQuantityByItem = new Map();
  const refundedAmountBySale = new Map();
  const refundedTaxBySale = new Map();

  for (const refund of saleReturns) {
    refundedAmountBySale.set(
      refund.original_sale_id,
      Number(refundedAmountBySale.get(refund.original_sale_id) || 0)
        + Number(refund.refund_amount || 0)
    );

    let taxTotal = 0;

    for (const item of refund.return_items || []) {
      returnedQuantityByItem.set(
        item.sale_item_id,
        Number(returnedQuantityByItem.get(item.sale_item_id) || 0)
          + Number(item.quantity || 0)
      );

      taxTotal += Number(
        item.tax_refund || 0
      );
    }

    refundedTaxBySale.set(
      refund.original_sale_id,
      Number(
        refundedTaxBySale.get(
          refund.original_sale_id
        ) || 0
      ) + taxTotal
    );
  }

  const hydratedSales = sales.map((sale) => ({
    ...sale,
    refunded_amount: Number(refundedAmountBySale.get(sale.id) || 0),
    previous_tax_refunded: Number(
      refundedTaxBySale.get(sale.id) || 0
    ),
    sale_items: (sale.sale_items || []).map((item) => {
      const returnedQuantity = Number(
        returnedQuantityByItem.get(item.id) || 0
      );

      return {
        ...item,
        returned_quantity: returnedQuantity,
        returnable_quantity: Math.max(
          0,
          Number(item.quantity || 0) - returnedQuantity
        )
      };
    })
  }));

  return {
    sales: hydratedSales,
    returns: (historyResult.data || []).map((refund) => ({
      ...refund,
      refund_method:
        Number(refund.credit_refund_amount || 0) > 0
          ? "credit"
          : refund.refund_method
    }))
  };
}

export async function processSaleReturn(supabase, values) {
  const { data, error } = await supabase.rpc("process_sale_return_v4", {
    p_sale_id: values.sale_id,
    p_items: values.items.map((item) => ({
      sale_item_id: item.sale_item_id,
      quantity: Number(item.quantity),
      restock: Boolean(item.restock)
    })),
    p_refund_method: values.refund_method,
    p_reason: values.reason.trim(),
    p_refund_reference: values.refund_reference.trim() || null,
    p_approval_request_id:
      values.approval_request_id || null
  });

  if (error) throw error;
  return data;
}
