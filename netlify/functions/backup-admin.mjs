import { createClient } from "@supabase/supabase-js";

async function hasIndividualPermission(
  admin,
  profile,
  permissionKey,
  defaultRoles
) {
  if (profile.role === "owner") return true;

  try {
    const { data, error } = await admin
      .from("user_permission_overrides")
      .select("allowed")
      .eq("user_id", profile.id)
      .eq("permission_key", permissionKey)
      .maybeSingle();

    if (!error && data) {
      return Boolean(data.allowed);
    }
  } catch {
    // Fall back to role defaults when Step 32 is not installed yet.
  }

  return defaultRoles.includes(profile.role);
}


const BACKUP_FORMAT = "tiny-pos-business-backup";
const BACKUP_VERSION = 1;
const PAGE_SIZE = 750;
const INSERT_SIZE = 300;
const OPTIONAL_TABLES = new Set([
  "coupons",
  "coupon_redemptions",
  "cash_register_sessions",
  "product_units",
  "stock_count_sessions",
  "stock_count_items",
  "data_import_jobs",
  "data_import_errors",
  "customer_credit_accounts",
  "customer_credit_payments",
  "customer_credit_payment_allocations",
  "customer_credit_entries",
  "sales_quotes",
  "sales_quote_items",
  "price_lists",
  "price_list_items",
  "supplier_payment_batches",
  "purchase_receipts",
  "purchase_receipt_items",
  "user_permission_overrides",
  "user_approval_limits",
  "inventory_batches",
  "purchase_receipt_item_batches",
  "sale_item_batches",
  "return_item_batches",
  "purchase_return_item_batches",
  "stock_transfer_item_batches",
  "sales_orders",
  "sales_order_items",
  "stock_reservations",
  "sales_order_deliveries",
  "sales_order_delivery_items",
  "attendance_sessions",
  "commission_plans",
  "sales_commissions",
  "commission_payouts",
  "accounting_accounts",
  "accounting_mappings",
  "accounting_periods",
  "accounting_journal_entries",
  "accounting_journal_lines",
  "payroll_compensation_profiles",
  "payroll_runs",
  "payroll_run_lines",
  "payroll_payments"
]);

const DIRECT_ORG_TABLES = [
  "app_settings",
  "branches",
  "accounting_accounts",
  "accounting_mappings",
  "accounting_periods",
  "accounting_journal_entries",
  "accounting_journal_lines",
  "payroll_compensation_profiles",
  "payroll_runs",
  "payroll_run_lines",
  "payroll_payments",
  "user_permission_overrides",
  "user_approval_limits",
  "categories",
  "suppliers",
  "price_lists",
  "customers",
  "customer_counters",
  "customer_loyalty_movements",
  "customer_credit_accounts",
  "customer_credit_payments",
  "customer_credit_payment_allocations",
  "customer_credit_entries",
  "coupons",
  "coupon_redemptions",
  "products",
  "product_images",
  "product_units",
  "inventory_balances",
  "reorder_rules",
  "document_counters",
  "price_list_items",
  "sales_quotes",
  "sales_quote_items",
  "sales_orders",
  "sales_order_items",
  "stock_reservations",
  "sales_order_deliveries",
  "sales_order_delivery_items",
  "sales",
  "sale_items",
  "payments",
  "purchases",
  "purchase_items",
  "purchase_receipts",
  "purchase_receipt_items",
  "supplier_payment_batches",
  "purchase_payments",
  "returns",
  "return_items",
  "inventory_adjustments",
  "inventory_adjustment_items",
  "stock_count_sessions",
  "stock_count_items",
  "parked_sales",
  "stock_movements",
  "cash_categories",
  "cash_entries",
  "cash_register_sessions",
  "stock_transfers",
  "stock_transfer_items",
  "purchase_returns",
  "purchase_return_items",
  "inventory_batches",
  "purchase_receipt_item_batches",
  "sale_item_batches",
  "return_item_batches",
  "purchase_return_item_batches",
  "stock_transfer_item_batches",
  "supplier_code_counters",
  "data_import_jobs",
  "data_import_errors",
  "attendance_sessions",
  "commission_plans",
  "sales_commissions",
  "commission_payouts",
  "audit_logs"
];

const DELETE_ORDER = [
  "payroll_payments",
  "payroll_run_lines",
  "payroll_runs",
  "payroll_compensation_profiles",
  "accounting_journal_lines",
  "accounting_journal_entries",
  "accounting_periods",
  "accounting_mappings",
  "accounting_accounts",
  "user_permission_overrides",
  "user_approval_limits",
  "commission_payouts",
  "sales_commissions",
  "commission_plans",
  "attendance_sessions",
  "data_import_errors",
  "data_import_jobs",
  "coupon_redemptions",
  "customer_credit_entries",
  "customer_credit_payment_allocations",
  "return_item_batches",
  "purchase_return_item_batches",
  "sale_item_batches",
  "stock_transfer_item_batches",
  "purchase_receipt_item_batches",
  "inventory_batches",
  "return_items",
  "returns",
  "payments",
  "customer_credit_payments",
  "sale_items",
  "sales",
  "sales_order_delivery_items",
  "sales_order_deliveries",
  "stock_reservations",
  "sales_order_items",
  "sales_orders",
  "sales_quote_items",
  "sales_quotes",
  "price_list_items",
  "price_lists",
  "customer_credit_accounts",
  "coupons",
  "purchase_payments",
  "supplier_payment_batches",
  "purchase_return_items",
  "purchase_returns",
  "purchase_receipt_items",
  "purchase_receipts",
  "purchase_items",
  "purchases",
  "stock_transfer_items",
  "stock_transfers",
  "stock_count_items",
  "stock_count_sessions",
  "inventory_adjustment_items",
  "inventory_adjustments",
  "parked_sales",
  "stock_movements",
  "cash_entries",
  "cash_register_sessions",
  "cash_categories",
  "customer_loyalty_movements",
  "customer_counters",
  "reorder_rules",
  "inventory_balances",
  "product_units",
  "product_images",
  "products",
  "categories",
  "supplier_code_counters",
  "suppliers",
  "customers",
  "document_counters",
  "audit_logs",
  "app_settings"
];

const INSERT_ORDER = [
  "app_settings",
  "accounting_accounts",
  "accounting_mappings",
  "accounting_periods",
  "accounting_journal_entries",
  "accounting_journal_lines",
  "payroll_compensation_profiles",
  "payroll_runs",
  "payroll_run_lines",
  "payroll_payments",
  "user_approval_limits",
  "user_permission_overrides",
  "attendance_sessions",
  "commission_plans",
  "commission_payouts",
  "categories",
  "suppliers",
  "price_lists",
  "customers",
  "customer_credit_accounts",
  "customer_counters",
  "supplier_code_counters",
  "coupons",
  "products",
  "product_units",
  "price_list_items",
  "product_images",
  "inventory_balances",
  "reorder_rules",
  "document_counters",
  "sales_quotes",
  "sales_quote_items",
  "sales_orders",
  "sales_order_items",
  "stock_reservations",
  "sales_order_deliveries",
  "sales_order_delivery_items",
  "cash_categories",
  "cash_register_sessions",
  "cash_entries",
  "purchases",
  "purchase_items",
  "purchase_receipts",
  "purchase_receipt_items",
  "supplier_payment_batches",
  "purchase_payments",
  "sales",
  "sale_items",
  "customer_credit_payments",
  "payments",
  "customer_credit_payment_allocations",
  "coupon_redemptions",
  "returns",
  "return_items",
  "sales_commissions",
  "customer_credit_entries",
  "inventory_adjustments",
  "inventory_adjustment_items",
  "stock_count_sessions",
  "stock_count_items",
  "parked_sales",
  "stock_movements",
  "stock_transfers",
  "stock_transfer_items",
  "purchase_returns",
  "purchase_return_items",
  "inventory_batches",
  "purchase_receipt_item_batches",
  "sale_item_batches",
  "return_item_batches",
  "purchase_return_item_batches",
  "stock_transfer_item_batches",
  "customer_loyalty_movements",
  "data_import_jobs",
  "data_import_errors",
  "audit_logs"
];

const USER_REFERENCE_COLUMNS = [
  "created_by",
  "updated_by",
  "voided_by",
  "cashier_id",
  "received_by",
  "processed_by",
  "parked_by",
  "user_id",
  "cancelled_by",
  "ordered_by",
  "paid_by",
  "requested_by",
  "redeemed_by",
  "opened_by",
  "closed_by",
  "started_by",
  "completed_by",
  "counted_by",
  "sent_by",
  "accepted_by",
  "converted_by",
  "confirmed_by",
  "reserved_by",
  "released_by"
];

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...extraHeaders
    }
  });
}

function cleanFilenamePart(value) {
  return String(value || "tiny-pos")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "tiny-pos";
}

function createAdminClient() {
  const url = process.env.SUPABASE_URL;
  const secret =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY;

  if (!url || !secret) {
    throw Object.assign(
      new Error(
        "Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
      ),
      { status: 500 }
    );
  }

  return createClient(url, secret, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  });
}

async function authenticate(request, admin) {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    throw Object.assign(new Error("Authentication required."), {
      status: 401
    });
  }

  const {
    data: { user },
    error: userError
  } = await admin.auth.getUser(token);

  if (userError || !user) {
    throw Object.assign(
      new Error("Your login session is invalid or expired."),
      { status: 401 }
    );
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select(
      "id,organization_id,branch_id,email,full_name,role,is_active"
    )
    .eq("id", user.id)
    .single();

  if (profileError || !profile?.is_active) {
    throw Object.assign(new Error("Active POS profile not found."), {
      status: 403
    });
  }

  if (!await hasIndividualPermission(
    admin,
    profile,
    "audit_backup.manage",
    ["owner", "admin"]
  )) {
    throw Object.assign(
      new Error("Permission required: audit_backup.manage"),
      { status: 403 }
    );
  }

  return { user, profile };
}

async function selectAll(queryFactory) {
  const rows = [];
  let from = 0;

  while (true) {
    const { data, error } = await queryFactory().range(
      from,
      from + PAGE_SIZE - 1
    );

    if (error) throw error;

    const page = data || [];
    rows.push(...page);

    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

async function loadOrganization(admin, organizationId) {
  const { data, error } = await admin
    .from("organizations")
    .select("*")
    .eq("id", organizationId)
    .single();

  if (error || !data) {
    throw new Error("Organization not found.");
  }

  return data;
}

async function createBackup(admin, caller) {
  const organization = await loadOrganization(
    admin,
    caller.organization_id
  );

  const profiles = await selectAll(() =>
    admin
      .from("profiles")
      .select(
        "id,organization_id,branch_id,email,full_name,role,phone,avatar_url,is_active,last_login_at,created_at,updated_at"
      )
      .eq("organization_id", caller.organization_id)
  );

  const profileIds = profiles.map((profile) => profile.id);
  let preferences = [];

  if (profileIds.length > 0) {
    for (let index = 0; index < profileIds.length; index += 150) {
      const ids = profileIds.slice(index, index + 150);
      const { data, error } = await admin
        .from("user_preferences")
        .select("*")
        .in("user_id", ids);

      if (error) throw error;
      preferences.push(...(data || []));
    }
  }

  const tables = {};

  for (const table of DIRECT_ORG_TABLES) {
    tables[table] = await selectAll(() =>
      admin
        .from(table)
        .select("*")
        .eq("organization_id", caller.organization_id)
    );
  }

  const rowCounts = Object.fromEntries(
    Object.entries(tables).map(([table, rows]) => [
      table,
      rows.length
    ])
  );
  rowCounts.profiles = profiles.length;
  rowCounts.user_preferences = preferences.length;

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    created_at: new Date().toISOString(),
    source: {
      organization,
      schema_step: 40
    },
    staff: profiles,
    user_preferences: preferences,
    tables,
    row_counts: rowCounts
  };
}

function validateBackupDocument(backup) {
  const problems = [];

  if (!backup || typeof backup !== "object") {
    problems.push("The uploaded file is not a JSON backup object.");
  } else {
    if (backup.format !== BACKUP_FORMAT) {
      problems.push("This is not a Tiny POS business backup.");
    }

    if (Number(backup.version) !== BACKUP_VERSION) {
      problems.push(
        `Unsupported backup version: ${backup.version ?? "missing"}.`
      );
    }

    if (!backup.source?.organization?.id) {
      problems.push("Source organization information is missing.");
    }

    if (!backup.tables || typeof backup.tables !== "object") {
      problems.push("Backup table data is missing.");
    }

    for (const table of DIRECT_ORG_TABLES) {
      if (
        !Array.isArray(backup.tables?.[table]) &&
        !OPTIONAL_TABLES.has(table)
      ) {
        problems.push(`Table ${table} is missing or invalid.`);
      }
    }

    if (!Array.isArray(backup.staff)) {
      problems.push("Staff manifest is missing.");
    }

    if (!Array.isArray(backup.user_preferences)) {
      problems.push("User preferences are missing.");
    }

    if (!Array.isArray(backup.tables?.branches) || backup.tables.branches.length === 0) {
      problems.push("The backup contains no branches.");
    }

    if (!Array.isArray(backup.tables?.app_settings) || backup.tables.app_settings.length !== 1) {
      problems.push("The backup must contain one shop settings record.");
    }
  }

  const rowCounts =
    backup?.tables && typeof backup.tables === "object"
      ? Object.fromEntries(
          Object.entries(backup.tables).map(([table, rows]) => [
            table,
            Array.isArray(rows) ? rows.length : 0
          ])
        )
      : {};

  return {
    valid: problems.length === 0,
    problems,
    row_counts: rowCounts,
    created_at: backup?.created_at || null,
    source_organization:
      backup?.source?.organization?.name || null,
    source_code: backup?.source?.organization?.code || null,
    version: backup?.version || null
  };
}

async function logOperation(
  admin,
  caller,
  action,
  status,
  backup,
  details = {}
) {
  const rowCounts =
    backup?.row_counts ||
    Object.fromEntries(
      Object.entries(backup?.tables || {}).map(([table, rows]) => [
        table,
        Array.isArray(rows) ? rows.length : 0
      ])
    );

  const { error } = await admin.from("data_backup_logs").insert({
    organization_id: caller.organization_id,
    branch_id: caller.branch_id,
    requested_by: caller.id,
    action,
    status,
    filename: details.filename || null,
    backup_version: Number(backup?.version || BACKUP_VERSION),
    source_organization_name:
      backup?.source?.organization?.name || null,
    row_counts: rowCounts,
    details
  });

  if (error) {
    console.error("Could not write backup log:", error.message);
  }
}

function mapUserId(sourceId, userMap, fallbackUserId) {
  if (!sourceId) return null;
  return userMap.get(sourceId) || fallbackUserId;
}

function transformRows(
  table,
  rows,
  targetOrganizationId,
  userMap,
  fallbackUserId
) {
  return (rows || []).map((sourceRow) => {
    const row = { ...sourceRow };

    if ("organization_id" in row) {
      row.organization_id = targetOrganizationId;
    }

    for (const column of USER_REFERENCE_COLUMNS) {
      if (column in row && row[column]) {
        row[column] = mapUserId(
          row[column],
          userMap,
          fallbackUserId
        );
      }
    }

    if (table === "stock_count_sessions" && row.status === "counting") {
      const cancelledAt = new Date().toISOString();

      row.status = "cancelled";
      row.cancelled_by = fallbackUserId;
      row.cancelled_at = cancelledAt;
      row.completed_by = null;
      row.completed_at = null;
      row.cancellation_reason = [
        row.cancellation_reason,
        "Automatically cancelled during backup restore."
      ].filter(Boolean).join(" ");
    }

    if (table === "cash_register_sessions" && row.status === "open") {
      const closedAt = new Date().toISOString();
      const expectedUsd = Number(
        row.expected_cash_usd ?? row.opening_cash_usd ?? 0
      );
      const expectedKhr = Number(
        row.expected_cash_khr ?? row.opening_cash_khr ?? 0
      );

      row.status = "closed";
      row.expected_cash_usd = expectedUsd;
      row.expected_cash_khr = expectedKhr;
      row.counted_cash_usd = expectedUsd;
      row.counted_cash_khr = expectedKhr;
      row.variance_usd = 0;
      row.variance_khr = 0;
      row.closed_by = fallbackUserId;
      row.closed_at = closedAt;
      row.closing_note = [
        row.closing_note,
        "Automatically closed during backup restore."
      ].filter(Boolean).join(" ");
    }

    if (table === "audit_logs") {
      delete row.id;
    }

    return row;
  });
}

async function insertChunks(admin, table, rows) {
  if (!rows.length) return;

  for (let index = 0; index < rows.length; index += INSERT_SIZE) {
    const chunk = rows.slice(index, index + INSERT_SIZE);
    const { error } = await admin.from(table).insert(chunk);
    if (error) {
      throw new Error(
        `Restore failed while inserting ${table}: ${error.message}`
      );
    }
  }
}

async function deleteOrganizationRows(admin, table, organizationId) {
  const { error } = await admin
    .from(table)
    .delete()
    .eq("organization_id", organizationId);

  if (error) {
    throw new Error(
      `Could not clear ${table}: ${error.message}`
    );
  }
}

async function restoreBackup(admin, caller, backup) {
  const validation = validateBackupDocument(backup);

  if (!validation.valid) {
    throw Object.assign(
      new Error(validation.problems.join(" ")),
      { status: 400 }
    );
  }

  const targetProfiles = await selectAll(() =>
    admin
      .from("profiles")
      .select(
        "id,organization_id,branch_id,email,full_name,role,is_active"
      )
      .eq("organization_id", caller.organization_id)
  );

  const targetByEmail = new Map(
    targetProfiles
      .filter((profile) => profile.email)
      .map((profile) => [
        String(profile.email).toLowerCase(),
        profile
      ])
  );

  const userMap = new Map();
  const missingStaff = [];

  for (const sourceProfile of backup.staff || []) {
    const email = String(sourceProfile.email || "").toLowerCase();
    const target = email ? targetByEmail.get(email) : null;

    if (target) {
      userMap.set(sourceProfile.id, target.id);
    } else {
      userMap.set(sourceProfile.id, caller.id);
      missingStaff.push({
        email: sourceProfile.email || null,
        full_name: sourceProfile.full_name || "Unknown staff",
        role: sourceProfile.role || "cashier"
      });
    }
  }

  // Clear branch assignments before replacing branch rows.
  const { error: clearBranchError } = await admin
    .from("profiles")
    .update({ branch_id: null })
    .eq("organization_id", caller.organization_id);

  if (clearBranchError) throw clearBranchError;

  for (const table of DELETE_ORDER) {
    await deleteOrganizationRows(
      admin,
      table,
      caller.organization_id
    );
  }

  const { error: branchDeleteError } = await admin
    .from("branches")
    .delete()
    .eq("organization_id", caller.organization_id);

  if (branchDeleteError) {
    throw new Error(
      `Could not replace branches: ${branchDeleteError.message}`
    );
  }

  const sourceBranches = transformRows(
    "branches",
    backup.tables.branches,
    caller.organization_id,
    userMap,
    caller.id
  );

  if (sourceBranches.length === 0) {
    throw new Error("The backup contains no branches.");
  }

  await insertChunks(admin, "branches", sourceBranches);

  const sourceOrganization = backup.source.organization || {};
  const { error: organizationError } = await admin
    .from("organizations")
    .update({
      name: sourceOrganization.name || "Tiny POS",
      logo_url: sourceOrganization.logo_url || null,
      is_active: sourceOrganization.is_active !== false,
      updated_at: new Date().toISOString()
    })
    .eq("id", caller.organization_id);

  if (organizationError) throw organizationError;

  for (const table of INSERT_ORDER) {
    if (table === "branches") continue;

    const rows = transformRows(
      table,
      backup.tables[table] || [],
      caller.organization_id,
      userMap,
      caller.id
    );

    await insertChunks(admin, table, rows);
  }

  // Restore matching staff information without creating Auth users.
  const branchBySourceId = new Map(
    (backup.tables.branches || []).map((branch) => [
      branch.id,
      branch.id
    ])
  );

  for (const sourceProfile of backup.staff || []) {
    const email = String(sourceProfile.email || "").toLowerCase();
    const target = email ? targetByEmail.get(email) : null;
    if (!target) continue;

    const nextRole =
      target.id === caller.id
        ? "owner"
        : sourceProfile.role === "owner"
          ? target.role
          : sourceProfile.role;

    const nextBranchId =
      branchBySourceId.get(sourceProfile.branch_id) ||
      sourceBranches[0]?.id ||
      null;

    const { error } = await admin
      .from("profiles")
      .update({
        branch_id: nextBranchId,
        full_name: sourceProfile.full_name || target.full_name,
        phone: sourceProfile.phone || null,
        avatar_url: sourceProfile.avatar_url || null,
        role: nextRole,
        is_active:
          target.id === caller.id
            ? true
            : sourceProfile.is_active !== false,
        updated_at: new Date().toISOString()
      })
      .eq("id", target.id)
      .eq("organization_id", caller.organization_id);

    if (error) throw error;
  }

  // Ensure every current target user has a valid branch.
  const primaryBranchId = sourceBranches[0].id;
  const { error: remainingBranchError } = await admin
    .from("profiles")
    .update({ branch_id: primaryBranchId })
    .eq("organization_id", caller.organization_id)
    .is("branch_id", null);

  if (remainingBranchError) throw remainingBranchError;

  // Restore matching personal preferences.
  for (const sourcePreference of backup.user_preferences || []) {
    const targetUserId = userMap.get(sourcePreference.user_id);
    if (!targetUserId) continue;

    const { user_id: _ignored, ...preferenceValues } =
      sourcePreference;

    const { error } = await admin
      .from("user_preferences")
      .upsert(
        {
          ...preferenceValues,
          user_id: targetUserId
        },
        { onConflict: "user_id" }
      );

    if (error) throw error;
  }

  return {
    ok: true,
    restored_tables: Object.fromEntries(
      INSERT_ORDER.map((table) => [
        table,
        Array.isArray(backup.tables[table])
          ? backup.tables[table].length
          : 0
      ])
    ),
    restored_branches: sourceBranches.length,
    active_branch_id: primaryBranchId,
    missing_staff: missingStaff
  };
}

export default async (request) => {
  const admin = createAdminClient();
  let caller;
  let body = {};

  try {
    if (request.method !== "POST") {
      return json({ ok: false, error: "POST required." }, 405);
    }

    ({ profile: caller } = await authenticate(request, admin));
    body = await request.json();
    const action = String(body.action || "").trim();

    if (action === "export") {
      const backup = await createBackup(admin, caller);
      const date = new Date().toISOString().slice(0, 10);
      const shop = cleanFilenamePart(
        backup.source.organization.name
      );
      const filename = `${shop}-backup-${date}.json`;

      await logOperation(
        admin,
        caller,
        "export",
        "completed",
        backup,
        { filename }
      );

      return json(backup, 200, {
        "Content-Disposition": `attachment; filename="${filename}"`
      });
    }

    if (action === "validate") {
      const validation = validateBackupDocument(body.backup);

      await logOperation(
        admin,
        caller,
        "validate",
        validation.valid ? "completed" : "failed",
        body.backup,
        {
          problems: validation.problems
        }
      );

      return json({
        ok: validation.valid,
        validation
      }, validation.valid ? 200 : 400);
    }

    if (action === "restore") {
      if (caller.role !== "owner") {
        throw Object.assign(
          new Error("Only the owner can restore a backup."),
          { status: 403 }
        );
      }

      if (body.confirmation !== "RESTORE TINY POS") {
        throw Object.assign(
          new Error(
            'Type exactly "RESTORE TINY POS" to confirm.'
          ),
          { status: 400 }
        );
      }

      if (body.current_backup_downloaded !== true) {
        throw Object.assign(
          new Error(
            "Download a current safety backup before restoring."
          ),
          { status: 400 }
        );
      }

      const result = await restoreBackup(
        admin,
        caller,
        body.backup
      );

      const restoredCaller = {
        ...caller,
        branch_id: result.active_branch_id
      };

      await logOperation(
        admin,
        restoredCaller,
        "restore",
        "completed",
        body.backup,
        {
          restored_tables: result.restored_tables,
          missing_staff: result.missing_staff
        }
      );

      await admin.from("audit_logs").insert({
        organization_id: caller.organization_id,
        branch_id: result.active_branch_id,
        user_id: caller.id,
        action: "restore_business_backup",
        entity_type: "organization",
        entity_id: caller.organization_id,
        new_data: {
          source_organization:
            body.backup?.source?.organization?.name || null,
          backup_created_at: body.backup?.created_at || null,
          missing_staff: result.missing_staff
        }
      });

      return json(result);
    }

    return json(
      { ok: false, error: "Unknown backup action." },
      400
    );
  } catch (error) {
    console.error(error);

    if (caller) {
      await logOperation(
        admin,
        caller,
        String(body?.action || "validate"),
        "failed",
        body?.backup,
        { error: error.message }
      );
    }

    return json(
      { ok: false, error: error.message || "Backup request failed." },
      Number(error.status || 500)
    );
  }
};