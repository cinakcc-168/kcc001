-- ============================================================================
-- Migration 78: Fix Sale Document Type Preference and Coercion Issues
--
-- IMPORTANT:
-- Keep the existing update_shop_settings_v2(jsonb) return type as
-- public.app_settings. The live function already exists with that signature,
-- and PostgreSQL does not allow changing an existing function's return type
-- with CREATE OR REPLACE FUNCTION.
--
-- This migration:
--   1. Expands the sale_document_type check constraint to support:
--      receipt, invoice, inline, ask, choice
--   2. Normalizes ask/choice to inline on save.
--   3. Preserves the existing function return type: public.app_settings.
--   4. Keeps every app_settings update scoped to the authenticated user's org.
--   5. Does NOT use a dangerous "first row" fallback update.
--   6. Preserves all existing receipt/invoice/label settings.
-- ============================================================================

begin;

-- --------------------------------------------------------------------------
-- 1. Authentication helper / constraint
-- --------------------------------------------------------------------------

do $$
begin
  alter table public.app_settings
    drop constraint if exists app_settings_sale_document_type_check;

  alter table public.app_settings
    add constraint app_settings_sale_document_type_check
    check (sale_document_type in ('receipt', 'invoice', 'inline', 'ask', 'choice'));
exception
  when others then
    -- Keep migration additive/safe if the constraint is managed elsewhere.
    raise notice 'sale_document_type constraint update skipped: %', SQLERRM;
end $$;

-- --------------------------------------------------------------------------
-- 2. Replace function without changing its return type
--    Existing signature: update_shop_settings_v2(jsonb) RETURNS app_settings
-- --------------------------------------------------------------------------

create or replace function public.update_shop_settings_v2(
  p_settings jsonb
)
returns public.app_settings
language plpgsql
security definer
set search_path = public, private, auth, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_result public.app_settings%rowtype;
  v_doc_type text;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_settings is null then
    raise exception 'Shop settings payload is required';
  end if;

  -- Resolve the caller's organization. Never fall back to an arbitrary
  -- app_settings row because that could update the wrong organization.
  select p.organization_id
    into v_org_id
  from public.profiles p
  where p.id = v_user_id
  limit 1;

  if v_org_id is null then
    raise exception 'Organization not found for current user';
  end if;

  -- Accept either payload key form for compatibility with the existing
  -- settings client and normalize ask/choice to inline.
  v_doc_type := lower(
    trim(
      coalesce(
        p_settings->>'p_sale_document_type',
        p_settings->>'sale_document_type',
        'receipt'
      )
    )
  );

  if v_doc_type not in ('receipt', 'invoice', 'inline', 'ask', 'choice') then
    v_doc_type := 'receipt';
  end if;

  if v_doc_type in ('ask', 'choice') then
    v_doc_type := 'inline';
  end if;

  update public.app_settings
  set
    shop_name = coalesce(nullif(trim(p_settings->>'p_shop_name'), ''), shop_name),
    shop_name_km = coalesce(nullif(trim(p_settings->>'p_shop_name_km'), ''), shop_name_km),
    shop_phone = nullif(trim(p_settings->>'p_shop_phone'), ''),
    shop_email = nullif(trim(p_settings->>'p_shop_email'), ''),
    shop_address = nullif(trim(p_settings->>'p_shop_address'), ''),
    shop_address_km = nullif(trim(p_settings->>'p_shop_address_km'), ''),
    tax_id = nullif(trim(p_settings->>'p_tax_id'), ''),
    receipt_header = nullif(trim(p_settings->>'p_receipt_header'), ''),
    receipt_header_km = nullif(trim(p_settings->>'p_receipt_header_km'), ''),
    receipt_footer = coalesce(nullif(trim(p_settings->>'p_receipt_footer'), ''), receipt_footer),
    receipt_footer_km = nullif(trim(p_settings->>'p_receipt_footer_km'), ''),
    default_language = coalesce(nullif(trim(p_settings->>'p_default_language'), ''), default_language),
    receipt_default_language = coalesce(nullif(trim(p_settings->>'p_receipt_default_language'), ''), receipt_default_language),
    default_theme = coalesce(nullif(trim(p_settings->>'p_default_theme'), ''), default_theme),
    base_currency = coalesce(nullif(trim(p_settings->>'p_base_currency'), ''), base_currency),
    usd_to_khr_rate = coalesce((p_settings->>'p_usd_to_khr_rate')::numeric, usd_to_khr_rate),
    tax_percent = coalesce((p_settings->>'p_tax_percent')::numeric, tax_percent),
    low_stock_threshold = coalesce((p_settings->>'p_low_stock_threshold')::integer, low_stock_threshold),
    allow_negative_stock = coalesce((p_settings->>'p_allow_negative_stock')::boolean, allow_negative_stock),
    receipt_width_mm = coalesce((p_settings->>'p_receipt_width_mm')::integer, receipt_width_mm),
    invoice_prefix = coalesce(nullif(trim(p_settings->>'p_invoice_prefix'), ''), invoice_prefix),
    receipt_show_logo = coalesce((p_settings->>'p_receipt_show_logo')::boolean, receipt_show_logo),
    receipt_show_address = coalesce((p_settings->>'p_receipt_show_address')::boolean, receipt_show_address),
    receipt_show_phone = coalesce((p_settings->>'p_receipt_show_phone')::boolean, receipt_show_phone),
    receipt_show_customer = coalesce((p_settings->>'p_receipt_show_customer')::boolean, receipt_show_customer),
    receipt_show_cashier = coalesce((p_settings->>'p_receipt_show_cashier')::boolean, receipt_show_cashier),
    receipt_show_barcode = coalesce((p_settings->>'p_receipt_show_barcode')::boolean, receipt_show_barcode),
    receipt_logo_position = coalesce(nullif(trim(p_settings->>'p_receipt_logo_position'), ''), receipt_logo_position),
    sale_document_type = v_doc_type,
    invoice_paper_size = coalesce(nullif(trim(p_settings->>'p_invoice_paper_size'), ''), invoice_paper_size),
    invoice_title = coalesce(nullif(trim(p_settings->>'p_invoice_title'), ''), invoice_title),
    invoice_title_km = coalesce(nullif(trim(p_settings->>'p_invoice_title_km'), ''), invoice_title_km),
    invoice_footer = coalesce(nullif(trim(p_settings->>'p_invoice_footer'), ''), invoice_footer),
    invoice_footer_km = coalesce(nullif(trim(p_settings->>'p_invoice_footer_km'), ''), invoice_footer_km),
    invoice_show_logo = coalesce((p_settings->>'p_invoice_show_logo')::boolean, invoice_show_logo),
    invoice_show_shop_name = coalesce((p_settings->>'p_invoice_show_shop_name')::boolean, invoice_show_shop_name),
    invoice_show_address = coalesce((p_settings->>'p_invoice_show_address')::boolean, invoice_show_address),
    invoice_show_contact = coalesce((p_settings->>'p_invoice_show_contact')::boolean, invoice_show_contact),
    invoice_show_tax_id = coalesce((p_settings->>'p_invoice_show_tax_id')::boolean, invoice_show_tax_id),
    invoice_show_customer = coalesce((p_settings->>'p_invoice_show_customer')::boolean, invoice_show_customer),
    invoice_show_cashier = coalesce((p_settings->>'p_invoice_show_cashier')::boolean, invoice_show_cashier),
    invoice_show_received = coalesce((p_settings->>'p_invoice_show_received')::boolean, invoice_show_received),
    invoice_show_change = coalesce((p_settings->>'p_invoice_show_change')::boolean, invoice_show_change),
    invoice_show_signatures = coalesce((p_settings->>'p_invoice_show_signatures')::boolean, invoice_show_signatures),
    label_width_mm = coalesce((p_settings->>'p_label_width_mm')::numeric, label_width_mm),
    label_height_mm = coalesce((p_settings->>'p_label_height_mm')::numeric, label_height_mm),
    label_columns = coalesce((p_settings->>'p_label_columns')::integer, label_columns),
    label_show_name = coalesce((p_settings->>'p_label_show_name')::boolean, label_show_name),
    label_show_price = coalesce((p_settings->>'p_label_show_price')::boolean, label_show_price),
    label_show_sku = coalesce((p_settings->>'p_label_show_sku')::boolean, label_show_sku),
    label_barcode_format = coalesce(nullif(trim(p_settings->>'p_label_barcode_format'), ''), label_barcode_format),
    updated_by = v_user_id,
    updated_at = now()
  where organization_id = v_org_id
  returning * into v_result;

  if not found then
    raise exception 'Shop settings row not found for organization %', v_org_id;
  end if;

  return v_result;
end;
$$;

commit;
