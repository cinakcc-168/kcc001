-- Tiny POS — Step 46.52 Product promotion unit-specific rules and limits
-- Additive migration. Run once after Step 46.46.
-- No existing migration should be rerun.

begin;

alter table public.product_promotion_items
  add column if not exists product_unit_id uuid references public.product_units(id) on delete cascade,
  add column if not exists max_unit_quantity numeric(14,3),
  add column if not exists reserved_unit_quantity numeric(14,3) not null default 0;

alter table public.product_promotion_items
  drop constraint if exists product_promotion_items_max_unit_qty_ck;
alter table public.product_promotion_items
  add constraint product_promotion_items_max_unit_qty_ck check (max_unit_quantity is null or max_unit_quantity > 0);

alter table public.product_promotion_items
  drop constraint if exists product_promotion_items_reserved_unit_qty_ck;
alter table public.product_promotion_items
  add constraint product_promotion_items_reserved_unit_qty_ck check (reserved_unit_quantity >= 0);

create index if not exists product_promotion_items_unit_idx
  on public.product_promotion_items(organization_id, product_id, product_unit_id, promotion_id);

create or replace function public.save_product_promotion_v2(
  p_promotion_id uuid, p_name text, p_branch_id uuid default null,
  p_discount_type public.discount_type default 'percent', p_discount_value numeric default 0,
  p_starts_at timestamptz default now(), p_ends_at timestamptz default null,
  p_allow_coupon boolean default true, p_allow_manual_discount boolean default true,
  p_allow_online boolean default true, p_is_active boolean default true,
  p_notes text default null, p_items jsonb default '[]'::jsonb
) returns jsonb language plpgsql security definer set search_path=public,private,auth,pg_temp as $$
declare
  v_user uuid:=auth.uid(); v_profile record; v_promotion public.product_promotions%rowtype; v_item jsonb; v_product_unit record; v_product_id uuid; v_unit_id uuid; v_limit numeric;
begin
  select * into v_profile from public.profiles where id=v_user;
  if not found or v_profile.is_active is not true then raise exception 'Active POS profile required'; end if;
  if v_profile.role not in ('owner','admin','manager') then raise exception 'Your role cannot manage product promotions'; end if;
  if trim(coalesce(p_name,''))='' then raise exception 'Promotion name is required'; end if;
  if p_discount_value<=0 then raise exception 'Discount value must be greater than zero'; end if;
  if p_discount_type='percent' and p_discount_value>100 then raise exception 'Percentage promotion cannot exceed 100'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Select at least one product'; end if;

  if p_promotion_id is null then
    insert into public.product_promotions(organization_id,branch_id,name,discount_type,discount_value,starts_at,ends_at,allow_coupon,allow_manual_discount,allow_online,max_base_quantity,reserved_base_quantity,is_active,notes,created_by,updated_by)
    values(v_profile.organization_id,p_branch_id,trim(p_name),p_discount_type,round(p_discount_value,4),p_starts_at,p_ends_at,coalesce(p_allow_coupon,true),coalesce(p_allow_manual_discount,true),coalesce(p_allow_online,true),null,0,coalesce(p_is_active,true),nullif(trim(p_notes),''),v_user,v_user)
    returning * into v_promotion;
  else
    update public.product_promotions set branch_id=p_branch_id,name=trim(p_name),discount_type=p_discount_type,discount_value=round(p_discount_value,4),starts_at=p_starts_at,ends_at=p_ends_at,allow_coupon=coalesce(p_allow_coupon,true),allow_manual_discount=coalesce(p_allow_manual_discount,true),allow_online=coalesce(p_allow_online,true),updated_by=v_user,updated_at=now(),is_active=coalesce(p_is_active,true),notes=nullif(trim(p_notes),'')
    where id=p_promotion_id and organization_id=v_profile.organization_id
    returning * into v_promotion;
    if not found then raise exception 'Promotion not found'; end if;
  end if;

  if p_promotion_id is not null and coalesce(v_promotion.reserved_base_quantity,0)>0 then
    raise exception 'This promotion already has reserved legacy quantity. Create a new promotion instead of changing its product units.';
  end if;

  delete from public.product_promotion_items
  where promotion_id=v_promotion.id
    and organization_id=v_profile.organization_id
    and product_id not in (select (value->>'product_id')::uuid from jsonb_array_elements(p_items));

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_product_id := nullif(v_item->>'product_id','')::uuid;
    v_unit_id := nullif(v_item->>'product_unit_id','')::uuid;
    v_limit := nullif(v_item->>'max_unit_quantity','')::numeric;
    select pu.id,pu.product_id,pu.conversion_factor into v_product_unit
      from public.product_units pu
      join public.products p on p.id=pu.product_id and p.organization_id=v_profile.organization_id
      where pu.organization_id=v_profile.organization_id and pu.product_id=v_product_id and pu.id=v_unit_id and (pu.is_active or pu.is_base);
    if not found then raise exception 'Selected promotion unit is invalid for product'; end if;
    if v_limit is not null and v_limit<=0 then raise exception 'Promotion unit quantity limit must be greater than zero'; end if;

    if exists (select 1 from public.product_promotion_items pi where pi.promotion_id=v_promotion.id and pi.organization_id=v_profile.organization_id and pi.product_id=v_product_id) then
      if exists (select 1 from public.product_promotion_items pi where pi.promotion_id=v_promotion.id and pi.organization_id=v_profile.organization_id and pi.product_id=v_product_id and pi.product_unit_id is distinct from v_unit_id and coalesce(pi.reserved_unit_quantity,0)>0) then
        raise exception 'Cannot change a promotion selling unit after quantities have been reserved';
      end if;
      update public.product_promotion_items
      set product_unit_id=v_unit_id,
          max_unit_quantity=v_limit
      where promotion_id=v_promotion.id and organization_id=v_profile.organization_id and product_id=v_product_id;
    else
      insert into public.product_promotion_items(organization_id,promotion_id,product_id,product_unit_id,max_unit_quantity,reserved_unit_quantity)
      values(v_profile.organization_id,v_promotion.id,v_product_id,v_unit_id,v_limit,0);
    end if;
  end loop;
  return jsonb_build_object('ok',true,'promotion',to_jsonb(v_promotion));
end $$;

revoke all on function public.save_product_promotion_v2(uuid,text,uuid,public.discount_type,numeric,timestamptz,timestamptz,boolean,boolean,boolean,boolean,text,jsonb) from public,anon;
grant execute on function public.save_product_promotion_v2(uuid,text,uuid,public.discount_type,numeric,timestamptz,timestamptz,boolean,boolean,boolean,boolean,text,jsonb) to authenticated,service_role;

create or replace function private.active_product_promotion_v2(
  p_org uuid,p_branch uuid,p_product_id uuid,p_unit_id uuid,p_currency public.currency_code,
  p_online boolean default false,p_now timestamptz default now()
) returns jsonb language plpgsql security definer set search_path=public,private,auth,pg_temp as $$
declare v_row record; v_remaining numeric; v_unit_remaining numeric;
begin
  select pp.*,pi.product_id,pi.product_unit_id,pi.max_unit_quantity,pi.reserved_unit_quantity
    into v_row
  from public.product_promotions pp
  join public.product_promotion_items pi on pi.promotion_id=pp.id and pi.organization_id=pp.organization_id
  where pp.organization_id=p_org and pi.product_id=p_product_id and pp.is_active
    and (pp.branch_id is null or pp.branch_id=p_branch) and pp.starts_at<=p_now and (pp.ends_at is null or pp.ends_at>=p_now)
    and (not p_online or pp.allow_online)
    and (pi.product_unit_id is null or pi.product_unit_id=p_unit_id)
  order by (pi.product_unit_id is not null) desc, pp.starts_at desc,pp.created_at desc,pp.id desc limit 1;
  if not found then return null; end if;
  v_unit_remaining:=case when v_row.max_unit_quantity is null then null else greatest(v_row.max_unit_quantity-coalesce(v_row.reserved_unit_quantity,0),0) end;
  if v_unit_remaining is not null and v_unit_remaining<=0 then return null; end if;
  v_remaining:=case when v_row.max_base_quantity is null then null else greatest(v_row.max_base_quantity-coalesce(v_row.reserved_base_quantity,0),0) end;
  if v_remaining is not null and v_remaining<=0 then return null; end if;
  return jsonb_build_object('id',v_row.id,'name',v_row.name,'discount_type',v_row.discount_type,'discount_value',v_row.discount_value,'allow_coupon',v_row.allow_coupon,'allow_manual_discount',v_row.allow_manual_discount,'allow_online',v_row.allow_online,'max_base_quantity',v_row.max_base_quantity,'reserved_base_quantity',v_row.reserved_base_quantity,'remaining_base_quantity',v_remaining,'product_unit_id',v_row.product_unit_id,'max_unit_quantity',v_row.max_unit_quantity,'reserved_unit_quantity',v_row.reserved_unit_quantity,'remaining_unit_quantity',v_unit_remaining,'starts_at',v_row.starts_at,'ends_at',v_row.ends_at);
end $$;

create or replace function private.active_product_promotion_v1(p_org uuid,p_branch uuid,p_product_id uuid,p_unit_id uuid,p_currency public.currency_code,p_now timestamptz default now())
returns jsonb language sql stable security definer set search_path=public,private,auth,pg_temp as $$
  select private.active_product_promotion_v2(p_org,p_branch,p_product_id,p_unit_id,p_currency,false,p_now);
$$;

create or replace function private.claim_product_promotion_units_v2(
  p_promotion_id uuid,p_product_unit_id uuid,p_requested_unit_quantity numeric,p_unit_factor numeric
) returns jsonb language plpgsql security definer set search_path=public,private,auth,pg_temp as $$
declare v_promo public.product_promotions%rowtype; v_item public.product_promotion_items%rowtype; v_remaining_units numeric; v_grant_units numeric; v_grant_base numeric;
begin
  if p_requested_unit_quantity is null or p_requested_unit_quantity<=0 then return jsonb_build_object('granted_unit_quantity',0,'granted_base_quantity',0); end if;
  select * into v_promo from public.product_promotions where id=p_promotion_id for update;
  if not found or not v_promo.is_active then return jsonb_build_object('granted_unit_quantity',0,'granted_base_quantity',0); end if;
  select * into v_item from public.product_promotion_items
    where promotion_id=p_promotion_id and organization_id=v_promo.organization_id
      and (product_unit_id=p_product_unit_id or product_unit_id is null)
    order by (product_unit_id is not null) desc, id
    limit 1 for update;
  if v_item.id is null then return jsonb_build_object('granted_unit_quantity',0,'granted_base_quantity',0); end if;
  if v_item.max_unit_quantity is not null then
    v_remaining_units:=greatest(v_item.max_unit_quantity-coalesce(v_item.reserved_unit_quantity,0),0);
    v_grant_units:=floor(least(p_requested_unit_quantity,v_remaining_units));
    v_grant_units:=greatest(v_grant_units,0);
    if v_grant_units>0 then update public.product_promotion_items set reserved_unit_quantity=round(coalesce(reserved_unit_quantity,0)+v_grant_units,3) where id=v_item.id; end if;
    return jsonb_build_object('granted_unit_quantity',v_grant_units,'granted_base_quantity',round(v_grant_units*p_unit_factor,3));
  end if;
  if v_promo.max_base_quantity is not null then
    v_remaining_units:=greatest((v_promo.max_base_quantity-coalesce(v_promo.reserved_base_quantity,0))/nullif(p_unit_factor,0),0);
    v_grant_units:=floor(least(p_requested_unit_quantity,v_remaining_units));
    v_grant_base:=round(v_grant_units*p_unit_factor,3);
    if v_grant_base>0 then update public.product_promotions set reserved_base_quantity=round(coalesce(reserved_base_quantity,0)+v_grant_base,3),updated_at=now() where id=v_promo.id; end if;
    return jsonb_build_object('granted_unit_quantity',v_grant_units,'granted_base_quantity',v_grant_base);
  end if;
  v_grant_units:=floor(p_requested_unit_quantity);
  return jsonb_build_object('granted_unit_quantity',v_grant_units,'granted_base_quantity',round(v_grant_units*p_unit_factor,3));
end $$;
revoke all on function private.claim_product_promotion_units_v2(uuid,uuid,numeric,numeric) from public;
grant execute on function private.claim_product_promotion_units_v2(uuid,uuid,numeric,numeric) to authenticated,service_role;

alter table public.sale_items add column if not exists promotion_unit_quantity numeric(14,3) not null default 0 check (promotion_unit_quantity>=0);
alter table public.online_order_items add column if not exists promotion_unit_quantity numeric(14,3) not null default 0 check (promotion_unit_quantity>=0);

create or replace function private.release_promotion_reservation_for_sale() returns trigger language plpgsql security definer set search_path=public,private,auth,pg_temp as $$
declare v_row record;
begin
  if new.status='voided' and old.status is distinct from new.status then
    for v_row in select si.promotion_id,si.product_unit_id,sum(coalesce(si.promotion_unit_quantity,0)) unit_qty,sum(si.promotion_base_quantity) base_qty
      from public.sale_items si where si.sale_id=new.id and si.promotion_id is not null group by si.promotion_id,si.product_unit_id loop
      update public.product_promotion_items set reserved_unit_quantity=greatest(coalesce(reserved_unit_quantity,0)-v_row.unit_qty,0) where promotion_id=v_row.promotion_id and product_unit_id=v_row.product_unit_id;
      update public.product_promotions set reserved_base_quantity=greatest(coalesce(reserved_base_quantity,0)-v_row.base_qty,0),updated_at=now() where id=v_row.promotion_id and not exists(select 1 from public.product_promotion_items pi where pi.promotion_id=v_row.promotion_id and pi.product_unit_id=v_row.product_unit_id);
    end loop;
  end if;
  return new;
end $$;

create or replace function private.release_promotion_reservation_for_online_cancel() returns trigger language plpgsql security definer set search_path=public,private,auth,pg_temp as $$
declare v_row record;
begin
  if new.status in ('cancelled','rejected') and old.status is distinct from new.status then
    for v_row in select oi.promotion_id,oi.product_unit_id,sum(coalesce(oi.promotion_unit_quantity,0)) unit_qty,sum(oi.promotion_base_quantity) base_qty
      from public.online_order_items oi where oi.online_order_id=new.id and oi.promotion_id is not null group by oi.promotion_id,oi.product_unit_id loop
      update public.product_promotion_items set reserved_unit_quantity=greatest(coalesce(reserved_unit_quantity,0)-v_row.unit_qty,0) where promotion_id=v_row.promotion_id and product_unit_id=v_row.product_unit_id;
      update public.product_promotions set reserved_base_quantity=greatest(coalesce(reserved_base_quantity,0)-v_row.base_qty,0),updated_at=now() where id=v_row.promotion_id and not exists(select 1 from public.product_promotion_items pi where pi.promotion_id=v_row.promotion_id and pi.product_unit_id=v_row.product_unit_id);
    end loop;
  end if;
  return new;
end $$;

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
  v_promotion_granted_base numeric(14,3) := 0;
  v_promotion_unit_quantity numeric(14,3) := 0;
  v_promotion_unit_discount numeric(14,2) := 0;
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

    v_promotion := private.active_product_promotion_v2(
      v_profile.organization_id,
      v_profile.branch_id,
      v_product.id,
      v_unit.id,
      p_currency,
      false,
      now()
    );
    v_promotion_id := null;
    v_promotion_price := v_effective_unit_price;
    v_promotion_line_discount := 0;

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

    if v_promotion is not null then
      v_promotion_granted_base := coalesce((private.claim_product_promotion_units_v2(
        (v_promotion ->> 'id')::uuid,
        v_unit.id,
        v_item.quantity,
        v_unit.conversion_factor
      ) ->> 'granted_base_quantity')::numeric, 0);
      v_promotion_unit_quantity := least(
        v_item.quantity,
        floor(v_promotion_granted_base / nullif(v_unit.conversion_factor,0))
      );
      v_promotion_unit_discount := round(greatest(
        v_effective_unit_price -
        case when v_promotion ->> 'discount_type' = 'percent'
          then v_effective_unit_price * (1 - least(greatest((v_promotion ->> 'discount_value')::numeric, 0), 100) / 100)
          else greatest(v_effective_unit_price - greatest((v_promotion ->> 'discount_value')::numeric, 0), 0)
        end,
        0
      ),2);
      v_promotion_line_discount := round(v_promotion_unit_discount * v_promotion_unit_quantity, 2);
      if v_promotion_line_discount > 0 then
        v_promotion_id := nullif(v_promotion ->> 'id','')::uuid;
        v_promotion_price := round(v_effective_unit_price - v_promotion_line_discount / nullif(v_item.quantity,0), 2);
      end if;
    end if;

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
      then greatest(round(v_line_subtotal - v_promotion_line_discount, 2), 0)
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
      promotion_unit_quantity,
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
      v_promotion_unit_quantity,
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

create or replace function public.submit_online_order(
  p_slug text,
  p_payload jsonb,
  p_source_ip_hash text default null,
  p_user_agent text default null
) returns jsonb
language plpgsql security definer
set search_path=public,private,auth,extensions,pg_temp as $$
declare
  v_store public.online_store_settings%rowtype;
  v_order_id uuid;
  v_order_number text;
  v_token text;
  v_token_hash text;
  v_item jsonb;
  v_stock record;
  v_product public.products%rowtype;
  v_unit public.product_units%rowtype;
  v_price jsonb;
  v_currency public.currency_code;
  v_item_currency public.currency_code;
  v_quantity numeric;
  v_base_quantity numeric;
  v_available numeric;
  v_list_price numeric;
  v_unit_price numeric;
  v_line_total numeric;
  v_subtotal numeric:=0;
  v_delivery_fee numeric:=0;
  v_total numeric:=0;
  v_minimum numeric:=0;
  v_fulfilment public.online_fulfilment_type;
  v_payment public.online_payment_method;
  v_name text;
  v_phone text;
  v_email text;
  v_address text;
  v_note text;
  v_requested date;
  v_count integer:=0;
  v_promotion jsonb;
  v_promotion_granted_base numeric(14,3):=0;
  v_promotion_units numeric(14,3):=0;
  v_promotion_unit_discount numeric(14,2):=0;
  v_promotion_discount numeric(14,2):=0;
  v_promotion_id uuid;
begin
  select * into v_store
  from public.online_store_settings
  where slug=lower(trim(p_slug)) and is_published=true
  for share;
  if not found then raise exception 'Storefront not found'; end if;

  if jsonb_typeof(p_payload->'items')<>'array'
     or jsonb_array_length(p_payload->'items')=0 then
    raise exception 'Choose at least one product';
  end if;
  if jsonb_array_length(p_payload->'items')>60 then
    raise exception 'Too many order lines';
  end if;

  if (
    select count(*)<>count(distinct item->>'product_unit_id')
    from jsonb_array_elements(p_payload->'items') item
  ) then
    raise exception 'Duplicate selling units are not allowed';
  end if;

  v_name:=trim(coalesce(p_payload->>'customer_name',''));
  v_phone:=trim(coalesce(p_payload->>'customer_phone',''));
  v_email:=nullif(lower(trim(coalesce(p_payload->>'customer_email',''))),'');
  v_address:=nullif(trim(coalesce(p_payload->>'delivery_address','')),'');
  v_note:=nullif(left(trim(coalesce(p_payload->>'customer_note','')),1000),'');
  v_requested:=nullif(p_payload->>'requested_date','')::date;

  if length(v_name) not between 1 and 160 then raise exception 'Customer name is required'; end if;
  if length(v_phone) not between 3 and 40 then raise exception 'Customer phone is required'; end if;
  if v_email is not null and v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Customer email is invalid';
  end if;

  if p_source_ip_hash is not null and (
    select count(*)>=10
    from public.online_orders o
    where o.organization_id=v_store.organization_id
      and o.branch_id=v_store.branch_id
      and o.source_ip_hash=p_source_ip_hash
      and o.created_at>now()-interval '15 minutes'
  ) then
    raise exception 'Too many recent order requests. Please try again later';
  end if;

  if (
    select count(*)>=5
    from public.online_orders o
    where o.organization_id=v_store.organization_id
      and o.branch_id=v_store.branch_id
      and o.customer_phone=v_phone
      and o.status='pending'
      and o.created_at>now()-interval '1 hour'
  ) then
    raise exception 'Too many pending orders for this phone number';
  end if;

  v_fulfilment:=coalesce(nullif(p_payload->>'fulfilment_type',''),'pickup')::public.online_fulfilment_type;
  if v_fulfilment='pickup' and not v_store.allow_pickup then raise exception 'Pickup is unavailable'; end if;
  if v_fulfilment='delivery' and not v_store.allow_delivery then raise exception 'Delivery is unavailable'; end if;
  if v_fulfilment='delivery' and length(coalesce(v_address,''))<4 then raise exception 'Delivery address is required'; end if;

  v_payment:=coalesce(nullif(p_payload->>'payment_method',''),'pay_at_store')::public.online_payment_method;
  if v_payment='cash_on_delivery' and not v_store.allow_cash_on_delivery then raise exception 'Cash on delivery is unavailable'; end if;
  if v_payment='bank_transfer' and not v_store.allow_bank_transfer then raise exception 'Bank transfer is unavailable'; end if;
  if v_payment='pay_at_store' and not v_store.allow_pay_at_store then raise exception 'Pay at store is unavailable'; end if;
  if v_payment='pay_at_store' and v_fulfilment<>'pickup' then raise exception 'Pay at store requires pickup'; end if;

  -- First pass validates currency and current stock.
  for v_item in select * from jsonb_array_elements(p_payload->'items') loop
    v_quantity:=round(coalesce((v_item->>'quantity')::numeric,0),3);
    if v_quantity<=0 or v_quantity>99999 then raise exception 'Invalid item quantity'; end if;

    select * into v_unit from public.product_units
    where id=(v_item->>'product_unit_id')::uuid
      and organization_id=v_store.organization_id and is_active=true;
    if not found then raise exception 'Selling unit is unavailable'; end if;

    select * into v_product from public.products
    where id=v_unit.product_id and organization_id=v_store.organization_id
      and is_active=true and online_enabled=true;
    if not found then raise exception 'Product is unavailable online'; end if;

    v_item_currency:=v_product.currency;
    if v_currency is null then v_currency:=v_item_currency; end if;
    if v_item_currency<>v_currency then raise exception 'One order cannot mix USD and KHR products'; end if;

    v_base_quantity:=round(v_quantity*v_unit.conversion_factor,3);
    v_available:=private.online_available_base(v_store.organization_id,v_store.branch_id,v_product.id);
    if v_product.track_stock and v_base_quantity>v_available+0.0005 then
      raise exception 'Insufficient available stock for %',v_product.name;
    end if;

    v_price:=private.resolve_sales_unit_price(
      v_store.organization_id,v_store.branch_id,null,v_unit.id,v_currency,now()
    );
    v_list_price:=round(coalesce((v_price->>'list_price')::numeric,v_unit.selling_price),2);
    v_unit_price:=round(coalesce((v_price->>'unit_price')::numeric,v_unit.selling_price),2);
    v_promotion:=private.active_product_promotion_v2(v_store.organization_id,v_store.branch_id,v_product.id,v_unit.id,v_currency,true,now());
    if v_promotion is not null then
      v_promotion_granted_base:=greatest(coalesce((v_promotion->>'remaining_base_quantity')::numeric, v_base_quantity),0);
      v_promotion_units:=least(v_quantity,floor(v_promotion_granted_base/nullif(v_unit.conversion_factor,0)));
      v_promotion_unit_discount:=round(greatest(v_unit_price-case when v_promotion->>'discount_type'='percent' then v_unit_price*(1-least(greatest((v_promotion->>'discount_value')::numeric,0),100)/100) else greatest(v_unit_price-greatest((v_promotion->>'discount_value')::numeric,0),0) end,0),2);
    else
      v_promotion_units:=0; v_promotion_unit_discount:=0;
    end if;
    v_line_total:=round(v_quantity*v_unit_price - v_promotion_units*v_promotion_unit_discount,2);
    v_subtotal:=v_subtotal+v_line_total;
    v_count:=v_count+1;
  end loop;

  -- Validate the combined requirement when the same product is ordered
  -- through more than one selling unit.
  for v_stock in
    select
      u.product_id,
      sum(
        round(
          (item->>'quantity')::numeric
          * u.conversion_factor,
          3
        )
      ) as required_base
    from jsonb_array_elements(p_payload->'items') item
    join public.product_units u
      on u.id=(item->>'product_unit_id')::uuid
    group by u.product_id
  loop
    select * into v_product
    from public.products
    where id=v_stock.product_id
      and organization_id=v_store.organization_id
      and is_active=true
      and online_enabled=true;

    if not found then
      raise exception 'Product is unavailable online';
    end if;

    if v_product.track_stock then
      v_available:=private.online_available_base(
        v_store.organization_id,
        v_store.branch_id,
        v_product.id
      );

      if v_stock.required_base>v_available+0.0005 then
        raise exception
          'Insufficient combined stock for %',
          v_product.name;
      end if;
    end if;
  end loop;

  if v_currency is null then raise exception 'Order currency is required'; end if;

  if v_fulfilment='delivery' then
    v_delivery_fee:=case when v_currency='KHR' then v_store.delivery_fee_khr else v_store.delivery_fee_usd end;
  end if;
  v_minimum:=case when v_currency='KHR' then v_store.minimum_order_khr else v_store.minimum_order_usd end;
  if v_subtotal+0.005<v_minimum then raise exception 'Order is below the minimum amount'; end if;
  v_total:=round(v_subtotal+v_delivery_fee,2);

  v_order_number:=private.next_document_number(
    v_store.organization_id,v_store.branch_id,'WEB'
  );
  v_token:=encode(extensions.gen_random_bytes(24),'hex');
  v_token_hash:=encode(extensions.digest(v_token,'sha256'),'hex');

  insert into public.online_orders(
    organization_id,branch_id,order_number,tracking_token_hash,status,
    payment_status,payment_method,fulfilment_type,currency,customer_name,
    customer_phone,customer_email,delivery_address,requested_date,customer_note,
    subtotal,delivery_fee,total_amount,source_ip_hash,user_agent
  ) values(
    v_store.organization_id,v_store.branch_id,v_order_number,v_token_hash,'pending',
    (case when v_payment='bank_transfer' then 'pending_confirmation' else 'unpaid' end)::public.online_payment_status,
    v_payment,v_fulfilment,v_currency,v_name,v_phone,v_email,v_address,v_requested,
    v_note,round(v_subtotal,2),v_delivery_fee,v_total,
    nullif(left(coalesce(p_source_ip_hash,''),128),''),
    nullif(left(coalesce(p_user_agent,''),500),'')
  ) returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_payload->'items') loop
    v_quantity:=round((v_item->>'quantity')::numeric,3);
    select * into v_unit from public.product_units
      where id=(v_item->>'product_unit_id')::uuid;
    select * into v_product from public.products where id=v_unit.product_id;
    v_price:=private.resolve_sales_unit_price(
      v_store.organization_id,v_store.branch_id,null,v_unit.id,v_currency,now()
    );
    v_list_price:=round(coalesce((v_price->>'list_price')::numeric,v_unit.selling_price),2);
    v_unit_price:=round(coalesce((v_price->>'unit_price')::numeric,v_unit.selling_price),2);
    v_base_quantity:=round(v_quantity*v_unit.conversion_factor,3);
    v_promotion:=private.active_product_promotion_v2(v_store.organization_id,v_store.branch_id,v_product.id,v_unit.id,v_currency,true,now());
    v_promotion_id:=null; v_promotion_discount:=0; v_promotion_units:=0; v_promotion_unit_discount:=0; v_promotion_granted_base:=0;
    if v_promotion is not null then
      v_promotion_granted_base:=coalesce((private.claim_product_promotion_units_v2((v_promotion->>'id')::uuid,v_unit.id,v_quantity,v_unit.conversion_factor)->>'granted_base_quantity')::numeric,0);
      v_promotion_units:=least(v_quantity,floor(v_promotion_granted_base/nullif(v_unit.conversion_factor,0)));
      v_promotion_unit_discount:=round(greatest(v_unit_price-case when v_promotion->>'discount_type'='percent' then v_unit_price*(1-least(greatest((v_promotion->>'discount_value')::numeric,0),100)/100) else greatest(v_unit_price-greatest((v_promotion->>'discount_value')::numeric,0),0) end,0),2);
      v_promotion_discount:=round(v_promotion_units*v_promotion_unit_discount,2);
      if v_promotion_discount>0 then v_promotion_id:=(v_promotion->>'id')::uuid; end if;
    end if;
    v_line_total:=round(v_quantity*v_unit_price-v_promotion_discount,2);

    insert into public.online_order_items(
      organization_id,branch_id,online_order_id,product_id,product_unit_id,
      product_name,sku,barcode,unit_name,unit_factor,quantity,base_quantity,
      list_price,unit_price,line_total,promotion_id,promotion_discount_amount,promotion_base_quantity,promotion_unit_quantity
    ) values(
      v_store.organization_id,v_store.branch_id,v_order_id,v_product.id,v_unit.id,
      v_product.name,v_product.sku,coalesce(v_unit.barcode,v_product.barcode),
      v_unit.name,v_unit.conversion_factor,v_quantity,v_base_quantity,
      v_list_price,round(v_unit_price-v_promotion_discount/nullif(v_quantity,0),2),v_line_total,
      v_promotion_id,v_promotion_discount,round(v_promotion_units*v_unit.conversion_factor,3),v_promotion_units
    );
  end loop;

  select round(coalesce(sum(line_total),0),2) into v_subtotal from public.online_order_items where online_order_id=v_order_id;
  if v_subtotal+0.005<v_minimum then raise exception 'Order is below the minimum amount after promotion'; end if;
  v_total:=round(v_subtotal+v_delivery_fee,2);
  update public.online_orders set subtotal=v_subtotal,total_amount=v_total,updated_at=now() where id=v_order_id;

  insert into public.online_order_status_history(
    organization_id,branch_id,online_order_id,from_status,to_status,note
  ) values(
    v_store.organization_id,v_store.branch_id,v_order_id,null,'pending',
    'Order submitted through the public storefront'
  );

  return jsonb_build_object(
    'ok',true,
    'order_id',v_order_id,
    'order_number',v_order_number,
    'tracking_token',v_token,
    'status','pending',
    'currency',v_currency,
    'subtotal',round(v_subtotal,2),
    'delivery_fee',v_delivery_fee,
    'total_amount',v_total,
    'bank_instructions',case when v_payment='bank_transfer' then v_store.bank_instructions else null end,
    'customer_message',v_store.customer_message
  );
end
$$;


notify pgrst,'reload schema';
commit;
commit;
