import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

function json(body, status = 200, headers = {}) {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        "content-type":
          "application/json; charset=utf-8",
        "cache-control": "no-store",
        ...headers
      }
    }
  );
}

function serviceClient() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error(
      "Supabase server environment is incomplete."
    );
  }

  return createClient(
    SUPABASE_URL,
    SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    }
  );
}

function cleanSlug(value) {
  const slug = String(value || "")
    .trim()
    .toLowerCase();

  if (!/^[a-z0-9][a-z0-9-]{2,59}$/.test(slug)) {
    throw Object.assign(
      new Error("Storefront address is invalid."),
      { status: 400 }
    );
  }

  return slug;
}

function clientFingerprint(request) {
  const forwarded =
    request.headers.get("x-nf-client-connection-ip")
    || request.headers.get("x-forwarded-for")
    || "";
  const secret =
    process.env.TELEGRAM_WEBHOOK_SECRET
    || SERVICE_ROLE_KEY
    || "tiny-pos";

  return crypto
    .createHmac("sha256", secret)
    .update(String(forwarded).split(",")[0].trim())
    .digest("hex");
}

function publicError(error) {
  const message =
    String(error?.message || error || "")
      .replace(/^.*?:\s*/, "")
      .slice(0, 300)
    || "The request could not be completed.";

  return json(
    {
      ok: false,
      error: message
    },
    Number(error?.status || 400)
  );
}

async function catalog(service, slug) {
  const { data, error } = await service.rpc(
    "get_public_storefront",
    { p_slug: slug }
  );

  if (error) throw error;

  return json(
    {
      ok: true,
      ...data
    },
    200,
    {
      "cache-control":
        "public, max-age=30, stale-while-revalidate=120"
    }
  );
}

async function submitOrder(
  service,
  request,
  slug
) {
  const body = await request.json();

  // Simple bot trap. Human forms leave this blank.
  if (String(body?.website || "").trim()) {
    return json({
      ok: true,
      order_number: "RECEIVED"
    });
  }

  const { data, error } = await service.rpc(
    "submit_online_order",
    {
      p_slug: slug,
      p_payload: body,
      p_source_ip_hash:
        clientFingerprint(request),
      p_user_agent:
        request.headers.get("user-agent")
        || null
    }
  );

  if (error) throw error;
  return json(data, 201);
}

async function trackOrder(
  service,
  slug,
  url
) {
  const orderNumber =
    String(url.searchParams.get("order") || "")
      .trim();
  const trackingToken =
    String(url.searchParams.get("token") || "")
      .trim();

  if (!orderNumber || trackingToken.length < 20) {
    throw Object.assign(
      new Error(
        "Order number and tracking token are required."
      ),
      { status: 400 }
    );
  }

  const { data, error } = await service.rpc(
    "track_online_order",
    {
      p_slug: slug,
      p_order_number: orderNumber,
      p_tracking_token: trackingToken
    }
  );

  if (error) throw error;
  return json({ ok: true, order: data });
}

export default async (request) => {
  try {
    const url = new URL(request.url);
    const slug = cleanSlug(
      url.searchParams.get("slug")
    );
    const service = serviceClient();

    if (request.method === "GET") {
      const action =
        url.searchParams.get("action")
        || "catalog";

      if (action === "track") {
        return await trackOrder(
          service,
          slug,
          url
        );
      }

      return await catalog(service, slug);
    }

    if (request.method === "POST") {
      return await submitOrder(
        service,
        request,
        slug
      );
    }

    return json(
      {
        ok: false,
        error: "Method not allowed."
      },
      405,
      { allow: "GET, POST" }
    );
  } catch (error) {
    return publicError(error);
  }
};
