-- Tiny POS — Step 46.53 Strict Unit-Specific Product Promotions & Limits
-- Additive migration. Run once after Step 46.52.

begin;

-- 1. Data cleanup for existing promotion items missing a product_unit_id
update public.product_promotion_items pi
set product_unit_id = (
  select pu.id
  from public.product_units pu
  where pu.product_id = pi.product_id
    and pu.organization_id = pi.organization_id
    and pu.is_base = true
  limit 1
)
where pi.product_unit_id is null;

update public.product_promotion_items pi
set product_unit_id = (
  select pu.id
  from public.product_units pu
  where pu.product_id = pi.product_id
    and pu.organization_id = pi.organization_id
  order by pu.created_at asc, pu.id asc
  limit 1
)
where pi.product_unit_id is null;

alter table public.product_promotion_items
  alter column product_unit_id set not null;

create index if not exists product_promotion_items_strict_unit_idx
  on public.product_promotion_items(organization_id, product_id, product_unit_id, promotion_id);


-- 2. Strict active product promotion lookup function
create or replace function private.active_product_promotion_v2(
  p_org uuid,
  p_branch uuid,
  p_product_id uuid,
  p_unit_id uuid,
  p_currency public.currency_code,
  p_online boolean default false,
  p_now timestamptz default now()
) returns jsonb language plpgsql security definer set search_path=public,private,auth,pg_temp as $$
declare
  v_row record;
  v_unit_remaining numeric;
begin
  if p_unit_id is null or p_product_id is null or p_org is null then
    return null;
  end if;

  select
    pp.id,
    pp.organization_id,
    pp.branch_id,
    pp.name,
    pp.discount_type,
    pp.discount_value,
    pp.allow_coupon,
    pp.allow_manual_discount,
    pp.allow_online,
    pp.starts_at,
    pp.ends_at,
    pi.product_id,
    pi.product_unit_id,
    pi.max_unit_quantity,
    pi.reserved_unit_quantity
  into v_row
  from public.product_promotions pp
  join public.product_promotion_items pi
    on pi.promotion_id = pp.id
   and pi.organization_id = pp.organization_id
  where pp.organization_id = p_org
    and pi.product_id = p_product_id
    and pi.product_unit_id = p_unit_id
    and pp.is_active = true
    and (pp.branch_id is null or pp.branch_id = p_branch)
    and pp.starts_at <= p_now
    and (pp.ends_at is null or pp.ends_at >= p_now)
    and (not p_online or pp.allow_online = true)
  order by
    (pp.branch_id is not null) desc,
    pp.starts_at desc,
    pp.created_at desc,
    pp.id desc
  limit 1;

  if not found then
    return null;
  end if;

  if v_row.max_unit_quantity is not null then
    v_unit_remaining := greatest(v_row.max_unit_quantity - coalesce(v_row.reserved_unit_quantity, 0), 0);
    if v_unit_remaining <= 0 then
      return null;
    end if;
  else
    v_unit_remaining := null;
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'name', v_row.name,
    'discount_type', v_row.discount_type,
    'discount_value', v_row.discount_value,
    'allow_coupon', coalesce(v_row.allow_coupon, true),
    'allow_manual_discount', coalesce(v_row.allow_manual_discount, true),
    'allow_online', coalesce(v_row.allow_online, true),
    'product_id', v_row.product_id,
    'product_unit_id', v_row.product_unit_id,
    'max_unit_quantity', v_row.max_unit_quantity,
    'reserved_unit_quantity', coalesce(v_row.reserved_unit_quantity, 0),
    'remaining_unit_quantity', v_unit_remaining,
    'starts_at', v_row.starts_at,
    'ends_at', v_row.ends_at
  );
end $$;


-- 3. Strict claim function for promotion quantity limits
create or replace function private.claim_product_promotion_units_v2(
  p_promotion_id uuid,
  p_product_unit_id uuid,
  p_requested_unit_quantity numeric,
  p_unit_factor numeric default 1
) returns jsonb language plpgsql security definer set search_path=public,private,auth,pg_temp as $$
declare
  v_promo public.product_promotions%rowtype;
  v_item public.product_promotion_items%rowtype;
  v_remaining_units numeric;
  v_grant_units numeric;
begin
  if p_requested_unit_quantity is null or p_requested_unit_quantity <= 0 or p_product_unit_id is null or p_promotion_id is null then
    return jsonb_build_object('granted_unit_quantity', 0, 'granted_base_quantity', 0);
  end if;

  select * into v_promo
  from public.product_promotions
  where id = p_promotion_id
  for update;

  if not found or coalesce(v_promo.is_active, true) is not true then
    return jsonb_build_object('granted_unit_quantity', 0, 'granted_base_quantity', 0);
  end if;

  select * into v_item
  from public.product_promotion_items
  where promotion_id = p_promotion_id
    and organization_id = v_promo.organization_id
    and product_unit_id = p_product_unit_id
  limit 1
  for update;

  if v_item.id is null then
    return jsonb_build_object('granted_unit_quantity', 0, 'granted_base_quantity', 0);
  end if;

  if v_item.max_unit_quantity is not null then
    v_remaining_units := greatest(v_item.max_unit_quantity - coalesce(v_item.reserved_unit_quantity, 0), 0);
    v_grant_units := least(p_requested_unit_quantity, v_remaining_units);
    v_grant_units := greatest(v_grant_units, 0);

    if v_grant_units > 0 then
      update public.product_promotion_items
      set reserved_unit_quantity = round(coalesce(reserved_unit_quantity, 0) + v_grant_units, 3)
      where id = v_item.id;
    end if;

    return jsonb_build_object(
      'granted_unit_quantity', v_grant_units,
      'granted_base_quantity', round(v_grant_units * coalesce(p_unit_factor, 1), 3)
    );
  end if;

  v_grant_units := p_requested_unit_quantity;
  return jsonb_build_object(
    'granted_unit_quantity', v_grant_units,
    'granted_base_quantity', round(v_grant_units * coalesce(p_unit_factor, 1), 3)
  );
end $$;


-- 4. Save function ensuring unit-level promotions
create or replace function public.save_product_promotion_v2(
  p_promotion_id uuid, p_name text, p_branch_id uuid default null,
  p_discount_type public.discount_type default 'percent', p_discount_value numeric default 0,
  p_starts_at timestamptz default now(), p_ends_at timestamptz default null,
  p_allow_coupon boolean default true, p_allow_manual_discount boolean default true,
  p_allow_online boolean default true, p_is_active boolean default true,
  p_notes text default null, p_items jsonb default '[]'::jsonb
) returns jsonb language plpgsql security definer set search_path=public,private,auth,pg_temp as $$
declare
  v_user uuid:=auth.uid();
  v_profile record;
  v_promotion public.product_promotions%rowtype;
  v_item jsonb;
  v_product_unit record;
  v_product_id uuid;
  v_unit_id uuid;
  v_limit numeric;
begin
  select * into v_profile from public.profiles where id=v_user;
  if not found or v_profile.is_active is not true then raise exception 'Active POS profile required'; end if;
  if v_profile.role not in ('owner','admin','manager') then raise exception 'Your role cannot manage product promotions'; end if;
  if trim(coalesce(p_name,''))='' then raise exception 'Promotion name is required'; end if;
  if p_discount_value<=0 then raise exception 'Discount value must be greater than zero'; end if;
  if p_discount_type='percent' and p_discount_value>100 then raise exception 'Percentage promotion cannot exceed 100'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Select at least one product'; end if;

  if p_promotion_id is null then
    insert into public.product_promotions(
      organization_id,branch_id,name,discount_type,discount_value,starts_at,ends_at,
      allow_coupon,allow_manual_discount,allow_online,max_base_quantity,reserved_base_quantity,
      is_active,notes,created_by,updated_by
    )
    values(
      v_profile.organization_id,p_branch_id,trim(p_name),p_discount_type,round(p_discount_value,4),
      p_starts_at,p_ends_at,coalesce(p_allow_coupon,true),coalesce(p_allow_manual_discount,true),
      coalesce(p_allow_online,true),null,0,coalesce(p_is_active,true),nullif(trim(p_notes),''),
      v_user,v_user
    )
    returning * into v_promotion;
  else
    update public.product_promotions set
      branch_id=p_branch_id,
      name=trim(p_name),
      discount_type=p_discount_type,
      discount_value=round(p_discount_value,4),
      starts_at=p_starts_at,
      ends_at=p_ends_at,
      allow_coupon=coalesce(p_allow_coupon,true),
      allow_manual_discount=coalesce(p_allow_manual_discount,true),
      allow_online=coalesce(p_allow_online,true),
      updated_by=v_user,
      updated_at=now(),
      is_active=coalesce(p_is_active,true),
      notes=nullif(trim(p_notes),'')
    where id=p_promotion_id and organization_id=v_profile.organization_id
    returning * into v_promotion;
    if not found then raise exception 'Promotion not found'; end if;
  end if;

  -- Delete items not in payload
  delete from public.product_promotion_items
  where promotion_id=v_promotion.id
    and organization_id=v_profile.organization_id
    and id not in (
      select coalesce(nullif(value->>'id',''),'00000000-0000-0000-0000-000000000000')::uuid
      from jsonb_array_elements(p_items)
    )
    and (product_id, product_unit_id) not in (
      select (value->>'product_id')::uuid, (value->>'product_unit_id')::uuid
      from jsonb_array_elements(p_items)
    );

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_product_id := nullif(v_item->>'product_id','')::uuid;
    v_unit_id := nullif(v_item->>'product_unit_id','')::uuid;
    v_limit := nullif(v_item->>'max_unit_quantity','')::numeric;

    if v_product_id is null or v_unit_id is null then
      raise exception 'Each promotion item must specify a product and selling unit';
    end if;

    select pu.id,pu.product_id,pu.conversion_factor into v_product_unit
    from public.product_units pu
    join public.products p on p.id=pu.product_id and p.organization_id=v_profile.organization_id
    where pu.organization_id=v_profile.organization_id
      and pu.product_id=v_product_id
      and pu.id=v_unit_id
      and (pu.is_active or pu.is_base);

    if not found then raise exception 'Selected promotion unit is invalid for product'; end if;
    if v_limit is not null and v_limit<=0 then raise exception 'Promotion unit quantity limit must be greater than zero'; end if;

    if exists (
      select 1 from public.product_promotion_items pi
      where pi.promotion_id=v_promotion.id
        and pi.organization_id=v_profile.organization_id
        and pi.product_id=v_product_id
        and pi.product_unit_id=v_unit_id
    ) then
      update public.product_promotion_items
      set max_unit_quantity=v_limit
      where promotion_id=v_promotion.id
        and organization_id=v_profile.organization_id
        and product_id=v_product_id
        and product_unit_id=v_unit_id;
    else
      insert into public.product_promotion_items(
        organization_id,promotion_id,product_id,product_unit_id,max_unit_quantity,reserved_unit_quantity
      )
      values(
        v_profile.organization_id,v_promotion.id,v_product_id,v_unit_id,v_limit,0
      );
    end if;
  end loop;

  return jsonb_build_object('ok',true,'promotion',to_jsonb(v_promotion));
end $$;

commit;
