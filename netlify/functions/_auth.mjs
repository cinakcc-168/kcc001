import { createClient } from "@supabase/supabase-js";

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}

export async function requireManager(request, permissionKey = "products.manage") {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : "";

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase server configuration is missing.");
  }

  if (!token) {
    const error = new Error("Authentication required.");
    error.status = 401;
    throw error;
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) {
    const error = new Error("Invalid or expired login session.");
    error.status = 401;
    throw error;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, organization_id, branch_id, role, is_active")
    .eq("id", userData.user.id)
    .single();

  if (profileError || !profile?.is_active) {
    const error = new Error("Active POS profile not found.");
    error.status = 403;
    throw error;
  }

  let allowed =
    profile.role === "owner";

  try {
    const { data: accessData } =
      await supabase.rpc(
        "get_my_access"
      );

    allowed = Boolean(
      accessData?.permissions?.["*"]
      || accessData?.permissions?.[
        permissionKey
      ]
    );
  } catch {
    allowed = [
      "owner",
      "admin",
      "manager"
    ].includes(profile.role);
  }

  if (!allowed) {
    const error = new Error(
      `Permission required: ${permissionKey}`
    );
    error.status = 403;
    throw error;
  }

  return {
    supabase,
    user: userData.user,
    profile
  };
}
