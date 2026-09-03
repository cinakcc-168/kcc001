-- ============================================================================
-- Migration 80: Track the existing document numbering infrastructure
--
-- Purpose:
--   Capture the production document_counters table and the exact
--   private.next_document_number() implementation in migration history so a
--   fresh NEW Supabase project can reproduce the existing numbering system.
--
-- Safety:
--   - Does not reset or renumber existing counters.
--   - Does not alter existing document numbers.
--   - Keeps the exact production function signature and algorithm.
--   - Existing rows are preserved when the table already exists.
-- ============================================================================

create table if not exists public.document_counters (
  organization_id uuid not null,
  branch_id uuid not null,
  document_type text not null,
  counter_date date not null,
  last_number integer not null default 0,
  constraint document_counters_pkey
    primary key (organization_id, branch_id, document_type, counter_date),
  constraint document_counters_branch_id_fkey
    foreign key (branch_id) references public.branches(id) on delete cascade,
  constraint document_counters_organization_id_fkey
    foreign key (organization_id) references public.organizations(id) on delete cascade,
  constraint document_counters_document_type_check
    check (document_type ~ '^[A-Z0-9_-]{1,12}$'),
  constraint document_counters_last_number_check
    check (last_number >= 0)
);

-- If the table already existed with the expected primary key/constraints,
-- the CREATE TABLE above is a no-op. The following checks fail loudly rather
-- than silently accepting an incompatible existing table.

do $$
begin
  if to_regclass('public.document_counters') is null then
    raise exception 'document_counters table is required';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.document_counters'::regclass
      and contype = 'p'
      and pg_get_constraintdef(oid) =
          'PRIMARY KEY (organization_id, branch_id, document_type, counter_date)'
  ) then
    raise exception 'document_counters primary key does not match the tracked production definition';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema='public'
      and table_name='document_counters'
      and column_name='last_number'
      and data_type='integer'
      and is_nullable='NO'
  ) then
    raise exception 'document_counters.last_number does not match the tracked production definition';
  end if;
end $$;

-- Reproduce the exact live production function body/signature.
create or replace function private.next_document_number(
  p_organization_id uuid,
  p_branch_id uuid,
  p_document_type text
)
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_number integer;
  v_branch_code text;
  v_doc_type text;
begin
  v_doc_type := upper(trim(p_document_type));

  if v_doc_type !~ '^[A-Z0-9_-]{1,12}$' then
    raise exception 'Invalid document type';
  end if;

  select b.code
  into v_branch_code
  from public.branches b
  where b.id = p_branch_id
    and b.organization_id = p_organization_id
    and b.is_active = true;

  if v_branch_code is null then
    raise exception 'Active branch not found';
  end if;

  insert into public.document_counters (
    organization_id,
    branch_id,
    document_type,
    counter_date,
    last_number
  )
  values (
    p_organization_id,
    p_branch_id,
    v_doc_type,
    current_date,
    1
  )
  on conflict (organization_id, branch_id, document_type, counter_date)
  do update
    set last_number = public.document_counters.last_number + 1
  returning last_number into v_number;

  return format(
    '%s-%s-%s-%s',
    v_doc_type,
    v_branch_code,
    to_char(current_date, 'YYYYMMDD'),
    lpad(v_number::text, 5, '0')
  );
end;
$function$;

-- Keep the private helper non-public. It is intended to be called by
-- controlled SECURITY DEFINER routines, as in the existing application.
revoke all on function private.next_document_number(uuid,uuid,text) from public, anon, authenticated;
grant execute on function private.next_document_number(uuid,uuid,text) to service_role;

-- Verification-only comments:
-- expected table:
--   organization_id uuid NOT NULL
--   branch_id uuid NOT NULL
--   document_type text NOT NULL
--   counter_date date NOT NULL
--   last_number integer NOT NULL DEFAULT 0
-- expected primary key:
--   (organization_id, branch_id, document_type, counter_date)
-- expected function:
--   private.next_document_number(uuid,uuid,text) RETURNS text
--   SECURITY DEFINER
--   search_path = public, pg_temp
