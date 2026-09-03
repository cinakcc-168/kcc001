-- Tiny POS database verification
-- Current coverage: migrations 69 through 78.
-- Run this in the NEW Supabase project's SQL Editor after the relevant
-- migrations have been installed. An empty result generally means the
-- corresponding migration has not been applied yet or its expected object
-- differs from the current baseline.

-- 46.24 / 61-63: Receipt Center / Invoice settings columns and v2 save function.
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'app_settings'
  and column_name in (
    'invoice_show_shop_name',
    'invoice_show_product_code'
  )
order by column_name;
-- expect: 2 rows

select p.proname,
       pg_get_function_identity_arguments(p.oid) as args,
       pg_get_function_result(p.oid) as result_type
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'update_shop_settings_v2';
-- expect: 1 row, args = 'p_settings jsonb', result_type contains 'app_settings'

-- 46.35 / migration 68: critical cash register override permission and close function.
select permission_key, risk_level, default_roles
from public.permission_definitions
where permission_key = 'cash_register.override';
-- expect: 1 row, risk_level = 'critical', default_roles = '{}'

select p.proname,
       pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'close_cash_register_v2';
-- expect: 1 row

-- Migration 69: public phone lookup throttle + only the three-argument lookup.
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name = 'storefront_lookup_attempts';
-- expect: 1 row

select relrowsecurity
from pg_class
where oid = 'public.storefront_lookup_attempts'::regclass;
-- expect: true

select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'find_public_orders_by_phone'
order by args;
-- expect: one active three-argument signature; the old two-argument overload should be absent.

-- Migration 70: named-customer checkout rowtype fix.
select p.proname,
       pg_get_function_identity_arguments(p.oid) as args,
       pg_get_functiondef(p.oid) like '%select c.* into v_customer%' as fix_applied
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'private'
  and p.proname = 'resolve_standard_sales_unit_price';
-- expect: 1 row, fix_applied = true

-- Migration 71: sale_document_type accepts the newer Settings values.
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.app_settings'::regclass
  and conname = 'app_settings_sale_document_type_check';
-- expect: 1 row and definition contains receipt/invoice/inline/ask/choice

-- Migration 72: audited server-side batch reconciliation RPC.
select p.proname,
       pg_get_function_identity_arguments(p.oid) as args,
       pg_get_function_result(p.oid) as result_type
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'reconcile_product_batches_v1';
-- expect: 1 row

-- Migration 73: Product Promotions core tables + RLS + authoritative pricing functions.
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('product_promotions', 'product_promotion_items')
order by table_name;
-- expect: 2 rows

select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('product_promotions', 'product_promotion_items')
order by c.relname;
-- expect: 2 rows, both rls_enabled = true

select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('save_product_promotion', 'complete_sale_v3_price', 'preview_coupon_v2')
order by p.proname;
-- expect: 3 rows

select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'private'
  and p.proname in ('active_product_promotion_v1', 'product_promotion_summary_v1')
order by p.proname;
-- expect: 2 rows

-- Migration 74: online promotion eligibility and reservation-capacity fields/functions.
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'product_promotions'
  and column_name in ('allow_online', 'max_base_quantity', 'reserved_base_quantity')
order by column_name;
-- expect: 3 rows

select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'private'
  and p.proname in ('active_product_promotion_v2', 'claim_product_promotion_units_v1')
order by p.proname;
-- expect: 2 rows

-- Migration 75: selling-unit-specific promotion fields and v2 claim/save functions.
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'product_promotion_items'
  and column_name in ('product_unit_id', 'max_unit_quantity', 'reserved_unit_quantity')
order by column_name;
-- expect: 3 rows

select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'save_product_promotion_v2'
union all
select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'private'
  and p.proname = 'claim_product_promotion_units_v2';
-- expect: 2 rows

-- Migration 76: normalized-phone helper and authoritative online customer resolver.
select p.proname,
       pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'private'
  and p.proname in ('normalize_phone', 'resolve_online_order_customer')
order by p.proname;
-- expect: 2 rows

select indexname
from pg_indexes
where schemaname = 'public'
  and indexname = 'customers_org_normalized_phone_idx';
-- expect: 1 row

select p.proname,
       pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('submit_online_order', 'receive_online_order')
order by p.proname;
-- expect: 2 rows

-- Migration 77: strict exact-unit promotion lookup and claiming.
select p.proname,
       pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'private'
  and p.proname in ('active_product_promotion_v2', 'claim_product_promotion_units_v2')
order by p.proname;
-- expect: 2 rows

select indexname
from pg_indexes
where schemaname = 'public'
  and indexname = 'product_promotion_items_strict_unit_idx';
-- expect: 1 row

-- Migration 78: sale document preference fix.
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.app_settings'::regclass
  and conname = 'app_settings_sale_document_type_check';
-- expect: 1 row and definition contains receipt/invoice/inline/ask/choice

select p.proname,
       pg_get_function_identity_arguments(p.oid) as args,
       pg_get_function_result(p.oid) as result_type,
       pg_get_functiondef(p.oid) like '%where organization_id = v_org_id%' as org_scoped_update
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'update_shop_settings_v2';
-- expect: 1 row, result_type contains app_settings, org_scoped_update = true

-- Migration 79: drop the orphaned pre-online-limits save_product_promotion overload.
select p.proname,
       pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'save_product_promotion'
order by args;
-- expect: exactly 1 row (the 14-argument version from migration 74, including
-- p_allow_online and p_max_base_quantity). The 12-argument version must be gone.

-- Optional current-state inventory mismatch check (replace ORG_UUID if needed):
-- select p.id, p.name, b.branch_id, b.quantity as inventory_quantity,
--        coalesce(sum(ib.quantity) filter (where ib.status <> 'depleted'),0) as batch_quantity
-- from public.products p
-- join public.inventory_balances b on b.product_id=p.id
-- left join public.inventory_batches ib
--   on ib.product_id=p.id and ib.branch_id=b.branch_id and ib.organization_id=b.organization_id
-- where p.organization_id = '<ORG_UUID>'
--   and p.batch_tracking = true
-- group by p.id,p.name,b.branch_id,b.quantity
-- having abs(b.quantity-coalesce(sum(ib.quantity) filter (where ib.status <> 'depleted'),0)) > 0.0005;
-- expect: 0 rows after reconciliation.


-- Migration 80: document numbering reproducibility.
select
  count(*) as expected_columns,
  count(*) filter (where column_name in (
    'organization_id','branch_id','document_type','counter_date','last_number'
  )) as required_columns
from information_schema.columns
where table_schema='public'
  and table_name='document_counters';
-- expect: expected_columns=5, required_columns=5

select
  conname,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid='public.document_counters'::regclass
  and conname='document_counters_pkey';
-- expect: 1 row

select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as args,
  pg_get_function_result(p.oid) as result_type,
  p.prosecdef as security_definer,
  regexp_replace(lower(pg_get_functiondef(p.oid)), '\s+', ' ', 'g') like '%on conflict (organization_id, branch_id, document_type, counter_date)%' as atomic_counter,
  pg_get_functiondef(p.oid) like '%return format(%' as formatted_document_number
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='private'
  and p.proname='next_document_number';
-- expect: 1 row, args match uuid,uuid,text; result_type=text;
-- security_definer=true; atomic_counter=true; formatted_document_number=true

-- Expected tracked production format:
--   DOCUMENT_TYPE-BRANCH_CODE-YYYYMMDD-00001
