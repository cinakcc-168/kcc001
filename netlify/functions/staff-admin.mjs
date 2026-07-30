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


const allowedRoles = new Set(["admin", "manager", "cashier", "viewer"]);
const editableRoles = new Set(["owner", "admin", "manager", "cashier", "viewer"]);

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}

function cleanText(value, maxLength = 200) {
  const text = String(value ?? "").trim();
  return text.slice(0, maxLength);
}

function cleanEmail(value) {
  return cleanText(value, 320).toLowerCase();
}

function validEmail(value) {
  return /^\S+@\S+\.\S+$/.test(value);
}

function validBranchCode(value) {
  return /^[A-Z0-9_-]{1,20}$/.test(value);
}

function createAdminClient() {
  const url = process.env.SUPABASE_URL;
  const secret =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY;

  if (!url || !secret) {
    throw new Error(
      "Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY)."
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
    throw Object.assign(new Error("Authentication required."), { status: 401 });
  }

  const {
    data: { user },
    error: userError
  } = await admin.auth.getUser(token);

  if (userError || !user) {
    throw Object.assign(new Error("Your login session is invalid or expired."), {
      status: 401
    });
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id,organization_id,branch_id,email,full_name,role,is_active")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    throw Object.assign(new Error("POS profile not found."), { status: 403 });
  }

  if (!profile.is_active) {
    throw Object.assign(new Error("This POS account is inactive."), {
      status: 403
    });
  }

  if (!await hasIndividualPermission(
    admin,
    profile,
    "staff.manage",
    ["owner", "admin"]
  )) {
    throw Object.assign(
      new Error("Permission required: staff.manage"),
      { status: 403 }
    );
  }

  return { user, profile };
}

function canManageTarget(caller, target) {
  if (caller.role === "owner") return true;
  if (target.id === caller.id) return true;
  if (target.role === "owner" || target.role === "admin") return false;
  return true;
}

function canAssignRole(caller, role) {
  if (!allowedRoles.has(role)) return false;
  if (caller.role === "owner") return true;
  return role !== "admin";
}

async function ensureBranch(admin, organizationId, branchId) {
  const { data, error } = await admin
    .from("branches")
    .select("id,name,code,is_active")
    .eq("id", branchId)
    .eq("organization_id", organizationId)
    .single();

  if (error || !data) {
    throw Object.assign(new Error("Branch not found."), { status: 400 });
  }

  if (!data.is_active) {
    throw Object.assign(new Error("Choose an active branch."), { status: 400 });
  }

  return data;
}

async function audit(admin, caller, action, entityType, entityId, details = {}) {
  await admin.from("audit_logs").insert({
    organization_id: caller.organization_id,
    branch_id: caller.branch_id,
    user_id: caller.id,
    action,
    entity_type: entityType,
    entity_id: entityId || null,
    new_data: details
  });
}

async function loadWorkspace(admin, caller) {
  const [profilesResult, branchesResult, authUsersResult] = await Promise.all([
    admin
      .from("profiles")
      .select(`
        id,
        organization_id,
        branch_id,
        email,
        full_name,
        role,
        phone,
        avatar_url,
        is_active,
        last_login_at,
        created_at,
        updated_at,
        branches (
          id,
          name,
          code,
          is_active
        )
      `)
      .eq("organization_id", caller.organization_id)
      .order("created_at", { ascending: true }),
    admin
      .from("branches")
      .select("id,organization_id,name,code,phone,address,is_active,created_at,updated_at")
      .eq("organization_id", caller.organization_id)
      .order("name", { ascending: true }),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  ]);

  if (profilesResult.error) throw profilesResult.error;
  if (branchesResult.error) throw branchesResult.error;
  if (authUsersResult.error) throw authUsersResult.error;

  const authById = new Map(
    (authUsersResult.data?.users || []).map((user) => [user.id, user])
  );

  const staff = (profilesResult.data || []).map((profile) => {
    const authUser = authById.get(profile.id);

    return {
      ...profile,
      email: authUser?.email || profile.email,
      email_confirmed_at: authUser?.email_confirmed_at || null,
      auth_last_sign_in_at: authUser?.last_sign_in_at || null
    };
  });

  const activeStaffByBranch = new Map();
  for (const member of staff) {
    if (!member.is_active || !member.branch_id) continue;
    activeStaffByBranch.set(
      member.branch_id,
      Number(activeStaffByBranch.get(member.branch_id) || 0) + 1
    );
  }

  const branches = (branchesResult.data || []).map((branch) => ({
    ...branch,
    active_staff_count: Number(activeStaffByBranch.get(branch.id) || 0)
  }));

  return { staff, branches };
}

async function createUser(admin, caller, body) {
  const email = cleanEmail(body.email);
  const fullName = cleanText(body.full_name, 160);
  const phone = cleanText(body.phone, 60) || null;
  const password = String(body.password || "");
  const role = cleanText(body.role, 20).toLowerCase();
  const branchId = cleanText(body.branch_id, 80);
  const isActive = body.is_active !== false;

  if (!validEmail(email)) {
    throw Object.assign(new Error("Enter a valid staff email address."), {
      status: 400
    });
  }

  if (fullName.length < 2) {
    throw Object.assign(new Error("Staff name is required."), { status: 400 });
  }

  if (password.length < 8) {
    throw Object.assign(
      new Error("The temporary password must contain at least 8 characters."),
      { status: 400 }
    );
  }

  if (!canAssignRole(caller, role)) {
    throw Object.assign(new Error("You cannot assign that role."), {
      status: 403
    });
  }

  await ensureBranch(admin, caller.organization_id, branchId);

  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName }
    });

  if (createError || !created?.user) {
    throw Object.assign(
      new Error(createError?.message || "Could not create the staff login."),
      { status: 400 }
    );
  }

  const userId = created.user.id;

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .update({
      organization_id: caller.organization_id,
      branch_id: branchId,
      email,
      full_name: fullName,
      phone,
      role,
      is_active: isActive,
      updated_at: new Date().toISOString()
    })
    .eq("id", userId)
    .select()
    .single();

  if (profileError) {
    try {
      await admin.auth.admin.deleteUser(userId);
    } catch {
      // Best-effort cleanup if profile creation could not be completed.
    }
    throw profileError;
  }

  await audit(admin, caller, "create_staff_user", "profile", userId, {
    email,
    full_name: fullName,
    role,
    branch_id: branchId,
    is_active: isActive
  });

  return profile;
}

async function updateUser(admin, caller, body) {
  const userId = cleanText(body.user_id, 80);
  const email = cleanEmail(body.email);
  const fullName = cleanText(body.full_name, 160);
  const phone = cleanText(body.phone, 60) || null;
  const role = cleanText(body.role, 20).toLowerCase();
  const branchId = cleanText(body.branch_id, 80);

  const { data: target, error: targetError } = await admin
    .from("profiles")
    .select("id,organization_id,branch_id,email,full_name,role,phone,is_active")
    .eq("id", userId)
    .eq("organization_id", caller.organization_id)
    .single();

  if (targetError || !target) {
    throw Object.assign(new Error("Staff account not found."), { status: 404 });
  }

  if (!canManageTarget(caller, target)) {
    throw Object.assign(new Error("You cannot edit this staff account."), {
      status: 403
    });
  }

  if (!validEmail(email)) {
    throw Object.assign(new Error("Enter a valid staff email address."), {
      status: 400
    });
  }

  if (fullName.length < 2) {
    throw Object.assign(new Error("Staff name is required."), { status: 400 });
  }

  if (target.role === "owner") {
    if (caller.id !== target.id || caller.role !== "owner") {
      throw Object.assign(new Error("The owner account is protected."), {
        status: 403
      });
    }
  } else if (!editableRoles.has(role) || role === "owner") {
    throw Object.assign(new Error("That role cannot be assigned."), {
      status: 400
    });
  } else if (
    !(target.id === caller.id && target.role === role)
    && !canAssignRole(caller, role)
  ) {
    throw Object.assign(new Error("You cannot assign that role."), {
      status: 403
    });
  }

  await ensureBranch(admin, caller.organization_id, branchId);

  const authChanges = {
    user_metadata: { full_name: fullName }
  };

  if (email !== cleanEmail(target.email)) {
    authChanges.email = email;
    authChanges.email_confirm = true;
  }

  const { error: authError } = await admin.auth.admin.updateUserById(
    userId,
    authChanges
  );

  if (authError) {
    throw Object.assign(new Error(authError.message), { status: 400 });
  }

  const nextRole = target.role === "owner" ? "owner" : role;

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .update({
      branch_id: branchId,
      email,
      full_name: fullName,
      phone,
      role: nextRole,
      updated_at: new Date().toISOString()
    })
    .eq("id", userId)
    .eq("organization_id", caller.organization_id)
    .select()
    .single();

  if (profileError) throw profileError;

  await audit(admin, caller, "update_staff_user", "profile", userId, {
    old: target,
    new: {
      email,
      full_name: fullName,
      phone,
      role: nextRole,
      branch_id: branchId
    }
  });

  return profile;
}

async function setUserStatus(admin, caller, body) {
  const userId = cleanText(body.user_id, 80);
  const isActive = Boolean(body.is_active);

  const { data: target, error } = await admin
    .from("profiles")
    .select("id,organization_id,email,full_name,role,is_active")
    .eq("id", userId)
    .eq("organization_id", caller.organization_id)
    .single();

  if (error || !target) {
    throw Object.assign(new Error("Staff account not found."), { status: 404 });
  }

  if (target.id === caller.id) {
    throw Object.assign(new Error("You cannot deactivate your own account."), {
      status: 400
    });
  }

  if (target.role === "owner") {
    throw Object.assign(new Error("The owner account cannot be deactivated."), {
      status: 403
    });
  }

  if (!canManageTarget(caller, target)) {
    throw Object.assign(new Error("You cannot change this account."), {
      status: 403
    });
  }

  const { data: updated, error: updateError } = await admin
    .from("profiles")
    .update({
      is_active: isActive,
      updated_at: new Date().toISOString()
    })
    .eq("id", target.id)
    .select()
    .single();

  if (updateError) throw updateError;

  await audit(admin, caller, "set_staff_status", "profile", target.id, {
    is_active: isActive
  });

  return updated;
}

async function resetPassword(admin, caller, body) {
  const userId = cleanText(body.user_id, 80);
  const password = String(body.password || "");

  if (password.length < 8) {
    throw Object.assign(
      new Error("The new password must contain at least 8 characters."),
      { status: 400 }
    );
  }

  const { data: target, error } = await admin
    .from("profiles")
    .select("id,organization_id,full_name,role")
    .eq("id", userId)
    .eq("organization_id", caller.organization_id)
    .single();

  if (error || !target) {
    throw Object.assign(new Error("Staff account not found."), { status: 404 });
  }

  if (!canManageTarget(caller, target)) {
    throw Object.assign(new Error("You cannot reset this account password."), {
      status: 403
    });
  }

  const { error: authError } = await admin.auth.admin.updateUserById(userId, {
    password
  });

  if (authError) {
    throw Object.assign(new Error(authError.message), { status: 400 });
  }

  await audit(admin, caller, "reset_staff_password", "profile", userId, {
    target_name: target.full_name
  });

  return { user_id: userId };
}

async function createBranch(admin, caller, body) {
  const name = cleanText(body.name, 120);
  const code = cleanText(body.code, 20).toUpperCase();
  const phone = cleanText(body.phone, 60) || null;
  const address = cleanText(body.address, 500) || null;

  if (!name) {
    throw Object.assign(new Error("Branch name is required."), { status: 400 });
  }

  if (!validBranchCode(code)) {
    throw Object.assign(
      new Error("Branch code may use only A-Z, 0-9, underscore, and dash."),
      { status: 400 }
    );
  }

  const { data, error } = await admin
    .from("branches")
    .insert({
      organization_id: caller.organization_id,
      name,
      code,
      phone,
      address,
      is_active: true
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      throw Object.assign(new Error("That branch code is already used."), {
        status: 400
      });
    }
    throw error;
  }

  await audit(admin, caller, "create_branch", "branch", data.id, data);
  return data;
}

async function updateBranch(admin, caller, body) {
  const branchId = cleanText(body.branch_id, 80);
  const name = cleanText(body.name, 120);
  const code = cleanText(body.code, 20).toUpperCase();
  const phone = cleanText(body.phone, 60) || null;
  const address = cleanText(body.address, 500) || null;

  if (!name) {
    throw Object.assign(new Error("Branch name is required."), { status: 400 });
  }

  if (!validBranchCode(code)) {
    throw Object.assign(
      new Error("Branch code may use only A-Z, 0-9, underscore, and dash."),
      { status: 400 }
    );
  }

  const { data: existing, error: existingError } = await admin
    .from("branches")
    .select("*")
    .eq("id", branchId)
    .eq("organization_id", caller.organization_id)
    .single();

  if (existingError || !existing) {
    throw Object.assign(new Error("Branch not found."), { status: 404 });
  }

  const { data, error } = await admin
    .from("branches")
    .update({ name, code, phone, address, updated_at: new Date().toISOString() })
    .eq("id", branchId)
    .eq("organization_id", caller.organization_id)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      throw Object.assign(new Error("That branch code is already used."), {
        status: 400
      });
    }
    throw error;
  }

  await audit(admin, caller, "update_branch", "branch", branchId, {
    old: existing,
    new: data
  });
  return data;
}

async function setBranchStatus(admin, caller, body) {
  const branchId = cleanText(body.branch_id, 80);
  const isActive = Boolean(body.is_active);

  const { data: branch, error: branchError } = await admin
    .from("branches")
    .select("*")
    .eq("id", branchId)
    .eq("organization_id", caller.organization_id)
    .single();

  if (branchError || !branch) {
    throw Object.assign(new Error("Branch not found."), { status: 404 });
  }

  if (!isActive) {
    const { count, error: countError } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", caller.organization_id)
      .eq("branch_id", branchId)
      .eq("is_active", true);

    if (countError) throw countError;

    if (Number(count || 0) > 0) {
      throw Object.assign(
        new Error("Move or deactivate all active staff before disabling this branch."),
        { status: 400 }
      );
    }
  }

  const { data, error } = await admin
    .from("branches")
    .update({
      is_active: isActive,
      updated_at: new Date().toISOString()
    })
    .eq("id", branchId)
    .select()
    .single();

  if (error) throw error;

  await audit(admin, caller, "set_branch_status", "branch", branchId, {
    is_active: isActive
  });
  return data;
}

async function switchMyBranch(admin, caller, body) {
  const branchId = cleanText(body.branch_id, 80);
  await ensureBranch(admin, caller.organization_id, branchId);

  const { data, error } = await admin
    .from("profiles")
    .update({
      branch_id: branchId,
      updated_at: new Date().toISOString()
    })
    .eq("id", caller.id)
    .select()
    .single();

  if (error) throw error;

  await audit(admin, caller, "switch_branch", "profile", caller.id, {
    branch_id: branchId
  });
  return data;
}

export default async (request) => {
  try {
    if (!["GET", "POST"].includes(request.method)) {
      return json({ ok: false, error: "Method not allowed." }, 405);
    }

    const admin = createAdminClient();
    const { profile: caller } = await authenticate(request, admin);

    if (request.method === "GET") {
      const workspace = await loadWorkspace(admin, caller);
      return json({ ok: true, ...workspace });
    }

    const body = await request.json().catch(() => ({}));
    const action = cleanText(body.action, 40);
    let result;

    switch (action) {
      case "create_user":
        result = await createUser(admin, caller, body);
        break;
      case "update_user":
        result = await updateUser(admin, caller, body);
        break;
      case "set_user_status":
        result = await setUserStatus(admin, caller, body);
        break;
      case "reset_password":
        result = await resetPassword(admin, caller, body);
        break;
      case "create_branch":
        result = await createBranch(admin, caller, body);
        break;
      case "update_branch":
        result = await updateBranch(admin, caller, body);
        break;
      case "set_branch_status":
        result = await setBranchStatus(admin, caller, body);
        break;
      case "switch_my_branch":
        result = await switchMyBranch(admin, caller, body);
        break;
      default:
        return json({ ok: false, error: "Unknown administration action." }, 400);
    }

    return json({ ok: true, result });
  } catch (error) {
    console.error("staff-admin error", error);
    return json(
      { ok: false, error: error.message || "Administration request failed." },
      Number(error.status || 500)
    );
  }
};