import { createClient } from "@supabase/supabase-js";
import { json, requireManager } from "./_auth.mjs";

export default async (request) => {
  if (request.method !== "POST") {
    return json({ ok: false, error: "Method not allowed." }, 405);
  }

  try {
    const { profile } = await requireManager(request, "settings.manage");

    if (!profile?.organization_id) {
      return json({ ok: false, error: "Organization ID not found." }, 400);
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return json({ ok: false, error: "Supabase server configuration missing." }, 500);
    }

    const admin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const body = await request.json();

    const allowedColumns = [
      "shop_name",
      "shop_name_km",
      "shop_phone",
      "shop_email",
      "shop_address",
      "shop_address_km",
      "tax_id",
      "receipt_header",
      "receipt_header_km",
      "receipt_footer",
      "receipt_footer_km",
      "default_language",
      "receipt_default_language",
      "default_theme",
      "base_currency",
      "usd_to_khr_rate",
      "tax_percent",
      "low_stock_threshold",
      "allow_negative_stock",
      "receipt_width_mm",
      "invoice_prefix",
      "receipt_show_logo",
      "receipt_show_address",
      "receipt_show_phone",
      "receipt_show_customer",
      "receipt_show_cashier",
      "receipt_show_barcode",
      "receipt_logo_position",
      "sale_document_type",
      "invoice_paper_size",
      "invoice_title",
      "invoice_title_km",
      "invoice_footer",
      "invoice_footer_km",
      "invoice_show_logo",
      "invoice_show_shop_name",
      "invoice_show_address",
      "invoice_show_contact",
      "invoice_show_tax_id",
      "invoice_show_customer",
      "invoice_show_cashier",
      "invoice_show_received",
      "invoice_show_change",
      "invoice_show_signatures",
      "invoice_show_product_code",
      "label_width_mm",
      "label_height_mm",
      "label_columns",
      "label_show_name",
      "label_show_price",
      "label_show_sku",
      "label_barcode_format",
      "timezone"
    ];

    const cleanPayload = {};
    for (const col of allowedColumns) {
      if (body[col] !== undefined) {
        cleanPayload[col] = body[col];
      }
    }

    cleanPayload.updated_at = new Date().toISOString();
    cleanPayload.updated_by = profile.id;

    // Check if a row exists for this organization
    const { data: existingRows } = await admin
      .from("app_settings")
      .select("id, organization_id")
      .eq("organization_id", profile.organization_id)
      .limit(1);

    let resultRow = null;

    if (existingRows && existingRows.length > 0) {
      const { data: updatedRows, error: updateError } = await admin
        .from("app_settings")
        .update(cleanPayload)
        .eq("id", existingRows[0].id)
        .select();

      if (updateError) {
        return json({ ok: false, error: updateError.message }, 400);
      }
      resultRow = updatedRows?.[0] || updatedRows;
    } else {
      // Check if any app_settings row exists at all to update
      const { data: anyRows } = await admin
        .from("app_settings")
        .select("id, organization_id")
        .limit(1);

      if (anyRows && anyRows.length > 0) {
        cleanPayload.organization_id = profile.organization_id;
        const { data: updatedRows, error: updateError } = await admin
          .from("app_settings")
          .update(cleanPayload)
          .eq("id", anyRows[0].id)
          .select();

        if (updateError) {
          return json({ ok: false, error: updateError.message }, 400);
        }
        resultRow = updatedRows?.[0] || updatedRows;
      } else {
        // Insert new settings row
        cleanPayload.organization_id = profile.organization_id;
        const { data: insertedRows, error: insertError } = await admin
          .from("app_settings")
          .insert(cleanPayload)
          .select();

        if (insertError) {
          return json({ ok: false, error: insertError.message }, 400);
        }
        resultRow = insertedRows?.[0] || insertedRows;
      }
    }

    return json({ ok: true, data: resultRow });
  } catch (error) {
    return json({ ok: false, error: error.message }, error.status || 500);
  }
};
