const API_PATH =
  "/.netlify/functions/storefront-public";

function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function onlineMoney(
  value,
  currency = "USD"
) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits:
      currency === "KHR" ? 0 : 2
  }).format(number(value));
}

export function onlineDate(value) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium"
  }).format(
    new Date(
      `${String(value).slice(0, 10)}T00:00:00`
    )
  );
}

export function onlineDateTime(value) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function onlineStatusLabel(status) {
  const labels = {
    pending: "Pending",
    confirmed: "Confirmed",
    preparing: "Preparing",
    ready: "Ready",
    partially_fulfilled:
      "Partially fulfilled",
    fulfilled: "Fulfilled",
    cancelled: "Cancelled",
    rejected: "Rejected"
  };

  return labels[status] || status;
}

async function parseResponse(response) {
  const result = await response
    .json()
    .catch(() => ({}));

  if (!response.ok || result?.ok === false) {
    throw new Error(
      result?.error
      || "The storefront request failed."
    );
  }

  return result;
}

export async function loadPublicStorefront(
  slug
) {
  const query = new URLSearchParams({
    slug
  });

  const response = await fetch(
    `${API_PATH}?${query.toString()}`
  );

  return parseResponse(response);
}

export async function submitPublicOrder(
  slug,
  payload
) {
  const query = new URLSearchParams({
    slug
  });

  const response = await fetch(
    `${API_PATH}?${query.toString()}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    }
  );

  return parseResponse(response);
}

export async function trackPublicOrder(
  slug,
  orderNumber,
  token
) {
  const query = new URLSearchParams({
    slug,
    action: "track",
    order: orderNumber,
    token
  });

  const response = await fetch(
    `${API_PATH}?${query.toString()}`
  );

  return parseResponse(response);
}

export async function loadOnlineStoreAdmin(
  supabase,
  profile,
  filters = {}
) {
  let orderQuery = supabase
    .from("online_orders")
    .select(`
      id,
      organization_id,
      branch_id,
      order_number,
      status,
      payment_status,
      payment_method,
      fulfilment_type,
      currency,
      customer_id,
      customer_name,
      customer_phone,
      customer_email,
      delivery_address,
      requested_date,
      customer_note,
      subtotal,
      delivery_fee,
      total_amount,
      sales_order_id,
      confirmed_at,
      cancelled_at,
      cancel_reason,
      completed_at,
      created_at,
      updated_at,
      branches(name,code),
      customers(id,customer_code,name,phone),
      sales_orders(id,order_number,status),
      online_order_items(
        id,
        product_id,
        product_unit_id,
        product_name,
        sku,
        barcode,
        unit_name,
        unit_factor,
        quantity,
        base_quantity,
        list_price,
        unit_price,
        line_total
      ),
      online_order_status_history(
        id,
        from_status,
        to_status,
        note,
        changed_at,
        changed_by
      )
    `)
    .eq(
      "organization_id",
      profile.organization_id
    )
    .order("created_at", {
      ascending: false
    })
    .limit(250);

  if (filters.branch_id) {
    orderQuery = orderQuery.eq(
      "branch_id",
      filters.branch_id
    );
  }

  if (
    filters.status
    && filters.status !== "all"
  ) {
    orderQuery = orderQuery.eq(
      "status",
      filters.status
    );
  }

  if (filters.from) {
    orderQuery = orderQuery.gte(
      "created_at",
      new Date(
        `${filters.from}T00:00:00`
      ).toISOString()
    );
  }

  if (filters.to) {
    orderQuery = orderQuery.lte(
      "created_at",
      new Date(
        `${filters.to}T23:59:59.999`
      ).toISOString()
    );
  }

  const search = String(
    filters.search || ""
  ).trim();

  if (search) {
    const clean = search.replaceAll(",", " ");
    orderQuery = orderQuery.or(
      [
        `order_number.ilike.%${clean}%`,
        `customer_name.ilike.%${clean}%`,
        `customer_phone.ilike.%${clean}%`
      ].join(",")
    );
  }

  const [
    settingsResult,
    productsResult,
    ordersResult
  ] = await Promise.all([
    supabase
      .from("online_store_settings")
      .select("*")
      .eq(
        "organization_id",
        profile.organization_id
      )
      .eq("branch_id", profile.branch_id)
      .maybeSingle(),
    supabase
      .from("products")
      .select(`
        id,
        name,
        name_km,
        sku,
        barcode,
        currency,
        is_active,
        online_enabled,
        online_featured,
        online_description,
        online_sort_order,
        categories(id,name),
        product_images(
          id,
          secure_url,
          is_primary,
          sort_order
        ),
        product_units(
          id,
          name,
          short_name,
          conversion_factor,
          selling_price,
          is_base,
          is_active,
          sort_order
        )
      `)
      .eq(
        "organization_id",
        profile.organization_id
      )
      .eq("is_active", true)
      .order("online_enabled", {
        ascending: false
      })
      .order("online_sort_order")
      .order("name"),
    orderQuery
  ]);

  if (settingsResult.error) {
    throw settingsResult.error;
  }
  if (productsResult.error) {
    throw productsResult.error;
  }
  if (ordersResult.error) {
    throw ordersResult.error;
  }

  return {
    settings: settingsResult.data || null,
    products: productsResult.data || [],
    orders: (ordersResult.data || []).map(
      (order) => ({
        ...order,
        subtotal: number(order.subtotal),
        delivery_fee: number(
          order.delivery_fee
        ),
        total_amount: number(
          order.total_amount
        ),
        online_order_items: (
          order.online_order_items || []
        ).map((item) => ({
          ...item,
          quantity: number(item.quantity),
          base_quantity: number(
            item.base_quantity
          ),
          list_price: number(
            item.list_price
          ),
          unit_price: number(
            item.unit_price
          ),
          line_total: number(
            item.line_total
          )
        })),
        online_order_status_history: (
          order.online_order_status_history
          || []
        ).sort(
          (a, b) =>
            new Date(a.changed_at)
            - new Date(b.changed_at)
        )
      })
    )
  };
}

export async function saveOnlineStoreSettings(
  supabase,
  values
) {
  const { data, error } = await supabase.rpc(
    "save_online_store_settings",
    {
      p_values: values
    }
  );

  if (error) throw error;
  return data;
}

export async function saveOnlineProduct(
  supabase,
  productId,
  values
) {
  const { data, error } = await supabase.rpc(
    "save_online_product_settings",
    {
      p_product_id: productId,
      p_values: values
    }
  );

  if (error) throw error;
  return data;
}

export async function confirmOnlineOrder(
  supabase,
  orderId
) {
  const { data, error } = await supabase.rpc(
    "confirm_online_order",
    {
      p_order_id: orderId
    }
  );

  if (error) throw error;
  return data;
}

export async function setOnlineOrderStatus(
  supabase,
  orderId,
  status,
  note
) {
  const { data, error } = await supabase.rpc(
    "update_online_order_status",
    {
      p_order_id: orderId,
      p_status: status,
      p_note: note || null
    }
  );

  if (error) throw error;
  return data;
}
