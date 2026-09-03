-- ============================================================================
-- Tiny POS Patch 71 — Allow 'inline', 'ask', 'choice' in app_settings.sale_document_type
-- Additive migration. Drops the restrictive 2-item check constraint and adds
-- support for 'inline' (Ask / Choice) document preference.
-- ============================================================================

begin;

alter table public.app_settings
  drop constraint if exists app_settings_sale_document_type_check;

alter table public.app_settings
  add constraint app_settings_sale_document_type_check
  check (sale_document_type in ('receipt', 'invoice', 'inline', 'ask', 'choice'));

commit;
