-- Step 46.44: Batch/Lot transfer root-cause hardening + safe reconciliation RPC
-- Additive migration. Do not rerun older migrations.
--
-- 1) The modern v6 transfer workflow is already authoritative for inventory and
--    batch movement. Client-side syncTransferBatchDeductions is removed from
--    the modern UI in this step, so approval cannot move the same lot twice.
-- 2) Existing batch/inventory mismatches can be repaired through this audited
--    server-side RPC. It NEVER changes inventory_balances; it makes traceable
--    batch quantities match the existing inventory balance for one product and
--    branch.

create or replace function public.reconcile_product_batches_v1(
  p_product_id uuid,
  p_branch_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, auth, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile record;
  v_branch_id uuid;
  v_product public.products%rowtype;
  v_balance public.inventory_balances%rowtype;
  v_batch record;
  v_target numeric(14,3);
  v_current numeric(14,3);
  v_diff numeric(14,3);
  v_remaining numeric(14,3);
  v_take numeric(14,3);
  v_before numeric(14,3);
  v_after numeric(14,3);
  v_created_batch_id uuid;
  v_changes jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select id, organization_id, branch_id, role, is_active
  into v_profile
  from public.profiles
  where id = v_user_id;

  if not found or v_profile.is_active is not true then
    raise exception 'Active POS profile not found';
  end if;

  if not private.has_permission('inventory.adjust', v_user_id) then
    raise exception 'Permission required: inventory.adjust';
  end if;

  v_branch_id := coalesce(p_branch_id, v_profile.branch_id);
  if v_branch_id is null then
    raise exception 'Branch is required for batch reconciliation';
  end if;

  if v_branch_id <> v_profile.branch_id
     and not private.has_permission('branches.all', v_user_id) then
    raise exception 'You are not allowed to reconcile another branch';
  end if;

  select * into v_product
  from public.products
  where id = p_product_id
    and organization_id = v_profile.organization_id
    and is_active = true;

  if not found then
    raise exception 'Product not found';
  end if;

  if coalesce(v_product.batch_tracking, false) is not true then
    raise exception 'Product is not batch tracked';
  end if;

  select * into v_balance
  from public.inventory_balances
  where organization_id = v_profile.organization_id
    and branch_id = v_branch_id
    and product_id = p_product_id
  for update;

  v_target := coalesce(v_balance.quantity, 0);

  select coalesce(sum(quantity), 0)
  into v_current
  from public.inventory_batches
  where organization_id = v_profile.organization_id
    and branch_id = v_branch_id
    and product_id = p_product_id
    and status <> 'depleted';

  v_diff := round(v_current - v_target, 3);
  if abs(v_diff) <= 0.0005 then
    return jsonb_build_object(
      'ok', true,
      'changed', false,
      'product_id', p_product_id,
      'branch_id', v_branch_id,
      'inventory_quantity', v_target,
      'batch_quantity', v_current,
      'message', 'Batches are already balanced with inventory stock.'
    );
  end if;

  if v_diff > 0 then
    -- Batch aggregate is too high. Reduce active batches deterministically,
    -- oldest/earliest-expiry first. Inventory balance is never changed.
    v_remaining := v_diff;
    for v_batch in
      select id, quantity, status, batch_number
      from public.inventory_batches
      where organization_id = v_profile.organization_id
        and branch_id = v_branch_id
        and product_id = p_product_id
        and status <> 'depleted'
        and quantity > 0
      order by expiry_date nulls last, received_date nulls last, created_at, id
      for update
    loop
      exit when v_remaining <= 0.0005;
      v_before := coalesce(v_batch.quantity, 0);
      v_take := least(v_before, v_remaining);
      v_after := round(v_before - v_take, 3);

      update public.inventory_batches
      set quantity = v_after,
          status = case when v_after <= 0.0005 then 'depleted'::public.inventory_batch_status else status end,
          updated_at = now()
      where id = v_batch.id
        and organization_id = v_profile.organization_id
        and branch_id = v_branch_id;

      v_remaining := round(v_remaining - v_take, 3);
      v_changes := v_changes || jsonb_build_array(jsonb_build_object(
        'batch_id', v_batch.id,
        'batch_number', v_batch.batch_number,
        'before', v_before,
        'after', v_after,
        'delta', -v_take
      ));
    end loop;

    if v_remaining > 0.0005 then
      raise exception 'Unable to reconcile batch quantity; remaining discrepancy %', v_remaining;
    end if;
  else
    -- Batch aggregate is too low. Do not invent a historical lot. Create a
    -- clearly marked reconciliation lot so the added traceable quantity is
    -- visible and auditable.
    v_take := abs(v_diff);
    insert into public.inventory_batches(
      organization_id, branch_id, product_id, batch_number,
      received_date, source_type, initial_quantity, quantity,
      unit_cost, status, notes, created_by
    ) values (
      v_profile.organization_id,
      v_branch_id,
      p_product_id,
      'RECON-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') || '-' || substr(p_product_id::text, 1, 6),
      current_date,
      'adjustment',
      v_take,
      v_take,
      coalesce(v_balance.average_cost, v_product.default_cost, 0),
      'active',
      'System Health batch reconciliation: added traceable quantity to match inventory balance.',
      v_user_id
    )
    returning id into v_created_batch_id;

    v_changes := v_changes || jsonb_build_array(jsonb_build_object(
      'batch_id', v_created_batch_id,
      'before', 0,
      'after', v_take,
      'delta', v_take,
      'reason', 'reconciliation_lot'
    ));
  end if;

  select coalesce(sum(quantity), 0)
  into v_after
  from public.inventory_batches
  where organization_id = v_profile.organization_id
    and branch_id = v_branch_id
    and product_id = p_product_id
    and status <> 'depleted';

  if abs(v_after - v_target) > 0.0005 then
    raise exception 'Batch reconciliation did not reach inventory quantity. Inventory %, batches %', v_target, v_after;
  end if;

  insert into public.audit_logs(
    organization_id, branch_id, user_id, action, entity_type, entity_id, new_data
  ) values (
    v_profile.organization_id,
    v_branch_id,
    v_user_id,
    'reconcile_product_batches',
    'product',
    p_product_id,
    jsonb_build_object(
      'inventory_quantity', v_target,
      'batch_quantity_before', v_current,
      'batch_quantity_after', v_after,
      'difference_before', v_diff,
      'changes', v_changes
    )
  );

  return jsonb_build_object(
    'ok', true,
    'changed', true,
    'product_id', p_product_id,
    'branch_id', v_branch_id,
    'inventory_quantity', v_target,
    'batch_quantity_before', v_current,
    'batch_quantity_after', v_after,
    'difference_before', v_diff,
    'changes', v_changes,
    'message', 'Batches successfully reconciled to match inventory stock.'
  );
end;
$$;

revoke all on function public.reconcile_product_batches_v1(uuid, uuid) from public, anon;
grant execute on function public.reconcile_product_batches_v1(uuid, uuid) to authenticated, service_role;

-- Verification: this should return zero rows for the selected organization/branch
-- after existing mismatches are repaired through Batch & Expiry Center.
-- Replace the placeholders before running manually.
--
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
