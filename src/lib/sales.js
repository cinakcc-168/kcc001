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
  taxPercent = 0,
  discountMode = "manual"
) {
  const promotionDiscountAmount = roundMoney(
    cart.reduce((sum, item) => {
      const promoDiscount = Number(item.promotion_discount_amount || 0);
      if (promoDiscount > 0) return sum + promoDiscount;

      const qty = Number(item.quantity || 0);
      const stdPrice = Number(item.standard_unit_price ?? item.list_price ?? 0);
      const sellingPrice = Number(item.selected_unit_price ?? item.selling_price ?? 0);
      if (stdPrice > sellingPrice && sellingPrice > 0) {
        return sum + ((stdPrice - sellingPrice) * qty);
      }
      return sum;
    }, 0)
  );

  const grossSubtotal = roundMoney(
    cart.reduce((sum, item) => {
      const qty = Number(item.quantity || 0);
      const promoDiscount = Number(item.promotion_discount_amount || 0);
      const sellingPrice = Number(item.selected_unit_price ?? item.selling_price ?? 0);
      const stdPrice = Number(
        item.standard_unit_price
        ?? item.list_price
        ?? (promoDiscount > 0 && qty > 0 ? sellingPrice + (promoDiscount / qty) : sellingPrice)
      );
      return sum + (qty * stdPrice);
    }, 0)
  );

  const netSellingSubtotal = roundMoney(
    cart.reduce(
      (sum, item) => sum + Number(item.selected_unit_price ?? item.selling_price ?? 0) * Number(item.quantity || 0),
      0
    )
  );

  const eligibleSubtotal = roundMoney(
    cart.reduce((sum, item) => {
      const promotion = item.active_promotion || null;
      const allowed = !promotion
        || (discountMode === "coupon"
          ? promotion.allow_coupon !== false
          : promotion.allow_manual_discount !== false);
      return sum + (allowed ? Number(item.selected_unit_price ?? item.selling_price ?? 0) * Number(item.quantity || 0) : 0);
    }, 0)
  );

  let discountAmount = 0;
  const value = Math.max(0, Number(discountValue || 0));

  if (discountType === "percent") {
    discountAmount = roundMoney(eligibleSubtotal * Math.min(value, 100) / 100);
  } else if (discountType === "fixed") {
    discountAmount = Math.min(eligibleSubtotal, roundMoney(value));
  }

  const taxableAmount = Math.max(0, roundMoney(netSellingSubtotal - discountAmount));
  const taxAmount = roundMoney(taxableAmount * Math.max(0, Number(taxPercent || 0)) / 100);
  const total = Math.max(0, roundMoney(taxableAmount + taxAmount));

  return {
    subtotal: grossSubtotal > 0 ? grossSubtotal : netSellingSubtotal,
    grossSubtotal,
    netSellingSubtotal,
    promotionDiscountAmount,
    eligibleSubtotal,
    discountAmount,
    taxableAmount,
    taxAmount,
    total
  };
}

export async function loadSalesWorkspace(supabase, organizationId, branchId) {
  const [productResult, categoryResult, customerResult, parkedResult, recentResult, reservationResult, promotionResult] =
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
          product_units (
            id,
            name,
            short_name,
            conversion_factor,
            selling_price,
            barcode,
            is_base,
            is_active,
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
        .select(`
          id,
          customer_code,
          customer_type,
          name,
          company_name,
          phone,
          email,
          loyalty_points,
          credit_limit,
          allow_unlimited_credit,
          price_list_id,
          is_active,
          created_at,
          customer_credit_accounts (
            id,
            currency,
            credit_limit,
            allow_unlimited_credit,
            balance_due,
            payment_terms_days,
            is_on_hold,
            last_activity_at
          )
        `)
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("parked_sales")
        .select("id,label,customer_id,currency,cart,discount_type,discount_value,coupon_code,notes,parked_by,created_at")
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
          source_quote_id,
          source_sales_order_id,
          source_sales_order_delivery_id,
          credit_account_id,
          credit_due_date,
          credit_amount,
          coupon_code,
          coupon_discount_amount,
          created_at,
          completed_at,
          customers (id,name,phone),
          payments (id,method,amount,reference_number)
        `)
        .eq("organization_id", organizationId)
        .eq("branch_id", branchId)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("stock_reservations")
        .select("product_id,reserved_base_quantity,delivered_base_quantity,released_base_quantity,status")
        .eq("organization_id", organizationId)
        .eq("branch_id", branchId)
        .eq("status", "active"),
      supabase
        .from("product_promotions")
        .select("id,name,branch_id,discount_type,discount_value,starts_at,ends_at,allow_coupon,allow_manual_discount,is_active,product_promotion_items(product_id,product_unit_id,max_unit_quantity,reserved_unit_quantity)")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
    ]);

  for (const result of [
    productResult,
    categoryResult,
    customerResult,
    parkedResult,
    recentResult,
    reservationResult,
    promotionResult
  ]) {
    if (result.error) throw result.error;
  }

  const reservedByProduct = new Map();
  for (const row of reservationResult.data || []) {
    const remaining = Math.max(
      0,
      Number(row.reserved_base_quantity || 0)
        - Number(row.delivered_base_quantity || 0)
        - Number(row.released_base_quantity || 0)
    );
    reservedByProduct.set(
      row.product_id,
      Number(reservedByProduct.get(row.product_id) || 0)
        + remaining
    );
  }

  const now = Date.now();
  const promotionsByProduct = new Map();
  const hasPromoSet = new Set();

  for (const promotion of promotionResult.data || []) {
    if (promotion.branch_id && promotion.branch_id !== branchId) continue;
    const start = new Date(promotion.starts_at).getTime();
    const end = promotion.ends_at ? new Date(promotion.ends_at).getTime() : Number.POSITIVE_INFINITY;
    if (!Number.isFinite(start) || start > now || end < now) continue;

    for (const item of promotion.product_promotion_items || []) {
      if (!item.product_id || !item.product_unit_id) continue;
      hasPromoSet.add(item.product_id);
      let mapForProd = promotionsByProduct.get(item.product_id);
      if (!mapForProd) {
        mapForProd = {};
        promotionsByProduct.set(item.product_id, mapForProd);
      }
      if (!mapForProd[item.product_unit_id]) {
        mapForProd[item.product_unit_id] = promotion;
      }
    }
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

    const units = [...(product.product_units || [])]
      .filter((unit) => unit.is_active || unit.is_base)
      .sort(
        (a, b) =>
          Number(b.is_base) - Number(a.is_base)
          || Number(a.sort_order || 0) - Number(b.sort_order || 0)
          || String(a.name).localeCompare(String(b.name))
      );

    const promoByUnitMap = promotionsByProduct.get(product.id) || {};
    for (const unit of units) {
      if (promoByUnitMap[unit.id]) {
        promoByUnitMap[unit.id] = {
          ...promoByUnitMap[unit.id],
          unit_name: unit.name,
          is_base_unit: Boolean(unit.is_base)
        };
      }
    }
    const baseUnit = units.find((u) => u.is_base) || units[0] || null;
    const defaultActivePromo = (baseUnit && promoByUnitMap[baseUnit.id]) || Object.values(promoByUnitMap)[0] || null;

    return {
      ...product,
      product_units: units,
      units,
      product_promotions_by_unit: promoByUnitMap,
      physical_stock_quantity: Number(balance?.quantity || 0),
      reserved_stock_quantity: Number(
        reservedByProduct.get(product.id) || 0
      ),
      stock_quantity: Math.max(
        0,
        Number(balance?.quantity || 0)
          - Number(reservedByProduct.get(product.id) || 0)
      ),
      average_cost: Number(balance?.average_cost || product.default_cost || 0),
      image: image || null,
      image_url: image?.secure_url || product.image_url || null,
      active_promotion: defaultActivePromo || null,
      has_active_promotion: hasPromoSet.has(product.id)
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

export function saleUnitForProduct(product, unitId = null) {
  const units = [...(product?.product_units || product?.units || [])]
    .filter((unit) => unit.is_active || unit.is_base)
    .sort(
      (a, b) =>
        Number(b.is_base) - Number(a.is_base)
        || Number(a.sort_order || 0) - Number(b.sort_order || 0)
        || String(a.name).localeCompare(String(b.name))
    );

  return (
    units.find((unit) => unit.id === unitId)
    || units.find((unit) => unit.is_base)
    || units[0]
    || {
      id: null,
      name: product?.unit_name || "pcs",
      short_name: product?.unit_name || "pcs",
      conversion_factor: 1,
      selling_price: Number(product?.selling_price || 0),
      barcode: product?.barcode || null,
      is_base: true,
      is_active: true,
      sort_order: 0
    }
  );
}

function createCartLineId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `cart-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function buildSaleCartItem(product, unitId = null, cartLineId = null) {
  const unit = saleUnitForProduct(product, unitId);

  let promotion = null;
  if (product?.product_promotions_by_unit && unit?.id) {
    promotion = product.product_promotions_by_unit[unit.id] || null;
  } else if (product?.active_promotion) {
    const promoUnitId = product.active_promotion.product_unit_id || product.active_promotion.product_promotion_items?.[0]?.product_unit_id;
    if (!promoUnitId || promoUnitId === unit.id) {
      promotion = product.active_promotion;
    }
  }

  const normalPrice = Number(unit.selling_price || 0);
  const promoPrice = promotion
    ? Number((promotion.discount_type === "percent"
      ? normalPrice * (1 - Math.min(Math.max(Number(promotion.discount_value || 0), 0), 100) / 100)
      : normalPrice - Math.max(Number(promotion.discount_value || 0), 0)).toFixed(2))
    : normalPrice;

  return {
    ...product,
    cart_line_id: cartLineId || createCartLineId(),
    quantity: 1,
    active_promotion: promotion,
    selected_unit_id: unit.id,
    selected_unit_name: unit.name,
    selected_unit_short_name: unit.short_name || unit.name,
    selected_unit_factor: Number(unit.conversion_factor || 1),
    selected_unit_price: Math.max(0, promoPrice),
    standard_unit_price: Number(
      unit.standard_selling_price
      ?? unit.selling_price
      ?? 0
    ),
    price_list_id: unit.price_list_id || null,
    price_list_name: unit.price_list_name || null,
    unit_price_adjustment: Number(
      unit.price_adjustment || 0
    ),
    selling_price: Number(unit.selling_price || 0),
    image_url: product.image?.secure_url || product.image_url || product.product_image_url || null
  };
}

export function exactSaleProductMatch(products, code) {
  const needle = String(code || "").trim().toLowerCase();
  if (!needle) return null;

  for (const product of products) {
    const matchingUnit = (product.product_units || product.units || [])
      .find(
        (unit) =>
          unit.is_active
          && String(unit.barcode || "").trim().toLowerCase() === needle
      );

    if (matchingUnit) {
      return { product, unit: matchingUnit };
    }

    if (
      String(product.sku || "").trim().toLowerCase() === needle
      || String(product.barcode || "").trim().toLowerCase() === needle
    ) {
      return { product, unit: saleUnitForProduct(product) };
    }
  }

  return null;
}

export function creditAccountForCustomer(
  customer,
  currency
) {
  if (!customer || !currency) return null;

  const account = (customer.customer_credit_accounts || [])
    .find((candidate) => candidate.currency === currency) || null;

  if (!account) return null;

  return {
    ...account,
    allow_unlimited_credit: Boolean(
      account.allow_unlimited_credit
      || customer.allow_unlimited_credit
    )
  };
}

export async function createCustomer(supabase, profile, values) {
  const { data, error } = await supabase
    .from("customers")
    .insert({
      organization_id: profile.organization_id,
      customer_type: values.customer_type || "regular",
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
      product_unit_id: item.selected_unit_id || null,
      quantity: Number(item.quantity)
    })),
    discount_type: values.discount_type,
    discount_value: Number(values.discount_value || 0),
    coupon_code: values.coupon_code?.trim().toUpperCase() || null,
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

    const unit = saleUnitForProduct(product, row.product_unit_id || null);
    if (!unit || !unit.is_active) {
      missing.push(row.product_id);
      continue;
    }

    cart.push({
      ...buildSaleCartItem(product, unit.id),
      quantity: Math.max(0.001, Number(row.quantity || 1))
    });
  }

  return { cart, missing };
}

export async function previewCoupon(supabase, values) {
  const { data, error } = await supabase.rpc("preview_coupon_v2", {
    p_code: values.code.trim().toUpperCase(),
    p_items: values.cart.map((item) => ({
      product_id: item.id,
      product_unit_id: item.selected_unit_id || null,
      quantity: Number(item.quantity)
    })),
    p_customer_id: values.customer_id || null,
    p_currency: values.currency
  });

  if (error) throw error;
  return data;
}

export async function completeSale(supabase, values) {
  const items = values.cart.map((item) => ({
    product_id: item.id,
    product_unit_id: item.selected_unit_id || null,
    quantity: Number(item.quantity)
  }));

  const common = {
    p_items: items,
    p_customer_id: values.customer_id || null,
    p_manual_discount_type: values.discount_type,
    p_manual_discount_value: Number(values.discount_value || 0),
    p_coupon_code: values.coupon_code?.trim().toUpperCase() || null,
    p_currency: values.currency,
    p_notes: String(values.notes || "").trim() || null,
    p_idempotency_key: values.idempotency_key,
    p_source_quote_id: values.source_quote_id || null,
    p_approval_request_id: values.approval_request_id || null,
    p_source_sales_order_delivery_id:
      values.source_sales_order_delivery_id || null
  };

  const isCredit = values.payment_method === "credit";
  const request = isCredit
    ? supabase.rpc("complete_sale_v9", {
        ...common,
        p_payment_method: "credit",
        p_amount_received: 0,
        p_payment_reference: null
      })
    : supabase.rpc("complete_sale_v10_tenders", {
        ...common,
        p_payments: (values.payments || []).map((payment) => ({
          method: payment.method,
          currency: payment.currency || "USD",
          amount_received: Number(payment.amount_received || 0),
          reference_number:
            String(payment.reference_number || "").trim() || null
        }))
      });

  const { data, error } = await request;
  if (error) throw error;
  return data;
}
