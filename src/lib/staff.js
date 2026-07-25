async function authorizedRequest(session, options = {}) {
  if (!session?.access_token) {
    throw new Error("Your login session is missing. Log in again.");
  }

  const response = await fetch("/api/staff-admin", {
    method: options.method || "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok || !result.ok) {
    throw new Error(result.error || "Staff administration request failed.");
  }

  return result;
}

export async function loadStaffWorkspace(session) {
  const result = await authorizedRequest(session);
  return {
    staff: result.staff || [],
    branches: result.branches || []
  };
}

export async function createStaffUser(session, values) {
  return authorizedRequest(session, {
    method: "POST",
    body: { action: "create_user", ...values }
  });
}

export async function updateStaffUser(session, values) {
  return authorizedRequest(session, {
    method: "POST",
    body: { action: "update_user", ...values }
  });
}

export async function setStaffStatus(session, userId, isActive) {
  return authorizedRequest(session, {
    method: "POST",
    body: {
      action: "set_user_status",
      user_id: userId,
      is_active: Boolean(isActive)
    }
  });
}

export async function resetStaffPassword(session, userId, password) {
  return authorizedRequest(session, {
    method: "POST",
    body: {
      action: "reset_password",
      user_id: userId,
      password
    }
  });
}

export async function saveBranch(session, values) {
  return authorizedRequest(session, {
    method: "POST",
    body: {
      action: values.id ? "update_branch" : "create_branch",
      branch_id: values.id || undefined,
      name: values.name,
      code: values.code,
      phone: values.phone,
      address: values.address
    }
  });
}

export async function setBranchStatus(session, branchId, isActive) {
  return authorizedRequest(session, {
    method: "POST",
    body: {
      action: "set_branch_status",
      branch_id: branchId,
      is_active: Boolean(isActive)
    }
  });
}

export async function switchMyBranch(session, branchId) {
  return authorizedRequest(session, {
    method: "POST",
    body: {
      action: "switch_my_branch",
      branch_id: branchId
    }
  });
}

export function roleLabel(role) {
  return String(role || "user")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function staffToForm(member) {
  return {
    user_id: member?.id || null,
    email: member?.email || "",
    full_name: member?.full_name || "",
    phone: member?.phone || "",
    role: member?.role || "cashier",
    branch_id: member?.branch_id || "",
    is_active: member?.is_active !== false,
    password: "",
    confirm_password: ""
  };
}

export function branchToForm(branch) {
  return {
    id: branch?.id || null,
    name: branch?.name || "",
    code: branch?.code || "",
    phone: branch?.phone || "",
    address: branch?.address || ""
  };
}
