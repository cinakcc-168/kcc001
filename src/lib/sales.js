function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

export function createIdempotencyKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `sale-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function calculateSaleTotals(
  cart,
  discountType = "none",
  discountValue = 0,
  taxPercent = 0
) {
  const subtotal = roundMoney(
    cart.reduce(
      (sum, item) => sum + Number(item.selling_price || 0) * Number(item.quantity || 0),
      0
    )
  );

  let discountAmount = 0;
  const value = Math.max(0, Number(discountValue || 0));

  if (discountType === "percent") {
    discountAmount = roundMoney(subtotal * Math.min(value, 100) / 100);
  } else if (discountType === "fixed") {
    discountAmount = Math.min(subtotal, roundMoney(value));
  }

  const taxableAmount = Math.max(0, roundMoney(subtotal - discountAmount));
  const taxAmount = roundMoney(taxableAmount * Math.max(0, Number(taxPercent || 0)) / 100);
  const total = Math.max(0, roundMoney(taxableAmount + taxAmount));

  return { subtotal, discountAmount, taxableAmount, taxAmount, total };
}

export async function loadSalesWorkspace(supabase, organizationId, branchId) {
  const [productResult, categoryResult, customerResult, parkedResult, recentResult] =
    await Promise.all([
      supabase
        .from("products")
        .select(`
          id,
          organization_id,
          category_id,
          name,
          name_km,
          sku,
          barcode,
          unit_name,
          selling_price,
          default_cost,
          currency,
          track_stock,
          allow_negative_stock,
          low_stock_threshold,
          is_active,
          categories (id, name),
          product_images (
            id,
            secure_url,
            cloudinary_public_id,
            is_primary,
            sort_order
          ),
          inventory_balances (
            branch_id,
            quantity,
            average_cost
          )
        `)
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("categories")
        .select("id,name,is_active,sort_order")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("sort_order")
        .order("name"),
      supabase
        .from("customers")
        .select("id,name,phone,email,is_active,created_at")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("parked_sales")
        .select("id,label,customer_id,currency,cart,discount_type,discount_value,notes,parked_by,created_at")
        .eq("organization_id", organizationId)
        .eq("branch_id", branchId)
        .order("created_at", { ascending: false }),
      supabase
        .from("sales")
        .select(`
          id,
          invoice_number,
          customer_id,
          status,
          payment_status,
          currency,
          total_amount,
          gross_profit,
          created_at,
          completed_at,
          customers (id,name,phone),
          payments (id,method,amount,reference_number)
        `)
        .eq("organization_id", organizationId)
        .eq("branch_id", branchId)
        .order("created_at", { ascending: false })
        .limit(30)
    ]);

  for (const result of [
    productResult,
    categoryResult,
    customerResult,
    parkedResult,
    recentResult
  ]) {
    if (result.error) throw result.error;
  }

  const products = (productResult.data || []).map((product) => {
    const balance = (product.inventory_balances || []).find(
      (row) => row.branch_id === branchId
    );
    const image = [...(product.product_images || [])].sort(
      (a, b) =>
        Number(b.is_primary) - Number(a.is_primary) ||
        Number(a.sort_order || 0) - Number(b.sort_order || 0)
    )[0];

    return {
      ...product,
      stock_quantity: Number(balance?.quantity || 0),
      average_cost: Number(balance?.average_cost || product.default_cost || 0),
      image: image || null
    };
  });

  return {
    products,
    categories: categoryResult.data || [],
    customers: customerResult.data || [],
    parkedSales: parkedResult.data || [],
    recentSales: recentResult.data || []
  };
}

export function exactSaleProductMatch(products, code) {
  const needle = String(code || "").trim().toLowerCase();
  if (!needle) return null;

  return (
    products.find(
      (product) =>
        String(product.barcode || "").trim().toLowerCase() === needle ||
        String(product.sku || "").trim().toLowerCase() === needle
    ) || null
  );
}

export async function createCustomer(supabase, profile, values) {
  const { data, error } = await supabase
    .from("customers")
    .insert({
      organization_id: profile.organization_id,
      name: values.name.trim(),
      phone: values.phone.trim() || null,
      email: values.email.trim() || null,
      notes: values.notes.trim() || null,
      is_active: true,
      created_by: profile.id
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function saveParkedSale(supabase, profile, values) {
  const payload = {
    organization_id: profile.organization_id,
    branch_id: profile.branch_id,
    parked_by: profile.id,
    label: values.label.trim() || null,
    customer_id: values.customer_id || null,
    currency: values.currency,
    cart: values.cart.map((item) => ({
      product_id: item.id,
      quantity: Number(item.quantity)
    })),
    discount_type: values.discount_type,
    discount_value: Number(values.discount_value || 0),
    notes: values.notes.trim() || null
  };

  if (values.parked_id) {
    const { data, error } = await supabase
      .from("parked_sales")
      .update(payload)
      .eq("id", values.parked_id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from("parked_sales")
    .insert(payload)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function removeParkedSale(supabase, parkedId) {
  const { error } = await supabase.from("parked_sales").delete().eq("id", parkedId);
  if (error) throw error;
}

export function hydrateParkedCart(products, parkedCart) {
  const missing = [];
  const cart = [];

  for (const row of Array.isArray(parkedCart) ? parkedCart : []) {
    const product = products.find((item) => item.id === row.product_id);
    if (!product || !product.is_active) {
      missing.push(row.product_id);
      continue;
    }
    cart.push({ ...product, quantity: Math.max(0.001, Number(row.quantity || 1)) });
  }

  return { cart, missing };
}

export async function completeSale(supabase, values) {
  const { data, error } = await supabase.rpc("complete_sale", {
    p_items: values.cart.map((item) => ({
      product_id: item.id,
      quantity: Number(item.quantity)
    })),
    p_payment_method: values.payment_method,
    p_amount_received: Number(values.amount_received),
    p_customer_id: values.customer_id || null,
    p_discount_type: values.discount_type,
    p_discount_value: Number(values.discount_value || 0),
    p_tax_amount: Number(values.tax_amount || 0),
    p_currency: values.currency,
    p_notes: values.notes.trim() || null,
    p_payment_reference: values.payment_reference.trim() || null,
    p_idempotency_key: values.idempotency_key
  });

  if (error) throw error;
  return data;
}
