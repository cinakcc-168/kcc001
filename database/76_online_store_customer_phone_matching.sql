-- ============================================================================
-- Tiny POS - Migration 76: Online Store Customer Phone Matching & Linking
-- ============================================================================
-- Matches online store orders to existing POS customers by normalized phone
-- number without altering canonical POS customer records or normal POS/CRM flows.
-- Prevents race-condition duplicate customer creations via transactional advisory locks.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. IMMUTABLE PHONE NORMALIZATION HELPER
-- ----------------------------------------------------------------------------
create or replace function private.normalize_phone(p_phone text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), '');
$$;

revoke all on function private.normalize_phone(text) from public, anon;
grant execute on function private.normalize_phone(text) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. NORMALIZED PHONE INDEX FOR HIGH-PERFORMANCE CUSTOMER LOOKUP
-- ----------------------------------------------------------------------------
create index if not exists customers_org_normalized_phone_idx
  on public.customers (organization_id, (regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')));

-- ----------------------------------------------------------------------------
-- 3. AUTHORITATIVE ONLINE ORDER CUSTOMER RESOLVER
-- ----------------------------------------------------------------------------
create or replace function private.resolve_online_order_customer(
  p_organization_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text default null,
  p_delivery_address text default null,
  p_order_number text default null,
  p_created_by uuid default null
) returns uuid
language plpgsql security definer
set search_path=public,private,auth,extensions,pg_temp as $$
declare
  v_clean_name text;
  v_clean_phone text;
  v_clean_email text;
  v_clean_address text;
  v_normalized_phone text;
  v_customer_id uuid;
begin
  if p_organization_id is null then
    raise exception 'Organization is required to resolve customer';
  end if;

  v_clean_name := trim(coalesce(p_customer_name, ''));
  v_clean_phone := trim(coalesce(p_customer_phone, ''));
  v_clean_email := nullif(lower(trim(coalesce(p_customer_email, ''))), '');
  v_clean_address := nullif(trim(coalesce(p_delivery_address, '')), '');
  v_normalized_phone := private.normalize_phone(v_clean_phone);

  -- Acquire transactional advisory lock on (organization_id, normalized_phone)
  -- to guarantee atomic check-and-create even under high concurrent order submission.
  if v_normalized_phone is not null and length(v_normalized_phone) >= 3 then
    perform pg_advisory_xact_lock(hashtext(p_organization_id::text || ':online_phone:' || v_normalized_phone));

    -- Look up existing customer in the same organization by normalized phone
    select id into v_customer_id
    from public.customers
    where organization_id = p_organization_id
      and private.normalize_phone(phone) = v_normalized_phone
    order by is_active desc, created_at asc
    limit 1;
  end if;

  -- If no matching customer exists for this phone, create a new POS customer
  if v_customer_id is null then
    if length(v_clean_name) = 0 then
      v_clean_name := 'Online Customer ' || coalesce(v_clean_phone, '');
    end if;

    insert into public.customers(
      organization_id,
      name,
      phone,
      email,
      address,
      notes,
      is_active,
      created_by
    ) values (
      p_organization_id,
      v_clean_name,
      nullif(v_clean_phone, ''),
      v_clean_email,
      v_clean_address,
      case
        when p_order_number is not null then 'Created from online order ' || p_order_number
        else 'Created from online order'
      end,
      true,
      p_created_by
    ) returning id into v_customer_id;
  end if;

  return v_customer_id;
end;
$$;

revoke all on function private.resolve_online_order_customer(uuid,text,text,text,text,text,uuid) from public, anon;
grant execute on function private.resolve_online_order_customer(uuid,text,text,text,text,text,uuid) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4. UPDATE SUBMIT_ONLINE_ORDER TO LINK POS CUSTOMER IMMEDIATELY
-- ----------------------------------------------------------------------------
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
  v_customer_id uuid;
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

  -- Authoritative server-side resolution and atomic linking to POS customer
  v_customer_id := private.resolve_online_order_customer(
    v_store.organization_id,
    v_name,
    v_phone,
    v_email,
    v_address,
    v_order_number,
    null
  );

  insert into public.online_orders(
    organization_id,branch_id,order_number,tracking_token_hash,status,
    payment_status,payment_method,fulfilment_type,currency,customer_id,customer_name,
    customer_phone,customer_email,delivery_address,requested_date,customer_note,
    subtotal,delivery_fee,total_amount,source_ip_hash,user_agent
  ) values(
    v_store.organization_id,v_store.branch_id,v_order_number,v_token_hash,'pending',
    (case when v_payment='bank_transfer' then 'pending_confirmation' else 'unpaid' end)::public.online_payment_status,
    v_payment,v_fulfilment,v_currency,v_customer_id,v_name,v_phone,v_email,v_address,v_requested,
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
    'customer_id',v_customer_id,
    'subtotal',round(v_subtotal,2),
    'delivery_fee',v_delivery_fee,
    'total_amount',v_total,
    'bank_instructions',case when v_payment='bank_transfer' then v_store.bank_instructions else null end,
    'customer_message',v_store.customer_message
  );
end
$$;

revoke all on function public.submit_online_order(text,jsonb,text,text) from public, anon;
grant execute on function public.submit_online_order(text,jsonb,text,text) to service_role;

-- ----------------------------------------------------------------------------
-- 5. UPDATE RECEIVE_ONLINE_ORDER TO USE PERSISTED OR RESOLVED CUSTOMER
-- ----------------------------------------------------------------------------
create or replace function public.receive_online_order(p_order_id uuid)
returns jsonb
language plpgsql security definer
set search_path=public,private,auth,extensions,pg_temp as $$
declare
  v_org uuid:=private.current_organization_id();
  v_branch uuid:=private.current_branch_id();
  v_online public.online_orders%rowtype;
  v_customer_id uuid;
  v_sales_order_id uuid;
  v_sales_number text;
  v_item record;
  v_delivery_unit uuid;
begin
  if not (
    private.has_permission('online_orders.manage',auth.uid())
    or private.has_permission('online_orders.fulfill',auth.uid())
  ) then
    raise exception 'Permission required: online_orders.fulfill';
  end if;

  select * into v_online from public.online_orders
  where id=p_order_id and organization_id=v_org and branch_id=v_branch
  for update;
  if not found then raise exception 'Online order not found in the active branch'; end if;
  if v_online.status<>'pending' then raise exception 'Only a Pending online order can be received'; end if;

  -- Use already linked customer_id, or resolve by phone if missing
  v_customer_id := v_online.customer_id;
  if v_customer_id is null then
    v_customer_id := private.resolve_online_order_customer(
      v_org,
      v_online.customer_name,
      v_online.customer_phone,
      v_online.customer_email,
      v_online.delivery_address,
      v_online.order_number,
      auth.uid()
    );
  end if;

  v_sales_number:=private.next_document_number(v_org,v_branch,'SO');
  insert into public.sales_orders(
    organization_id,branch_id,order_number,customer_id,status,currency,
    subtotal,discount_amount,tax_amount,total_amount,requested_delivery_date,
    delivery_address,notes,terms,created_by
  ) values(
    v_org,v_branch,v_sales_number,v_customer_id,'draft',v_online.currency,
    v_online.subtotal+v_online.delivery_fee,0,0,v_online.total_amount,
    coalesce(v_online.requested_date,current_date+1),
    v_online.delivery_address,
    concat_ws(E'\n',
      'Online order: '||v_online.order_number,
      case when v_online.payment_method='bank_transfer' then 'Bank transfer evidence attached in Online Store.' end,
      v_online.customer_note
    ),
    'Prices captured from the public storefront. Stock is reserved on confirmation.',
    auth.uid()
  ) returning id into v_sales_order_id;

  for v_item in select * from public.online_order_items
    where online_order_id=v_online.id order by created_at
  loop
    insert into public.sales_order_items(
      organization_id,branch_id,order_id,product_id,product_unit_id,
      product_name,sku,barcode,sale_unit_name,unit_factor,quantity,
      base_quantity,list_price,unit_price,net_unit_price,price_adjustment_amount,
      line_subtotal,discount_amount,line_total
    ) values(
      v_org,v_branch,v_sales_order_id,v_item.product_id,v_item.product_unit_id,
      v_item.product_name,v_item.sku,v_item.barcode,v_item.unit_name,
      v_item.unit_factor,v_item.quantity,v_item.base_quantity,
      v_item.list_price,v_item.unit_price,v_item.unit_price,
      round((v_item.unit_price-v_item.list_price)*v_item.quantity,2),
      v_item.line_total,0,v_item.line_total
    );
  end loop;

  if v_online.delivery_fee>0 then
    v_delivery_unit:=private.ensure_online_delivery_unit(v_org,v_online.currency);
    insert into public.sales_order_items(
      organization_id,branch_id,order_id,product_id,product_unit_id,
      product_name,sku,barcode,sale_unit_name,unit_factor,quantity,
      base_quantity,list_price,unit_price,net_unit_price,price_adjustment_amount,
      line_subtotal,discount_amount,line_total
    )
    select
      v_org,v_branch,v_sales_order_id,p.id,u.id,
      p.name,p.sku,u.barcode,u.name,1,1,1,
      v_online.delivery_fee,v_online.delivery_fee,v_online.delivery_fee,0,
      v_online.delivery_fee,0,v_online.delivery_fee
    from public.product_units u
    join public.products p on p.id=u.product_id
    where u.id=v_delivery_unit;
  end if;

  perform public.confirm_sales_order(v_sales_order_id);

  update public.online_orders set
    customer_id=v_customer_id,
    sales_order_id=v_sales_order_id,
    status='confirmed',
    confirmed_by=auth.uid(),
    confirmed_at=now(),
    updated_at=now()
  where id=v_online.id returning * into v_online;

  insert into public.online_order_status_history(
    organization_id,branch_id,online_order_id,from_status,to_status,note,changed_by
  ) values(
    v_org,v_branch,v_online.id,'pending','confirmed',
    'Received and converted to reserved Sales Order '||v_sales_number,auth.uid()
  );

  insert into public.audit_logs(
    organization_id,branch_id,user_id,action,entity_type,entity_id,new_data
  ) values(
    v_org,v_branch,auth.uid(),'receive_online_order','online_order',v_online.id,
    jsonb_build_object(
      'online_order_number',v_online.order_number,
      'customer_id',v_customer_id,
      'sales_order_id',v_sales_order_id,
      'sales_order_number',v_sales_number
    )
  );

  return jsonb_build_object(
    'ok',true,'online_order_id',v_online.id,'status',v_online.status,
    'customer_id',v_customer_id,
    'sales_order_id',v_sales_order_id,'sales_order_number',v_sales_number
  );
end
$$;

revoke all on function public.receive_online_order(uuid) from public, anon;
grant execute on function public.receive_online_order(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. SAFE BACKFILL FOR HISTORICAL ONLINE ORDERS
-- ----------------------------------------------------------------------------
update public.online_orders o
set customer_id = c.id
from (
  select distinct on (c.organization_id, private.normalize_phone(c.phone))
    c.organization_id,
    private.normalize_phone(c.phone) as norm_phone,
    c.id
  from public.customers c
  where private.normalize_phone(c.phone) is not null
  order by c.organization_id, private.normalize_phone(c.phone), c.is_active desc, c.created_at asc
) c
where o.customer_id is null
  and o.organization_id = c.organization_id
  and private.normalize_phone(o.customer_phone) = c.norm_phone;

notify pgrst, 'reload schema';

commit;
