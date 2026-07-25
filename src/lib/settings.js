async function authorizedPost(path, token, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });

  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Request failed.");
  }

  return data;
}

export function shopFormFromSettings(shop) {
  return {
    shop_name: shop?.shop_name || "Tiny POS",
    shop_phone: shop?.shop_phone || "",
    shop_email: shop?.shop_email || "",
    shop_address: shop?.shop_address || "",
    tax_id: shop?.tax_id || "",
    receipt_header: shop?.receipt_header || "",
    receipt_footer: shop?.receipt_footer || "Thank you for your purchase.",
    default_language: shop?.default_language || "en",
    default_theme: shop?.default_theme || "system",
    base_currency: shop?.base_currency || "USD",
    usd_to_khr_rate: Number(shop?.usd_to_khr_rate || 4100),
    tax_percent: Number(shop?.tax_percent || 0),
    low_stock_threshold: Number(shop?.low_stock_threshold || 5),
    allow_negative_stock: Boolean(shop?.allow_negative_stock),
    receipt_width_mm: Number(shop?.receipt_width_mm || 80),
    invoice_prefix: shop?.invoice_prefix || "INV",
    receipt_show_logo: shop?.receipt_show_logo !== false,
    receipt_show_address: shop?.receipt_show_address !== false,
    receipt_show_phone: shop?.receipt_show_phone !== false,
    receipt_show_customer: shop?.receipt_show_customer !== false,
    receipt_show_cashier: shop?.receipt_show_cashier !== false,
    receipt_show_barcode: shop?.receipt_show_barcode !== false,
    label_width_mm: Number(shop?.label_width_mm || 50),
    label_height_mm: Number(shop?.label_height_mm || 30),
    label_columns: Number(shop?.label_columns || 3),
    label_show_name: shop?.label_show_name !== false,
    label_show_price: shop?.label_show_price !== false,
    label_show_sku: shop?.label_show_sku !== false,
    label_barcode_format: shop?.label_barcode_format || "CODE128"
  };
}

export async function saveShopSettings(supabase, values) {
  const { data, error } = await supabase.rpc("update_shop_settings", {
    p_shop_name: values.shop_name.trim(),
    p_shop_phone: values.shop_phone.trim(),
    p_shop_email: values.shop_email.trim(),
    p_shop_address: values.shop_address.trim(),
    p_tax_id: values.tax_id.trim(),
    p_receipt_header: values.receipt_header.trim(),
    p_receipt_footer: values.receipt_footer.trim(),
    p_default_language: values.default_language,
    p_default_theme: values.default_theme,
    p_base_currency: values.base_currency,
    p_usd_to_khr_rate: Number(values.usd_to_khr_rate),
    p_tax_percent: Number(values.tax_percent),
    p_low_stock_threshold: Number(values.low_stock_threshold),
    p_allow_negative_stock: Boolean(values.allow_negative_stock),
    p_receipt_width_mm: Number(values.receipt_width_mm),
    p_invoice_prefix: values.invoice_prefix.trim().toUpperCase(),
    p_receipt_show_logo: Boolean(values.receipt_show_logo),
    p_receipt_show_address: Boolean(values.receipt_show_address),
    p_receipt_show_phone: Boolean(values.receipt_show_phone),
    p_receipt_show_customer: Boolean(values.receipt_show_customer),
    p_receipt_show_cashier: Boolean(values.receipt_show_cashier),
    p_receipt_show_barcode: Boolean(values.receipt_show_barcode),
    p_label_width_mm: Number(values.label_width_mm),
    p_label_height_mm: Number(values.label_height_mm),
    p_label_columns: Number(values.label_columns),
    p_label_show_name: Boolean(values.label_show_name),
    p_label_show_price: Boolean(values.label_show_price),
    p_label_show_sku: Boolean(values.label_show_sku),
    p_label_barcode_format: values.label_barcode_format
  });

  if (error) throw error;
  return data;
}

export async function uploadShopLogo({ supabase, session, file }) {
  if (!file?.type?.startsWith("image/")) {
    throw new Error("Choose a valid logo image.");
  }

  if (file.size > 3 * 1024 * 1024) {
    throw new Error("The shop logo must be 3 MB or smaller.");
  }

  const signed = await authorizedPost(
    "/api/shop-logo",
    session.access_token,
    { action: "sign" }
  );

  const form = new FormData();
  form.append("file", file);
  form.append("api_key", signed.apiKey);
  form.append("timestamp", String(signed.timestamp));
  form.append("signature", signed.signature);
  form.append("folder", signed.folder);
  form.append("public_id", signed.publicId);
  form.append("overwrite", signed.overwrite);
  form.append("invalidate", signed.invalidate);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(signed.cloudName)}/image/upload`,
    { method: "POST", body: form }
  );
  const result = await response.json();

  if (!response.ok || !result.secure_url || !result.public_id) {
    throw new Error(result.error?.message || "Shop logo upload failed.");
  }

  const { data, error } = await supabase.rpc("set_shop_logo", {
    p_logo_url: result.secure_url,
    p_logo_public_id: result.public_id
  });

  if (error) throw error;
  return data;
}

export async function removeShopLogo({ supabase, session, publicId }) {
  if (publicId) {
    await authorizedPost("/api/shop-logo", session.access_token, {
      action: "delete",
      publicId
    });
  }

  const { data, error } = await supabase.rpc("set_shop_logo", {
    p_logo_url: null,
    p_logo_public_id: null
  });

  if (error) throw error;
  return data;
}
