export function money(value, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: currency === "KHR" ? 0 : 2,
    maximumFractionDigits: currency === "KHR" ? 0 : 2
  }).format(Number(value || 0));
}

export function stockNumber(value) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 3
  }).format(Number(value || 0));
}

export function cloudinaryThumb(url, width = 120, height = 120) {
  if (!url || !url.includes("/upload/")) return url || "";
  return url.replace(
    "/upload/",
    `/upload/f_auto,q_auto,c_fill,w_${width},h_${height}/`
  );
}

export async function loadCatalog(supabase, organizationId, branchId) {
  const [categoryResult, productResult] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name, description, sort_order, is_active, created_at")
      .eq("organization_id", organizationId)
      .order("sort_order")
      .order("name"),
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
        description,
        unit_name,
        selling_price,
        default_cost,
        currency,
        track_stock,
        allow_negative_stock,
        low_stock_threshold,
        is_active,
        created_at,
        updated_at,
        categories (id, name),
        product_images (
          id,
          cloudinary_public_id,
          secure_url,
          width,
          height,
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
      .order("name")
  ]);

  if (categoryResult.error) throw categoryResult.error;
  if (productResult.error) throw productResult.error;

  const products = (productResult.data || []).map((product) => {
    const balance = (product.inventory_balances || []).find(
      (row) => row.branch_id === branchId
    );
    const image = [...(product.product_images || [])].sort(
      (a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order
    )[0];

    return {
      ...product,
      stock_quantity: Number(balance?.quantity || 0),
      average_cost: Number(balance?.average_cost || product.default_cost || 0),
      image: image || null
    };
  });

  return { categories: categoryResult.data || [], products };
}

export async function createCategory(supabase, profile, values) {
  const { data, error } = await supabase
    .from("categories")
    .insert({
      organization_id: profile.organization_id,
      name: values.name.trim(),
      description: values.description.trim() || null,
      sort_order: Number(values.sort_order || 0),
      is_active: values.is_active,
      created_by: profile.id
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateCategory(supabase, categoryId, values) {
  const { data, error } = await supabase
    .from("categories")
    .update({
      name: values.name.trim(),
      description: values.description.trim() || null,
      sort_order: Number(values.sort_order || 0),
      is_active: values.is_active
    })
    .eq("id", categoryId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function createProduct(supabase, values) {
  const { data, error } = await supabase.rpc("create_pos_product", {
    p_name: values.name.trim(),
    p_category_id: values.category_id || null,
    p_name_km: values.name_km.trim() || null,
    p_sku: values.sku.trim() || null,
    p_barcode: values.barcode.trim() || null,
    p_description: values.description.trim() || null,
    p_unit_name: values.unit_name.trim(),
    p_selling_price: Number(values.selling_price || 0),
    p_default_cost: Number(values.default_cost || 0),
    p_currency: values.currency,
    p_track_stock: values.track_stock,
    p_allow_negative_stock: values.allow_negative_stock,
    p_low_stock_threshold: Number(values.low_stock_threshold || 0),
    p_opening_quantity: Number(values.opening_quantity || 0),
    p_is_active: values.is_active
  });

  if (error) throw error;
  return data;
}

export async function updateProduct(supabase, productId, values) {
  const { data, error } = await supabase.rpc("update_pos_product", {
    p_product_id: productId,
    p_name: values.name.trim(),
    p_category_id: values.category_id || null,
    p_name_km: values.name_km.trim() || null,
    p_sku: values.sku.trim() || null,
    p_barcode: values.barcode.trim() || null,
    p_description: values.description.trim() || null,
    p_unit_name: values.unit_name.trim(),
    p_selling_price: Number(values.selling_price || 0),
    p_default_cost: Number(values.default_cost || 0),
    p_currency: values.currency,
    p_track_stock: values.track_stock,
    p_allow_negative_stock: values.allow_negative_stock,
    p_low_stock_threshold: Number(values.low_stock_threshold || 0),
    p_is_active: values.is_active
  });

  if (error) throw error;
  return data;
}

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
  if (!response.ok || !data.ok) throw new Error(data.error || "Request failed.");
  return data;
}

export async function uploadPrimaryImage({
  supabase,
  session,
  profile,
  productId,
  file
}) {
  if (!file) return null;
  if (!file.type.startsWith("image/")) throw new Error("Choose a valid image file.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Image must be 5 MB or smaller.");

  const signed = await authorizedPost(
    "/api/cloudinary-signature",
    session.access_token,
    { productId }
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
  if (!response.ok || !result.secure_url) {
    throw new Error(result.error?.message || "Product image upload failed.");
  }

  const { data, error } = await supabase
    .from("product_images")
    .upsert(
      {
        organization_id: profile.organization_id,
        product_id: productId,
        cloudinary_public_id: result.public_id,
        secure_url: result.secure_url,
        width: result.width,
        height: result.height,
        sort_order: 0,
        is_primary: true,
        created_by: profile.id
      },
      { onConflict: "organization_id,cloudinary_public_id" }
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function removePrimaryImage({ supabase, session, image }) {
  if (!image) return;

  await authorizedPost("/api/cloudinary-delete", session.access_token, {
    publicId: image.cloudinary_public_id
  });

  const { error } = await supabase
    .from("product_images")
    .delete()
    .eq("id", image.id);

  if (error) throw error;
}
