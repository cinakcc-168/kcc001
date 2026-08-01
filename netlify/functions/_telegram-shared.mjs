import { createClient } from "@supabase/supabase-js";
import {
  createHash,
  createHmac,
  timingSafeEqual
} from "node:crypto";

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}

export function serviceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required."
    );
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

export async function authenticatedProfile(request) {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    throw Object.assign(
      new Error("Authentication required."),
      { status: 401 }
    );
  }

  const url = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are required."
    );
  }

  const userClient = createClient(url, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  const {
    data: { user },
    error: userError
  } = await userClient.auth.getUser(token);

  if (userError || !user) {
    throw Object.assign(
      new Error("Your session is invalid or expired."),
      { status: 401 }
    );
  }

  const service = serviceClient();
  const { data: profile, error: profileError } = await service
    .from("profiles")
    .select("*,branches(id,name,code),organizations(id,name)")
    .eq("id", user.id)
    .single();

  if (profileError || !profile || !profile.is_active) {
    throw Object.assign(
      new Error("Active POS profile required."),
      { status: 403 }
    );
  }

  return { user, profile, service };
}

export function botToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is missing.");
  return token;
}

export function miniAppUrl(path = "/") {
  const rawBase = (
    process.env.TELEGRAM_MINI_APP_URL
    || process.env.URL
    || ""
  ).trim();

  if (!rawBase || !/^https:\/\//i.test(rawBase)) {
    throw new Error(
      "TELEGRAM_MINI_APP_URL must be one complete HTTPS URL, for example https://kcc-tinypos.netlify.app"
    );
  }

  let parsed;
  try {
    parsed = new URL(rawBase);
  } catch {
    throw new Error(
      "TELEGRAM_MINI_APP_URL is invalid. Use one complete URL with no spaces or duplicated domain."
    );
  }

  const duplicatedNetlifyHost = parsed.hostname.match(
    /^([a-z0-9-]+\.netlify\.app)\1$/i
  );

  if (duplicatedNetlifyHost) {
    parsed.hostname = duplicatedNetlifyHost[1];
  }

  if (parsed.protocol !== "https:") {
    throw new Error("TELEGRAM_MINI_APP_URL must use HTTPS.");
  }

  if (parsed.username || parsed.password) {
    throw new Error("TELEGRAM_MINI_APP_URL must not contain a username or password.");
  }

  parsed.search = "";
  parsed.hash = "";
  parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";

  const normalizedBase = parsed.toString().replace(/\/$/, "");
  return new URL(path, `${normalizedBase}/`).toString();
}

export async function telegramApi(method, payload = {}) {
  const response = await fetch(
    `https://api.telegram.org/bot${botToken()}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }
  );

  const result = await response.json().catch(() => null);

  if (!response.ok || !result?.ok) {
    throw new Error(
      result?.description
      || `Telegram ${method} failed with HTTP ${response.status}.`
    );
  }

  return result.result;
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function appKeyboard(path = "/dashboard", text = "Open Tiny POS") {
  return {
    inline_keyboard: [[
      {
        text,
        web_app: { url: miniAppUrl(path) }
      }
    ]]
  };
}

export async function sendTelegramMessage({
  chatId,
  text,
  path = "/dashboard",
  buttonText = "Open Tiny POS",
  withoutButton = false
}) {
  return telegramApi("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: withoutButton
      ? undefined
      : appKeyboard(path, buttonText)
  });
}

export function hashLinkCode(code) {
  return createHash("sha256")
    .update(String(code || "").trim().toUpperCase())
    .digest("hex");
}

export function validateTelegramInitData(initData, maxAgeSeconds = 86400) {
  if (!initData) {
    throw new Error("Telegram Mini App data is missing.");
  }

  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash");

  if (!receivedHash || !/^[a-f0-9]{64}$/i.test(receivedHash)) {
    throw new Error("Telegram Mini App signature is missing.");
  }

  params.delete("hash");
  params.delete("signature");

  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData")
    .update(botToken())
    .digest();

  const calculated = createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest();

  const received = Buffer.from(receivedHash, "hex");

  if (
    received.length !== calculated.length
    || !timingSafeEqual(received, calculated)
  ) {
    throw new Error("Telegram Mini App signature is invalid.");
  }

  const authDate = Number(params.get("auth_date") || 0);
  const age = Math.floor(Date.now() / 1000) - authDate;

  if (!authDate || age < -60 || age > maxAgeSeconds) {
    throw new Error("Telegram Mini App session is expired.");
  }

  let user;
  try {
    user = JSON.parse(params.get("user") || "null");
  } catch {
    user = null;
  }

  if (!user?.id) {
    throw new Error("Telegram user information is missing.");
  }

  return {
    user,
    queryId: params.get("query_id") || null,
    authDate
  };
}
