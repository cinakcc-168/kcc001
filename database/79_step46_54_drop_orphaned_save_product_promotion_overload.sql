-- ============================================================================
-- Tiny POS — Step 46.54 Drop orphaned pre-online-limits save_product_promotion
-- overload
-- Run once, any time after 78_step46_53_sale_document_preference_fix.sql.
--
-- 74_step46_46_product_promotions_online_limits.sql changed
-- public.save_product_promotion()'s parameter list (inserted p_allow_online
-- and p_max_base_quantity) via `create or replace function`. Postgres
-- identifies a function by name + argument types, so a changed argument
-- list does not replace the old function — it creates a second, separate
-- overload alongside it. The original 12-argument version from
-- 73_step46_45_product_promotions.sql was never dropped, so it has stayed
-- live and callable ever since, still GRANTed to `authenticated`.
--
-- The app only ever calls save_product_promotion_v2() (added in
-- 75_step46_52_product_promotion_unit_rules.sql, see
-- src/lib/productPromotions.js), so this stale overload is unreachable from
-- the current UI. But it is still directly callable by any authenticated
-- POS session (e.g. supabase.rpc('save_product_promotion', {...}) with only
-- the params it shares with the old signature) and silently skips the
-- allow_online / max_base_quantity validation the 14-argument version
-- added — a business-logic bypass, not just dead code. Any call omitting
-- p_allow_online/p_max_base_quantity is also ambiguous between the two live
-- overloads and would raise a "function ... is not unique" error.
--
-- This drops only the stale 12-argument overload. The 14-argument version
-- from migration 74 is left in place untouched.
-- ============================================================================

begin;

revoke all on function public.save_product_promotion(
  uuid, text, uuid, public.discount_type, numeric, timestamptz, timestamptz,
  boolean, boolean, boolean, text, uuid[]
) from public, anon, authenticated, service_role;

drop function if exists public.save_product_promotion(
  uuid, text, uuid, public.discount_type, numeric, timestamptz, timestamptz,
  boolean, boolean, boolean, text, uuid[]
);

commit;
