-- Optional verification after Patch 46.24
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'app_settings'
  and column_name in ('invoice_show_shop_name','invoice_show_product_code')
order by column_name;

select proname
from pg_proc
join pg_namespace n on n.oid = pg_proc.pronamespace
where n.nspname = 'public'
  and proname = 'update_shop_settings_v2';
