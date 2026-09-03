begin;

-- ============================================================================
-- Step 46.45 — Product Promotions
-- Additive migration. Does not remove or reset existing coupon/discount data.
-- ============================================================================

create table if not exists public.product_promotions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 160),
  discount_type public.discount_type not null check (discount_type in ('percent','fixed')),
  discount_value numeric(14,4) not null check (discount_value > 0),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  allow_coupon boolean not null default true,
  allow_manual_discount boolean not null default true,
  is_active boolean not null default true,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at),
  check (discount_type <> 'percent' or discount_value <= 100)
);

create table if not exists public.product_promotion_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  promotion_id uuid not null references public.product_promotions(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (promotion_id, product_id)
);

create index if not exists product_promotions_org_active_dates_idx
  on public.product_promotions(organization_id, is_active, starts_at, ends_at);
create index if not exists product_promotions_branch_active_idx
  on public.product_promotions(branch_id, is_active);
create index if not exists product_promotion_items_product_idx
  on public.product_promotion_items(organization_id, product_id, promotion_id);

alter table public.product_promotions enable row level security;
alter table public.product_promotion_items enable row level security;

revoke all on public.product_promotions, public.product_promotion_items from anon;
grant select, insert, update, delete on public.product_promotions to authenticated;
grant select, insert, update, delete on public.product_promotion_items to authenticated;
grant all on public.product_promotions, public.product_promotion_items to service_role;

drop policy if exists product_promotions_select on public.product_promotions;
create policy product_promotions_select
on public.product_promotions for select to authenticated
using (organization_id = private.current_organization_id());

drop policy if exists product_promotions_manage on public.product_promotions;
create policy product_promotions_manage
on public.product_promotions for all to authenticated
using (organization_id = private.current_organization_id() and private.has_any_role(array['owner','admin','manager']::public.app_role[]))
with check (organization_id = private.current_organization_id() and private.has_any_role(array['owner','admin','manager']::public.app_role[]));

drop policy if exists product_promotion_items_select on public.product_promotion_items;
create policy product_promotion_items_select
on public.product_promotion_items for select to authenticated
using (organization_id = private.current_organization_id());

drop policy if exists product_promotion_items_manage on public.product_promotion_items;
create policy product_promotion_items_manage
on public.product_promotion_items for all to authenticated
using (organization_id = private.current_organization_id() and private.has_any_role(array['owner','admin','manager']::public.app_role[]))
with check (organization_id = private.current_organization_id() and private.has_any_role(array['owner','admin','manager']::public.app_role[]));

alter table public.sales
  add column if not exists promotion_discount_amount numeric(14,2) not null default 0 check (promotion_discount_amount >= 0);

alter table public.sale_items
  add column if not exists promotion_id uuid references public.product_promotions(id) on delete set null,
  add column if not exists promotion_discount_amount numeric(14,2) not null default 0 check (promotion_discount_amount >= 0);

create or replace function public.normalize_product_promotion()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.name := trim(new.name);
  new.notes := nullif(trim(new.notes), '');
  if new.discount_type = 'percent' and new.discount_value > 100 then
    raise exception 'Percentage promotion cannot exceed 100';
  end if;
  return new;
end $$;

drop trigger if exists normalize_product_promotion_before_write on public.product_promotions;
create trigger normalize_product_promotion_before_write
before insert or update on public.product_promotions
for each row execute function public.normalize_product_promotion();

drop trigger if exists set_product_promotions_updated_at on public.product_promotions;
create trigger set_product_promotions_updated_at
before update on public.product_promotions
for each row execute function public.set_updated_at();

create or replace function public.save_product_promotion(
  p_promotion_id uuid,
  p_name text,
  p_branch_id uuid default null,
  p_discount_type public.discount_type default 'percent',
  p_discount_value numeric default 0,
  p_starts_at timestamptz default now(),
  p_ends_at timestamptz default null,
  p_allow_coupon boolean default true,
  p_allow_manual_discount boolean default true,
  p_is_active boolean default true,
  p_notes text default null,
  p_product_ids uuid[] default '{}'
)
returns jsonb language plpgsql security definer
set search_path = public, private, auth, pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_profile record;
  v_promotion public.product_promotions%rowtype;
  v_product_id uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select organization_id, branch_id, role, is_active into v_profile from public.profiles where id=v_user;
  if not found or v_profile.is_active is not true then raise exception 'Active POS profile required'; end if;
  perform private.require_permission('coupons.manage');
  if nullif(trim(p_name),'') is null then raise exception 'Promotion name is required'; end if;
  if p_discount_value is null or p_discount_value <= 0 then raise exception 'Promotion discount must be greater than zero'; end if;
  if p_discount_type='percent' and p_discount_value>100 then raise exception 'Percentage promotion cannot exceed 100'; end if;
  if p_ends_at is not null and p_ends_at <= p_starts_at then raise exception 'Promotion end must be after start'; end if;
  if p_branch_id is not null and not exists(select 1 from public.branches b where b.id=p_branch_id and b.organization_id=v_profile.organization_id) then raise exception 'Branch not found'; end if;
  if coalesce(array_length(p_product_ids,1),0)=0 then raise exception 'Select at least one product'; end if;
  if exists(select 1 from unnest(p_product_ids) pid left join public.products p on p.id=pid and p.organization_id=v_profile.organization_id where p.id is null) then raise exception 'One or more products are invalid'; end if;

  if p_promotion_id is null then
    insert into public.product_promotions(organization_id,branch_id,name,discount_type,discount_value,starts_at,ends_at,allow_coupon,allow_manual_discount,is_active,notes,created_by,updated_by)
    values(v_profile.organization_id,p_branch_id,trim(p_name),p_discount_type,round(p_discount_value,4),p_starts_at,p_ends_at,coalesce(p_allow_coupon,true),coalesce(p_allow_manual_discount,true),coalesce(p_is_active,true),nullif(trim(p_notes),''),v_user,v_user)
    returning * into v_promotion;
  else
    update public.product_promotions set branch_id=p_branch_id,name=trim(p_name),discount_type=p_discount_type,discount_value=round(p_discount_value,4),starts_at=p_starts_at,ends_at=p_ends_at,allow_coupon=coalesce(p_allow_coupon,true),allow_manual_discount=coalesce(p_allow_manual_discount,true),is_active=coalesce(p_is_active,true),notes=nullif(trim(p_notes),''),updated_by=v_user,updated_at=now()
    where id=p_promotion_id and organization_id=v_profile.organization_id
    returning * into v_promotion;
    if not found then raise exception 'Promotion not found'; end if;
    delete from public.product_promotion_items where promotion_id=v_promotion.id and organization_id=v_profile.organization_id;
  end if;

  foreach v_product_id in array p_product_ids loop
    insert into public.product_promotion_items(organization_id,promotion_id,product_id)
    values(v_profile.organization_id,v_promotion.id,v_product_id);
  end loop;

  insert into public.audit_logs(organization_id,branch_id,user_id,action,entity_type,entity_id,new_data)
  values(v_profile.organization_id,coalesce(v_promotion.branch_id,v_profile.branch_id),v_user,'save_product_promotion','product_promotion',v_promotion.id,jsonb_build_object('name',v_promotion.name,'discount_type',v_promotion.discount_type,'discount_value',v_promotion.discount_value,'allow_coupon',v_promotion.allow_coupon,'allow_manual_discount',v_promotion.allow_manual_discount,'product_count',array_length(p_product_ids,1)));

  return jsonb_build_object('ok',true,'promotion',to_jsonb(v_promotion));
end $$;

revoke all on function public.save_product_promotion(uuid,text,uuid,public.discount_type,numeric,timestamptz,timestamptz,boolean,boolean,boolean,text,uuid[]) from public,anon;
grant execute on function public.save_product_promotion(uuid,text,uuid,public.discount_type,numeric,timestamptz,timestamptz,boolean,boolean,boolean,text,uuid[]) to authenticated,service_role;

create or replace function private.active_product_promotion_v1(
  p_org uuid,
  p_branch uuid,
  p_product_id uuid,
  p_unit_id uuid,
  p_currency public.currency_code,
  p_now timestamptz default now()
)
returns jsonb language plpgsql security definer
set search_path=public,private,auth,pg_temp as $$
declare v_row record; begin
  select pp.* into v_row
  from public.product_promotions pp
  join public.product_promotion_items pi on pi.promotion_id=pp.id and pi.organization_id=pp.organization_id
  where pp.organization_id=p_org and pi.product_id=p_product_id and pp.is_active is true
    and (pp.branch_id is null or pp.branch_id=p_branch)
    and pp.starts_at<=p_now and (pp.ends_at is null or pp.ends_at>=p_now)
  order by pp.starts_at desc, pp.created_at desc, pp.id desc
  limit 1;
  if not found then return null; end if;
  return jsonb_build_object('id',v_row.id,'name',v_row.name,'discount_type',v_row.discount_type,'discount_value',v_row.discount_value,'allow_coupon',v_row.allow_coupon,'allow_manual_discount',v_row.allow_manual_discount,'starts_at',v_row.starts_at,'ends_at',v_row.ends_at);
end $$;

create or replace function private.product_promotion_summary_v1(
  p_org uuid,p_branch uuid,p_customer_id uuid,p_items jsonb,p_currency public.currency_code
)
returns jsonb language plpgsql security definer
set search_path=public,private,auth,pg_temp as $$
declare v_item record; v_unit public.product_units%rowtype; v_product public.products%rowtype; v_price jsonb; v_promo jsonb; v_normal numeric:=0; v_promo_price numeric:=0; v_promo_discount numeric:=0; v_gross numeric:=0; v_after numeric:=0; v_coupon_base numeric:=0; v_manual_base numeric:=0;
begin
  for v_item in select x.product_id,x.product_unit_id,sum(x.quantity)::numeric quantity from jsonb_to_recordset(p_items) x(product_id uuid,product_unit_id uuid,quantity numeric) group by x.product_id,x.product_unit_id loop
    select * into v_product from public.products where id=v_item.product_id and organization_id=p_org; if not found then raise exception 'Product not found'; end if;
    select * into v_unit from public.product_units where organization_id=p_org and product_id=v_product.id and ((v_item.product_unit_id is not null and id=v_item.product_unit_id) or (v_item.product_unit_id is null and is_base=true)) limit 1; if not found then raise exception 'Selling unit unavailable for %',v_product.name; end if;
    v_price:=private.resolve_sales_unit_price(p_org,p_branch,p_customer_id,v_unit.id,p_currency,now());
    v_normal:=round((v_price->>'effective_price')::numeric*v_item.quantity,2);
    v_promo:=private.active_product_promotion_v1(p_org,p_branch,v_product.id,v_unit.id,p_currency,now());
    v_promo_price:=v_normal;
    if v_promo is not null then
      v_promo_price:=round(greatest(case when v_promo->>'discount_type'='percent' then v_normal*(1-least(greatest((v_promo->>'discount_value')::numeric,0),100)/100) else v_normal-greatest((v_promo->>'discount_value')::numeric,0)*v_item.quantity end,0),2);
    end if;
    v_gross:=v_gross+v_normal; v_after:=v_after+v_promo_price; v_promo_discount:=v_promo_discount+greatest(v_normal-v_promo_price,0);
    if v_promo is null or coalesce((v_promo->>'allow_coupon')::boolean,true) then v_coupon_base:=v_coupon_base+v_promo_price; end if;
    if v_promo is null or coalesce((v_promo->>'allow_manual_discount')::boolean,true) then v_manual_base:=v_manual_base+v_promo_price; end if;
  end loop;
  return jsonb_build_object('gross_subtotal',round(v_gross,2),'promo_subtotal',round(v_after,2),'promotion_discount_amount',round(v_promo_discount,2),'coupon_base_subtotal',round(v_coupon_base,2),'manual_base_subtotal',round(v_manual_base,2));
end $$;

revoke all on function private.active_product_promotion_v1(uuid,uuid,uuid,uuid,public.currency_code,timestamptz) from public;
grant execute on function private.active_product_promotion_v1(uuid,uuid,uuid,uuid,public.currency_code,timestamptz) to authenticated,service_role;
revoke all on function private.product_promotion_summary_v1(uuid,uuid,uuid,jsonb,public.currency_code) from public;
grant execute on function private.product_promotion_summary_v1(uuid,uuid,uuid,jsonb,public.currency_code) to authenticated,service_role;

-- Replace the authoritative pricing core with the same current implementation,
-- extended only for product promotions and coupon/manual stacking rules.
create or replace function public.complete_sale_v3_price(
  p_items jsonb,
  p_payment_method public.payment_method,
  p_amount_received numeric,
  p_customer_id uuid default null,
  p_manual_discount_type public.discount_type default 'none',
  p_manual_discount_value numeric default 0,
  p_coupon_code text default null,
  p_currency public.currency_code default 'USD',
  p_notes text default null,
  p_payment_reference text default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, auth, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile record;
  v_settings record;
  v_existing record;
  v_item record;
  v_product record;
  v_unit record;
  v_balance record;
  v_price jsonb;

  v_coupon jsonb;
  v_coupon_id uuid;
  v_coupon_code text;
  v_coupon_name text;
  v_coupon_discount_amount numeric(14,2) := 0;
  v_promotion_discount_amount numeric(14,2) := 0;
  v_promo_summary jsonb := '{}'::jsonb;
  v_promotion jsonb;
  v_promotion_id uuid;
  v_promotion_price numeric(14,2);
  v_promotion_line_discount numeric(14,2);
  v_external_discount_amount numeric(14,2) := 0;
  v_external_base_total numeric(14,2) := 0;
  v_external_allocated numeric(14,2) := 0;
  v_discount_base_line numeric(14,2) := 0;

  v_sale_id uuid;
  v_invoice_number text;

  v_subtotal numeric(14,2) := 0;
  v_discount_amount numeric(14,2) := 0;
  v_tax_amount numeric(14,2) := 0;
  v_total numeric(14,2) := 0;
  v_change numeric(14,2) := 0;

  v_display_discount_type public.discount_type := 'none';
  v_display_discount_value numeric(14,4) := 0;

  v_item_count integer := 0;
  v_item_index integer := 0;
  v_allocated_discount numeric(14,2) := 0;

  v_base_quantity numeric(14,3);
  v_line_subtotal numeric(14,2);
  v_line_discount numeric(14,2);
  v_line_total numeric(14,2);
  v_base_unit_cost numeric(14,4);
  v_selected_unit_cost numeric(14,4);
  v_line_cost numeric(14,4);
  v_list_unit_price numeric(14,2);
  v_effective_unit_price numeric(14,2);
  v_line_price_adjustment numeric(14,2);

  v_price_list_id uuid;
  v_price_list_name text;
  v_price_adjustment_total numeric(14,2) := 0;

  v_cost_total numeric(14,4) := 0;
  v_profit_total numeric(14,4) := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select
    p.organization_id,
    p.branch_id,
    p.role,
    p.is_active
  into v_profile
  from public.profiles p
  where p.id = v_user_id;

  if not found or v_profile.is_active is not true then
    raise exception 'Your POS account is inactive or missing';
  end if;

  if v_profile.branch_id is null then
    raise exception 'No branch is assigned to this user';
  end if;

  if v_profile.role not in ('owner','admin','manager','cashier') then
    raise exception 'Your role cannot complete sales';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'The cart is empty';
  end if;

  if p_amount_received is null or p_amount_received < 0 then
    raise exception 'Invalid received amount';
  end if;

  if p_idempotency_key is not null
     and length(trim(p_idempotency_key)) > 0 then
    select
      s.id,
      s.invoice_number,
      s.subtotal,
      s.discount_amount,
      s.tax_amount,
      s.total_amount,
      s.change_amount,
      s.cost_amount,
      s.gross_profit,
      s.price_list_id,
      s.price_list_name,
      s.price_adjustment_amount,
      s.coupon_code,
      s.coupon_discount_amount,
      s.promotion_discount_amount
    into v_existing
    from public.sales s
    where s.organization_id = v_profile.organization_id
      and s.idempotency_key = trim(p_idempotency_key)
    limit 1;

    if found then
      return jsonb_build_object(
        'ok', true,
        'duplicate_request', true,
        'sale_id', v_existing.id,
        'invoice_number', v_existing.invoice_number,
        'subtotal', v_existing.subtotal,
        'discount_amount', v_existing.discount_amount,
        'tax_amount', v_existing.tax_amount,
        'total_amount', v_existing.total_amount,
        'change_amount', v_existing.change_amount,
        'cost_amount', v_existing.cost_amount,
        'gross_profit', v_existing.gross_profit,
        'price_list_id', v_existing.price_list_id,
        'price_list_name', v_existing.price_list_name,
        'price_adjustment_amount',
          v_existing.price_adjustment_amount,
        'coupon_code', v_existing.coupon_code,
        'coupon_discount_amount', v_existing.coupon_discount_amount,
        'promotion_discount_amount', v_existing.promotion_discount_amount
      );
    end if;
  end if;

  if p_customer_id is not null and not exists (
    select 1
    from public.customers c
    where c.id = p_customer_id
      and c.organization_id = v_profile.organization_id
      and c.is_active = true
  ) then
    raise exception 'Customer not found or inactive';
  end if;

  select
    coalesce(s.allow_negative_stock, false) as allow_negative_stock,
    coalesce(s.tax_percent, 0) as tax_percent
  into v_settings
  from public.app_settings s
  where s.organization_id = v_profile.organization_id;

  v_promo_summary := private.product_promotion_summary_v1(
    v_profile.organization_id,
    v_profile.branch_id,
    p_customer_id,
    p_items,
    p_currency
  );
  v_subtotal := round((v_promo_summary ->> 'gross_subtotal')::numeric, 2);
  v_promotion_discount_amount := round(coalesce((v_promo_summary ->> 'promotion_discount_amount')::numeric, 0), 2);
  v_external_base_total := case
    when p_coupon_code is not null and length(trim(p_coupon_code)) > 0
      then round(coalesce((v_promo_summary ->> 'coupon_base_subtotal')::numeric, 0), 2)
    else round(coalesce((v_promo_summary ->> 'manual_base_subtotal')::numeric, 0), 2)
  end;

  if p_coupon_code is not null
     and length(trim(p_coupon_code)) > 0 then
    perform 1
    from public.coupons c
    where c.organization_id = v_profile.organization_id
      and upper(c.code) = upper(trim(p_coupon_code))
    for update;

    if not found then
      raise exception 'Coupon code not found';
    end if;

    v_coupon := private.evaluate_coupon(
      v_profile.organization_id,
      v_profile.branch_id,
      p_coupon_code,
      v_external_base_total,
      p_customer_id,
      p_currency,
      false
    );

    v_coupon_id := (v_coupon ->> 'id')::uuid;
    v_coupon_code := v_coupon ->> 'code';
    v_coupon_name := v_coupon ->> 'name';
    v_coupon_discount_amount := round((v_coupon ->> 'discount_amount')::numeric, 2);
    v_external_discount_amount := v_coupon_discount_amount;
    v_discount_amount := round(v_promotion_discount_amount + v_coupon_discount_amount, 2);
    v_display_discount_type :=
      (v_coupon ->> 'discount_type')::public.discount_type;
    v_display_discount_value :=
      (v_coupon ->> 'discount_value')::numeric;
  else
    if p_manual_discount_value is null
       or p_manual_discount_value < 0 then
      raise exception 'Invalid discount value';
    end if;

    if p_manual_discount_type = 'percent' then
      if p_manual_discount_value > 100 then
        raise exception 'Percentage discount cannot exceed 100';
      end if;

      v_external_discount_amount := round(
        v_external_base_total * p_manual_discount_value / 100,
        2
      );
      v_discount_amount := round(v_promotion_discount_amount + v_external_discount_amount, 2);
      v_display_discount_type := 'percent';
      v_display_discount_value := p_manual_discount_value;

    elsif p_manual_discount_type = 'fixed' then
      v_external_discount_amount := least(
        v_external_base_total,
        round(p_manual_discount_value, 2)
      );
      v_discount_amount := round(v_promotion_discount_amount + v_external_discount_amount, 2);
      v_display_discount_type := 'fixed';
      v_display_discount_value := p_manual_discount_value;

    else
      v_external_discount_amount := 0;
      v_discount_amount := round(v_promotion_discount_amount, 2);
      v_display_discount_type := 'none';
      v_display_discount_value := 0;
    end if;
  end if;

  v_tax_amount := round(
    greatest(v_subtotal - v_discount_amount, 0)
      * greatest(coalesce(v_settings.tax_percent, 0), 0) / 100,
    2
  );

  v_total := greatest(
    round(v_subtotal - v_discount_amount + v_tax_amount, 2),
    0
  );

  if p_amount_received < v_total then
    raise exception 'Received amount (%) is less than total (%)',
      p_amount_received, v_total;
  end if;

  if p_payment_method = 'cash' then
    v_change := round(p_amount_received - v_total, 2);
  else
    v_change := 0;
  end if;

  select count(*)
  into v_item_count
  from (
    select
      x.product_id,
      x.product_unit_id
    from jsonb_to_recordset(p_items)
      as x(
        product_id uuid,
        product_unit_id uuid,
        quantity numeric
      )
    group by x.product_id, x.product_unit_id
  ) grouped_items;

  -- Lock product inventory in a stable order and verify stock.
  for v_item in
    select
      x.product_id,
      x.product_unit_id,
      sum(x.quantity)::numeric(14,3) as quantity
    from jsonb_to_recordset(p_items)
      as x(
        product_id uuid,
        product_unit_id uuid,
        quantity numeric
      )
    group by x.product_id, x.product_unit_id
    order by x.product_id, x.product_unit_id
  loop
    if v_item.product_id is null
       or v_item.quantity is null
       or v_item.quantity <= 0 then
      raise exception 'Every cart item requires a valid quantity';
    end if;

    select
      p.id,
      p.name,
      p.barcode,
      p.default_cost,
      p.currency,
      p.track_stock,
      p.allow_negative_stock,
      p.is_active
    into v_product
    from public.products p
    where p.id = v_item.product_id
      and p.organization_id = v_profile.organization_id
    for share;

    if not found or v_product.is_active is not true then
      raise exception 'Product % is missing or inactive',
        v_item.product_id;
    end if;

    if v_product.currency <> p_currency then
      raise exception 'Product "%" uses %, but this sale uses %',
        v_product.name, v_product.currency, p_currency;
    end if;

    select
      pu.id,
      pu.name,
      pu.barcode,
      pu.conversion_factor,
      pu.selling_price,
      pu.is_active
    into v_unit
    from public.product_units pu
    where pu.organization_id = v_profile.organization_id
      and pu.product_id = v_product.id
      and (
        (
          v_item.product_unit_id is not null
          and pu.id = v_item.product_unit_id
        )
        or
        (
          v_item.product_unit_id is null
          and pu.is_base = true
        )
      )
    limit 1;

    if not found or v_unit.is_active is not true then
      raise exception 'The selected selling unit for "%" is unavailable',
        v_product.name;
    end if;

    v_base_quantity := round(
      v_item.quantity * v_unit.conversion_factor,
      3
    );

    insert into public.inventory_balances (
      organization_id,
      branch_id,
      product_id,
      quantity,
      average_cost
    )
    values (
      v_profile.organization_id,
      v_profile.branch_id,
      v_product.id,
      0,
      v_product.default_cost
    )
    on conflict (branch_id, product_id) do nothing;

    select
      ib.quantity,
      ib.average_cost
    into v_balance
    from public.inventory_balances ib
    where ib.branch_id = v_profile.branch_id
      and ib.product_id = v_product.id
    for update;

    if v_product.track_stock
       and not (
         coalesce(v_settings.allow_negative_stock, false)
         or v_product.allow_negative_stock
       )
       and v_balance.quantity < v_base_quantity then
      raise exception
        'Not enough stock for "%". Available: % base units; requested: %',
        v_product.name,
        v_balance.quantity,
        v_base_quantity;
    end if;
  end loop;

  v_invoice_number := private.next_document_number(
    v_profile.organization_id,
    v_profile.branch_id,
    'INV'
  );

  insert into public.sales (
    organization_id,
    branch_id,
    invoice_number,
    idempotency_key,
    customer_id,
    cashier_id,
    status,
    payment_status,
    currency,
    subtotal,
    discount_type,
    discount_value,
    discount_amount,
    tax_amount,
    total_amount,
    paid_amount,
    change_amount,
    cost_amount,
    gross_profit,
    price_list_id,
    price_list_name,
    price_adjustment_amount,
    notes,
    completed_at,
    coupon_id,
    coupon_code,
    coupon_discount_amount,
    promotion_discount_amount
  )
  values (
    v_profile.organization_id,
    v_profile.branch_id,
    v_invoice_number,
    nullif(trim(p_idempotency_key), ''),
    p_customer_id,
    v_user_id,
    'completed',
    'paid',
    p_currency,
    v_subtotal,
    v_display_discount_type,
    v_display_discount_value,
    v_discount_amount,
    v_tax_amount,
    v_total,
    v_total,
    v_change,
    0,
    0,
    null,
    null,
    0,
    nullif(trim(p_notes), ''),
    now(),
    v_coupon_id,
    v_coupon_code,
    case when v_coupon_id is null then 0 else v_coupon_discount_amount end,
    v_promotion_discount_amount
  )
  returning id into v_sale_id;

  for v_item in
    select
      x.product_id,
      x.product_unit_id,
      sum(x.quantity)::numeric(14,3) as quantity
    from jsonb_to_recordset(p_items)
      as x(
        product_id uuid,
        product_unit_id uuid,
        quantity numeric
      )
    group by x.product_id, x.product_unit_id
    order by x.product_id, x.product_unit_id
  loop
    v_item_index := v_item_index + 1;

    select
      p.id,
      p.name,
      p.barcode,
      p.default_cost,
      p.track_stock
    into strict v_product
    from public.products p
    where p.id = v_item.product_id
      and p.organization_id = v_profile.organization_id;

    select
      pu.id,
      pu.name,
      pu.barcode,
      pu.conversion_factor,
      pu.selling_price
    into strict v_unit
    from public.product_units pu
    where pu.organization_id = v_profile.organization_id
      and pu.product_id = v_product.id
      and (
        (
          v_item.product_unit_id is not null
          and pu.id = v_item.product_unit_id
        )
        or
        (
          v_item.product_unit_id is null
          and pu.is_base = true
        )
      )
    limit 1;

    select
      ib.quantity,
      ib.average_cost
    into strict v_balance
    from public.inventory_balances ib
    where ib.branch_id = v_profile.branch_id
      and ib.product_id = v_product.id
    for update;

    v_price := private.resolve_sales_unit_price(
      v_profile.organization_id,
      v_profile.branch_id,
      p_customer_id,
      v_unit.id,
      p_currency,
      now()
    );

    v_list_unit_price :=
      (v_price ->> 'list_price')::numeric;

    v_effective_unit_price :=
      (v_price ->> 'effective_price')::numeric;

    v_promotion := private.active_product_promotion_v1(
      v_profile.organization_id,
      v_profile.branch_id,
      v_product.id,
      v_unit.id,
      p_currency,
      now()
    );
    v_promotion_id := null;
    v_promotion_price := v_effective_unit_price;
    v_promotion_line_discount := 0;
    if v_promotion is not null then
      v_promotion_id := nullif(v_promotion ->> 'id', '')::uuid;
      v_promotion_price := round(greatest(
        case when v_promotion ->> 'discount_type' = 'percent'
          then v_effective_unit_price * (1 - least(greatest((v_promotion ->> 'discount_value')::numeric, 0), 100) / 100)
          else v_effective_unit_price - greatest((v_promotion ->> 'discount_value')::numeric, 0)
        end, 0
      ), 2);
      v_promotion_line_discount := round(greatest(v_effective_unit_price - v_promotion_price, 0) * v_item.quantity, 2);
    end if;

    if v_price_list_id is null
       and nullif(v_price ->> 'price_list_id', '') is not null then
      v_price_list_id :=
        (v_price ->> 'price_list_id')::uuid;
      v_price_list_name :=
        v_price ->> 'price_list_name';
    end if;

    v_base_quantity := round(
      v_item.quantity * v_unit.conversion_factor,
      3
    );

    v_line_subtotal := round(
      v_effective_unit_price * v_item.quantity,
      2
    );

    v_line_price_adjustment := round(
      (v_list_unit_price - v_effective_unit_price)
      * v_item.quantity,
      2
    );

    v_price_adjustment_total :=
      v_price_adjustment_total
      + v_line_price_adjustment;

    v_discount_base_line := case
      when v_promotion is null
        or (case when p_coupon_code is not null and length(trim(p_coupon_code)) > 0
                 then coalesce((v_promotion ->> 'allow_coupon')::boolean, true)
                 else coalesce((v_promotion ->> 'allow_manual_discount')::boolean, true) end)
      then round(greatest(v_effective_unit_price - case when v_promotion is null then 0 else v_promotion_line_discount / nullif(v_item.quantity, 0) end, 0) * v_item.quantity, 2)
      else 0
    end;

    -- Allocate only the coupon/manual portion to eligible lines. Promotion
    -- discount is already represented by the promotional unit price.
    if v_external_discount_amount > 0 and v_external_base_total > 0 and v_discount_base_line > 0 then
      if v_item_index = v_item_count then
        v_line_discount := v_promotion_line_discount + greatest(v_external_discount_amount - v_external_allocated, 0);
      else
        v_line_discount := v_promotion_line_discount + round(v_external_discount_amount * v_discount_base_line / v_external_base_total, 2);
        v_external_allocated := v_external_allocated + greatest(v_line_discount - v_promotion_line_discount, 0);
      end if;
    else
      v_line_discount := v_promotion_line_discount;
    end if;

    v_line_total := greatest(
      v_line_subtotal - v_line_discount,
      0
    );

    v_base_unit_cost := coalesce(
      nullif(v_balance.average_cost, 0),
      v_product.default_cost,
      0
    );
    v_selected_unit_cost := round(
      v_base_unit_cost * v_unit.conversion_factor,
      4
    );
    v_line_cost := round(
      v_selected_unit_cost * v_item.quantity,
      4
    );

    insert into public.sale_items (
      organization_id,
      sale_id,
      product_id,
      product_unit_id,
      product_name,
      barcode,
      quantity,
      base_quantity,
      sale_unit_name,
      unit_factor,
      unit_price,
      list_price,
      price_list_id,
      price_adjustment_amount,
      promotion_id,
      promotion_discount_amount,
      unit_cost,
      discount_amount,
      tax_amount,
      line_total,
      line_profit
    )
    values (
      v_profile.organization_id,
      v_sale_id,
      v_product.id,
      v_unit.id,
      v_product.name,
      coalesce(v_unit.barcode, v_product.barcode),
      v_item.quantity,
      v_base_quantity,
      v_unit.name,
      v_unit.conversion_factor,
      v_promotion_price,
      v_list_unit_price,
      case
        when nullif(v_price ->> 'price_list_id', '') is null
          then null
        else (v_price ->> 'price_list_id')::uuid
      end,
      v_line_price_adjustment,
      v_promotion_id,
      v_promotion_line_discount,
      v_selected_unit_cost,
      v_line_discount,
      0,
      v_line_total,
      round(v_line_total - v_line_cost, 4)
    );

    v_cost_total := v_cost_total + v_line_cost;
    v_profit_total :=
      v_profit_total + round(v_line_total - v_line_cost, 4);

    if v_product.track_stock then
      update public.inventory_balances
      set
        quantity = quantity - v_base_quantity,
        updated_at = now()
      where branch_id = v_profile.branch_id
        and product_id = v_product.id;

      insert into public.stock_movements (
        organization_id,
        branch_id,
        product_id,
        movement_type,
        quantity_change,
        quantity_before,
        quantity_after,
        unit_cost,
        reference_table,
        reference_id,
        notes,
        created_by
      )
      values (
        v_profile.organization_id,
        v_profile.branch_id,
        v_product.id,
        'sale',
        -v_base_quantity,
        v_balance.quantity,
        v_balance.quantity - v_base_quantity,
        v_base_unit_cost,
        'sales',
        v_sale_id,
        format(
          '%s · %s %s (%s base units)',
          v_invoice_number,
          v_item.quantity,
          v_unit.name,
          v_base_quantity
        ),
        v_user_id
      );
    end if;
  end loop;

  -- Reconcile any cent-level allocation residue so sale-item discounts exactly
  -- equal the server-authoritative total discount.
  update public.sale_items si
  set
    discount_amount = round(si.discount_amount + (v_discount_amount - coalesce((select sum(x.discount_amount) from public.sale_items x where x.sale_id = v_sale_id), 0)), 2),
    line_total = greatest(round(si.line_total - (v_discount_amount - coalesce((select sum(x2.discount_amount) from public.sale_items x2 where x2.sale_id = v_sale_id), 0)), 2), 0),
    line_profit = round(greatest(round(si.line_total - (v_discount_amount - coalesce((select sum(x3.discount_amount) from public.sale_items x3 where x3.sale_id = v_sale_id), 0)), 2), 0) - (si.unit_cost * si.quantity), 4)
  where si.id = (select x4.id from public.sale_items x4 where x4.sale_id = v_sale_id order by x4.created_at desc, x4.id desc limit 1)
    and abs(v_discount_amount - coalesce((select sum(x5.discount_amount) from public.sale_items x5 where x5.sale_id = v_sale_id), 0)) >= 0.005;

  update public.sales
  set
    cost_amount = v_cost_total,
    gross_profit = v_profit_total,
    price_list_id = v_price_list_id,
    price_list_name = v_price_list_name,
    price_adjustment_amount =
      round(v_price_adjustment_total, 2),
    updated_at = now()
  where id = v_sale_id;

  if v_total > 0 then
    insert into public.payments (
      organization_id,
      branch_id,
      sale_id,
      method,
      currency,
      amount,
      tendered_amount,
      change_amount,
      reference_number,
      received_by
    )
    values (
      v_profile.organization_id,
      v_profile.branch_id,
      v_sale_id,
      p_payment_method,
      p_currency,
      v_total,
      p_amount_received,
      v_change,
      nullif(trim(p_payment_reference), ''),
      v_user_id
    );
  end if;

  if v_coupon_id is not null then
    insert into public.coupon_redemptions (
      organization_id,
      branch_id,
      coupon_id,
      sale_id,
      customer_id,
      coupon_code,
      discount_amount,
      currency,
      redeemed_by
    )
    values (
      v_profile.organization_id,
      v_profile.branch_id,
      v_coupon_id,
      v_sale_id,
      p_customer_id,
      v_coupon_code,
      v_discount_amount,
      p_currency,
      v_user_id
    );
  end if;

  insert into public.audit_logs (
    organization_id,
    branch_id,
    user_id,
    action,
    entity_type,
    entity_id,
    new_data
  )
  values (
    v_profile.organization_id,
    v_profile.branch_id,
    v_user_id,
    'complete_sale',
    'sale',
    v_sale_id,
    jsonb_build_object(
      'invoice_number', v_invoice_number,
      'subtotal', v_subtotal,
      'discount_amount', v_discount_amount,
      'promotion_discount_amount', v_promotion_discount_amount,
      'coupon_discount_amount', v_coupon_discount_amount,
      'tax_amount', v_tax_amount,
      'total_amount', v_total,
      'cost_amount', v_cost_total,
      'gross_profit', v_profit_total,
      'price_list_id', v_price_list_id,
      'price_list_name', v_price_list_name,
      'price_adjustment_amount',
        round(v_price_adjustment_total, 2),
      'coupon_code', v_coupon_code,
      'unit_aware', true
    )
  );

  return jsonb_build_object(
    'ok', true,
    'duplicate_request', false,
    'sale_id', v_sale_id,
    'invoice_number', v_invoice_number,
    'subtotal', v_subtotal,
    'discount_amount', v_discount_amount,
    'tax_amount', v_tax_amount,
    'total_amount', v_total,
    'amount_received', p_amount_received,
    'change_amount', v_change,
    'cost_amount', v_cost_total,
    'gross_profit', v_profit_total,
    'price_list_id', v_price_list_id,
    'price_list_name', v_price_list_name,
    'price_adjustment_amount',
      round(v_price_adjustment_total, 2),
    'coupon_id', v_coupon_id,
    'coupon_code', v_coupon_code,
    'coupon_name', v_coupon_name,
    'coupon_discount_amount',
      case when v_coupon_id is null then 0 else v_discount_amount end
  );

exception
  when unique_violation then
    if p_idempotency_key is not null
       and length(trim(p_idempotency_key)) > 0 then
      select
        s.id,
        s.invoice_number,
        s.subtotal,
        s.discount_amount,
        s.tax_amount,
        s.total_amount,
        s.change_amount,
        s.cost_amount,
        s.gross_profit,
        s.price_list_id,
        s.price_list_name,
        s.price_adjustment_amount,
        s.coupon_code,
        s.coupon_discount_amount,
        s.promotion_discount_amount
      into v_existing
      from public.sales s
      where s.organization_id = v_profile.organization_id
        and s.idempotency_key = trim(p_idempotency_key)
      limit 1;

      if found then
        return jsonb_build_object(
          'ok', true,
          'duplicate_request', true,
          'sale_id', v_existing.id,
          'invoice_number', v_existing.invoice_number,
          'subtotal', v_existing.subtotal,
          'discount_amount', v_existing.discount_amount,
          'tax_amount', v_existing.tax_amount,
          'total_amount', v_existing.total_amount,
          'change_amount', v_existing.change_amount,
          'cost_amount', v_existing.cost_amount,
          'gross_profit', v_existing.gross_profit,
          'price_list_id', v_existing.price_list_id,
          'price_list_name', v_existing.price_list_name,
          'price_adjustment_amount',
            v_existing.price_adjustment_amount,
          'coupon_code', v_existing.coupon_code,
          'coupon_discount_amount',
            v_existing.coupon_discount_amount,
          'promotion_discount_amount',
            v_existing.promotion_discount_amount
        );
      end if;
    end if;

    raise;
end;
$$;


-- Coupon preview uses the promotion-eligible base so a coupon cannot discount
-- a product whose promotion explicitly blocks coupons.
create or replace function public.preview_coupon_v2(
  p_code text,p_items jsonb,p_customer_id uuid default null,p_currency public.currency_code default 'USD'
)
returns jsonb language plpgsql security definer
set search_path=public,private,auth,pg_temp as $$
declare v_user uuid:=auth.uid(); v_profile record; v_summary jsonb; v_result jsonb;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select organization_id,branch_id,role,is_active into v_profile from public.profiles where id=v_user;
  if not found or v_profile.is_active is not true then raise exception 'Your POS account is inactive or missing'; end if;
  if v_profile.role not in ('owner','admin','manager','cashier') then raise exception 'Your role cannot apply coupons'; end if;
  v_summary:=private.product_promotion_summary_v1(v_profile.organization_id,v_profile.branch_id,p_customer_id,p_items,p_currency);
  v_result:=private.evaluate_coupon(v_profile.organization_id,v_profile.branch_id,p_code,round(coalesce((v_summary->>'coupon_base_subtotal')::numeric,0),2),p_customer_id,p_currency,false);
  return v_result || jsonb_build_object('promotion_discount_amount',coalesce((v_summary->>'promotion_discount_amount')::numeric,0),'promotion_subtotal',coalesce((v_summary->>'promo_subtotal')::numeric,0),'coupon_base_subtotal',coalesce((v_summary->>'coupon_base_subtotal')::numeric,0));
end $$;
revoke all on function public.preview_coupon_v2(text,jsonb,uuid,public.currency_code) from public,anon;
grant execute on function public.preview_coupon_v2(text,jsonb,uuid,public.currency_code) to authenticated,service_role;

commit;
