# Migration file numbering

Migrations in this folder are intended to run in filename sort order:

```bash
ls database/*.sql | sort
```

The repository has a small historical numbering irregularity:

- **57 is missing.** It was never assigned to a migration. No current code or patch manifest references a migration 57. Do not create a fake 57 just to close the numeric gap.
- **63 is duplicated.** The two files are:
  - `63_step46_24_receipt_center_invoice_settings_fix.sql`
  - `63_step46_25_backup_center_scheduling_drive.sql`

  Their suffixes establish the intended Step 46.24 → Step 46.25 order under normal filename sorting. Do not rename already-applied historical migrations just to make the numbers unique.

## Current latest migration

The latest migration tracked in the current 2026-09-03 baseline is:

```text
79_step46_54_drop_orphaned_save_product_promotion_overload.sql
```

The recent migrations are:

- `69_storefront_phone_lookup_rate_limit.sql` — rate-limits the public order lookup and removes the unthrottled two-argument overload.
- `70_fix_customer_checkout_rowtype_mismatch.sql` — fixes named-customer checkout price resolution by selecting the full customer row.
- `71_receipt_center_sale_document_type_inline.sql` — widens the sale document type constraint for the Settings preference.
- `72_step46_44_batch_transfer_root_cause_reconciliation.sql` — hardens modern batch transfers and adds audited batch/inventory reconciliation.
- `73_step46_45_product_promotions.sql` — adds product promotions and promotion-aware pricing/stacking.
- `74_step46_46_product_promotions_online_limits.sql` — adds online promotion eligibility and reservation/quantity-limit handling.
- `75_step46_52_product_promotion_unit_rules.sql` — adds selling-unit-specific promotion rules and limits.
- `76_online_store_customer_phone_matching.sql` — links online orders to existing POS customers by normalized phone and prevents race-condition duplicate creation.
- `77_product_promotions_strict_unit_rules.sql` — makes promotion lookup and quantity claiming strictly dependent on the exact product selling unit.
- `78_step46_53_sale_document_preference_fix.sql` — fixes sale document preference coercion while preserving the existing `update_shop_settings_v2(jsonb) RETURNS public.app_settings` signature and strict organization scoping.
- `79_step46_54_drop_orphaned_save_product_promotion_overload.sql` — drops the stale 12-argument `save_product_promotion` overload left live by migration 74's parameter-list change, closing a bypass of the allow_online/max_base_quantity validation.

## Installation safety

- Run migrations only in the **new Supabase project**.
- Run each historical migration once.
- Do not modify old migrations after they have been applied.
- Add a new migration for future database changes.
- Check `VERIFY.sql` after the latest migration sequence.
