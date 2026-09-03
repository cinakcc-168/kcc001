export async function loadProductPromotionsWorkspace(supabase, profile) {
  const [promotionResult, productResult, branchResult, categoryResult] = await Promise.all([
    supabase
      .from("product_promotions")
      .select("id,name,branch_id,discount_type,discount_value,starts_at,ends_at,allow_coupon,allow_manual_discount,allow_online,max_base_quantity,reserved_base_quantity,is_active,notes,product_promotion_items(id,product_id,product_unit_id,max_unit_quantity,reserved_unit_quantity)")
      .eq("organization_id", profile.organization_id)
      .order("created_at", { ascending: false }),
    supabase
      .from("products")
      .select("id,name,name_km,sku,barcode,currency,category_id,is_active,product_units(id,name,short_name,conversion_factor,selling_price,is_base,is_active,sort_order,barcode)")
      .eq("organization_id", profile.organization_id)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("branches")
      .select("id,name,is_active")
      .eq("organization_id", profile.organization_id)
      .order("name"),
    supabase
      .from("categories")
      .select("id,name")
      .eq("organization_id", profile.organization_id)
      .order("name")
  ]);
  for (const result of [promotionResult, productResult, branchResult, categoryResult]) {
    if (result.error) throw result.error;
  }
  const productMap = new Map((productResult.data || []).map((row) => [row.id, row]));
  const promotions = (promotionResult.data || []).map((row) => ({
    ...row,
    promotion_items: (row.product_promotion_items || []).map((item) => ({ ...item, product: productMap.get(item.product_id) || null })),
    products: (row.product_promotion_items || []).map((item) => productMap.get(item.product_id)).filter(Boolean)
  }));
  return { promotions, products: productResult.data || [], branches: branchResult.data || [], categories: categoryResult.data || [] };
}

export async function saveProductPromotion(supabase, values) {
  const { data, error } = await supabase.rpc("save_product_promotion_v2", {
    p_promotion_id: values.id || null,
    p_name: String(values.name || "").trim(),
    p_branch_id: values.branch_id || null,
    p_discount_type: values.discount_type || "percent",
    p_discount_value: Number(values.discount_value || 0),
    p_starts_at: values.starts_at,
    p_ends_at: values.ends_at || null,
    p_allow_coupon: values.allow_coupon !== false,
    p_allow_manual_discount: values.allow_manual_discount !== false,
    p_allow_online: values.allow_online !== false,
    p_is_active: values.is_active !== false,
    p_notes: String(values.notes || "").trim() || null,
    p_items: values.promotion_items || []
  });
  if (error) throw error;
  return data?.promotion || data;
}

export async function toggleProductPromotionActive(supabase, profile, promotionId, isActive) {
  const { data, error } = await supabase
    .from("product_promotions")
    .update({ is_active: Boolean(isActive) })
    .eq("id", promotionId)
    .eq("organization_id", profile.organization_id)
    .select();
  if (error) throw error;
  return data;
}

export async function deleteProductPromotion(supabase, profile, promotionId) {
  // First attempt to delete associated promotion items if constraint requires it
  try {
    await supabase
      .from("product_promotion_items")
      .delete()
      .eq("product_promotion_id", promotionId);
  } catch (_e) {
    // Ignore error if column name or cascade handles it
  }
  try {
    await supabase
      .from("product_promotion_items")
      .delete()
      .eq("promotion_id", promotionId);
  } catch (_e) {
    // Ignore error if column name or cascade handles it
  }

  const { error } = await supabase
    .from("product_promotions")
    .delete()
    .eq("id", promotionId)
    .eq("organization_id", profile.organization_id);
  if (error) throw error;
  return true;
}

