import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import { dispatchOperationalEvent } from "./_telegram-events.mjs";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers
    }
  });
}

function serviceClient() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error("Supabase server environment is incomplete.");
  }

  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function cleanSlug(value) {
  const slug = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{2,59}$/.test(slug)) {
    throw Object.assign(new Error("Storefront address is invalid."), { status: 400 });
  }
  return slug;
}

function clientFingerprint(request) {
  const forwarded = request.headers.get("x-nf-client-connection-ip")
    || request.headers.get("x-forwarded-for")
    || "";
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET || SERVICE_ROLE_KEY || "tiny-pos";
  return crypto
    .createHmac("sha256", secret)
    .update(String(forwarded).split(",")[0].trim())
    .digest("hex");
}

function publicError(error) {
  const message = String(error?.message || error || "")
    .replace(/^.*?:\s*/, "")
    .slice(0, 300) || "The request could not be completed.";
  return json({ ok: false, error: message }, Number(error?.status || 400));
}

function cloudinaryConfig() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    throw Object.assign(new Error("Bank-slip upload is not configured."), { status: 503 });
  }
  return { cloudName, apiKey, apiSecret };
}

function signCloudinary(params, secret) {
  const source = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return crypto.createHash("sha1").update(source + secret).digest("hex");
}

async function catalog(service, slug) {
  const { data, error } = await service.rpc("get_public_storefront", { p_slug: slug });
  if (error) throw error;

  try {
    const { data: storeSetting } = await service
      .from("online_store_settings")
      .select("id, organization_id, branch_id")
      .eq("slug", slug)
      .maybeSingle();

    if (storeSetting?.organization_id) {
      // 1. Authoritative sellable stock calculation (branch inventory - active sales order reservations)
      const [balancesRes, batchesRes, reservationsRes] = await Promise.all([
        service
          .from("inventory_balances")
          .select("product_id, quantity")
          .eq("branch_id", storeSetting.branch_id),
        service
          .from("inventory_batches")
          .select("product_id, quantity, expiry_date, status")
          .eq("organization_id", storeSetting.organization_id)
          .eq("branch_id", storeSetting.branch_id)
          .eq("status", "active")
          .gt("quantity", 0),
        service
          .from("stock_reservations")
          .select("product_id, reserved_base_quantity, delivered_base_quantity, released_base_quantity, status, sales_orders!inner(id, status)")
          .eq("organization_id", storeSetting.organization_id)
          .eq("branch_id", storeSetting.branch_id)
          .eq("status", "active")
          .in("sales_orders.status", ["confirmed", "partially_delivered"])
      ]);

      const balanceMap = new Map();
      (balancesRes.data || []).forEach((row) => {
        balanceMap.set(row.product_id, Number(row.quantity || 0));
      });

      const todayStr = new Date().toISOString().slice(0, 10);
      const batchMap = new Map();
      (batchesRes.data || []).forEach((batch) => {
        if (batch.expiry_date && String(batch.expiry_date).slice(0, 10) < todayStr) return;
        const current = batchMap.get(batch.product_id) || 0;
        batchMap.set(batch.product_id, current + Number(batch.quantity || 0));
      });

      const reservedMap = new Map();
      (reservationsRes.data || []).forEach((res) => {
        const activeReserved = Math.max(
          0,
          Number(res.reserved_base_quantity || 0) -
          Number(res.delivered_base_quantity || 0) -
          Number(res.released_base_quantity || 0)
        );
        const current = reservedMap.get(res.product_id) || 0;
        reservedMap.set(res.product_id, current + activeReserved);
      });

      // 2. Enrich promotional discounts
      const nowIso = new Date().toISOString();
      const { data: promoRows } = await service
        .from("product_promotions")
        .select(`
          id,
          organization_id,
          branch_id,
          name,
          discount_type,
          discount_value,
          starts_at,
          ends_at,
          allow_coupon,
          allow_manual_discount,
          allow_online,
          max_base_quantity,
          reserved_base_quantity,
          is_active,
          product_promotion_items(
            id,
            product_id,
            product_unit_id,
            max_unit_quantity,
            reserved_unit_quantity
          )
        `)
        .eq("organization_id", storeSetting.organization_id)
        .eq("is_active", true)
        .lte("starts_at", nowIso);

      const activeOnlinePromos = (promoRows || []).filter((promo) => {
        if (!promo.is_active) return false;
        if (promo.allow_online === false) return false;
        if (promo.ends_at && new Date(promo.ends_at) < new Date(nowIso)) return false;
        if (promo.branch_id && String(promo.branch_id) !== String(storeSetting.branch_id)) return false;
        if (promo.max_base_quantity != null && Number(promo.reserved_base_quantity || 0) >= Number(promo.max_base_quantity)) return false;
        return true;
      });

      const unitPromoMap = new Map();
      const productPromoMap = new Map();

      activeOnlinePromos.forEach((promo) => {
        const promoObj = {
          id: promo.id,
          name: promo.name,
          discount_type: promo.discount_type,
          discount_value: Number(promo.discount_value || 0),
          allow_coupon: promo.allow_coupon,
          allow_manual_discount: promo.allow_manual_discount,
          allow_online: promo.allow_online,
          starts_at: promo.starts_at,
          ends_at: promo.ends_at
        };

        const items = Array.isArray(promo.product_promotion_items) ? promo.product_promotion_items : [];
        items.forEach((item) => {
          if (item.max_unit_quantity != null && Number(item.reserved_unit_quantity || 0) >= Number(item.max_unit_quantity)) {
            return;
          }

          if (item.product_unit_id) {
            unitPromoMap.set(`${item.product_id}:${item.product_unit_id}`, {
              ...promoObj,
              product_unit_id: item.product_unit_id
            });
          } else {
            productPromoMap.set(item.product_id, promoObj);
          }
        });
      });

      if (Array.isArray(data?.products)) {
        data.products.forEach((product) => {
          // Calculate authoritative sellable stock
          const isTracked = product.track_stock !== false;
          let availableBase = 999999999;
          if (isTracked) {
            const branchInventory = product.batch_tracking
              ? (batchMap.get(product.id) || 0)
              : (balanceMap.get(product.id) || 0);
            const reservedStock = reservedMap.get(product.id) || 0;
            availableBase = Math.max(0, Number(branchInventory) - Number(reservedStock));
          }
          product.available_base = availableBase;

          const productPromo = productPromoMap.get(product.id) || null;
          let activeUnitPromo = null;

          if (Array.isArray(product.units)) {
            product.units.forEach((unit) => {
              const factor = Number(unit.factor || unit.conversion_factor || 1) || 1;
              unit.available_quantity = !isTracked
                ? 999999999
                : Math.max(0, Math.floor(availableBase / factor));

              const matchedPromo = unitPromoMap.get(`${product.id}:${unit.id}`) || productPromo || unit.promotion || null;
              if (matchedPromo) {
                unit.promotion = matchedPromo;
                if (!activeUnitPromo) activeUnitPromo = matchedPromo;
              }
            });
          }

          const resolvedPromo = activeUnitPromo || productPromo || product.active_promotion || null;
          product.active_promotion = resolvedPromo;
          product.has_active_promotion = Boolean(resolvedPromo || product.units?.some((u) => u.promotion));
        });
      }
    }
  } catch (enrichError) {
    console.error("Storefront catalog enrichment failed:", enrichError);
  }

  return json({ ok: true, ...data }, 200, {
    "cache-control": "no-cache, no-store, must-revalidate"
  });
}

async function uploadSignature(service, request, slug) {
  const body = await request.json().catch(() => ({}));
  const fileType = String(body.file_type || "").toLowerCase();
  const fileSize = Number(body.file_size || 0);

  if (!fileType.startsWith("image/") || fileSize <= 0 || fileSize > 5 * 1024 * 1024) {
    throw Object.assign(new Error("Choose a bank-slip image up to 5 MB."), { status: 400 });
  }

  const { data: store, error } = await service
    .from("online_store_settings")
    .select("organization_id,branch_id,allow_bank_transfer,is_published")
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();
  if (error) throw error;
  if (!store?.allow_bank_transfer) {
    throw Object.assign(new Error("Bank transfer is unavailable for this store."), { status: 400 });
  }

  const { cloudName, apiKey, apiSecret } = cloudinaryConfig();
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = `tiny-pos-new/online-orders/${store.organization_id}/${store.branch_id}`;
  const publicId = `slip-${timestamp}-${crypto.randomBytes(6).toString("hex")}`;
  const params = {
    folder,
    invalidate: "true",
    overwrite: "false",
    public_id: publicId,
    timestamp
  };

  return json({
    ok: true,
    cloudName,
    apiKey,
    timestamp,
    folder,
    publicId,
    overwrite: params.overwrite,
    invalidate: params.invalidate,
    signature: signCloudinary(params, apiSecret)
  });
}

function validCloudinaryImage(url) {
  return /^https:\/\/res\.cloudinary\.com\//i.test(String(url || ""));
}

async function submitOrder(service, request, slug) {
  const body = await request.json();

  if (String(body?.website || "").trim()) {
    return json({ ok: true, order_number: "RECEIVED" });
  }

  const slipUrl = String(body?.bank_slip_url || "").trim();
  const slipPublicId = String(body?.bank_slip_public_id || "").trim();
  const bankReference = String(body?.bank_reference || "").trim().slice(0, 160);
  if (body?.payment_method === "bank_transfer") {
    if (!validCloudinaryImage(slipUrl) || !slipPublicId) {
      throw Object.assign(new Error("Upload a valid bank-slip image before submitting the order."), { status: 400 });
    }
  }

  const { data, error } = await service.rpc("submit_online_order", {
    p_slug: slug,
    p_payload: body,
    p_source_ip_hash: clientFingerprint(request),
    p_user_agent: request.headers.get("user-agent") || null
  });
  if (error) throw error;

  if (body?.payment_method === "bank_transfer" && slipUrl) {
    const { error: updateError } = await service
      .from("online_orders")
      .update({
        bank_slip_url: slipUrl,
        bank_slip_public_id: slipPublicId,
        bank_slip_uploaded_at: new Date().toISOString(),
        bank_reference: bankReference || null
      })
      .eq("id", data.order_id);
    if (updateError) throw updateError;

    await service
      .from("telegram_operational_events")
      .update({
        payload: {
          order_number: data.order_number,
          customer_name: String(body.customer_name || "").trim(),
          customer_phone: String(body.customer_phone || "").trim(),
          currency: data.currency,
          total_amount: data.total_amount,
          payment_method: "bank_transfer",
          payment_status: "pending_confirmation",
          fulfilment_type: String(body.fulfilment_type || "pickup"),
          bank_slip_url: slipUrl,
          created_at: new Date().toISOString()
        }
      })
      .eq("event_key", `online_order_requested:${data.order_id}`);
  }

  try {
    const { data: event } = await service
      .from("telegram_operational_events")
      .select("id")
      .eq("event_key", `online_order_requested:${data.order_id}`)
      .maybeSingle();
    if (event?.id) await dispatchOperationalEvent(service, event.id);
  } catch (notificationError) {
    console.error("Immediate online-order Telegram alert failed", notificationError);
  }

  return json({
    ...data,
    bank_slip_url: slipUrl || null,
    bank_reference: bankReference || null
  }, 201);
}

async function trackOrder(service, slug, url) {
  const orderNumber = String(url.searchParams.get("order") || "").trim();
  const trackingToken = String(url.searchParams.get("token") || "").trim();
  if (!orderNumber || trackingToken.length < 20) {
    throw Object.assign(new Error("Order number and tracking token are required."), { status: 400 });
  }

  const { data, error } = await service.rpc("track_online_order", {
    p_slug: slug,
    p_order_number: orderNumber,
    p_tracking_token: trackingToken
  });
  if (error) throw error;
  return json({ ok: true, order: data });
}

async function phoneOrders(service, request, slug, url) {
  const phone = String(url.searchParams.get("phone") || "").trim();
  if (phone.replace(/\D/g, "").length < 7) {
    throw Object.assign(new Error("Enter a valid phone number."), { status: 400 });
  }

  const { data, error } = await service.rpc("find_public_orders_by_phone", {
    p_slug: slug,
    p_phone: phone,
    p_source_ip_hash: clientFingerprint(request)
  });
  if (error) {
    if (/too many recent lookup attempts/i.test(error.message || "")) {
      throw Object.assign(new Error(error.message), { status: 429 });
    }
    throw error;
  }
  return json({ ok: true, orders: Array.isArray(data) ? data : [] });
}

export default async (request) => {
  try {
    const url = new URL(request.url);
    const slug = cleanSlug(url.searchParams.get("slug"));
    const service = serviceClient();
    const action = url.searchParams.get("action") || (request.method === "GET" ? "catalog" : "submit");

    if (request.method === "GET") {
      if (action === "track") return await trackOrder(service, slug, url);
      if (action === "phone-orders") return await phoneOrders(service, request, slug, url);
      return await catalog(service, slug);
    }

    if (request.method === "POST") {
      if (action === "upload-signature") return await uploadSignature(service, request, slug);
      return await submitOrder(service, request, slug);
    }

    return json({ ok: false, error: "Method not allowed." }, 405, { allow: "GET, POST" });
  } catch (error) {
    return publicError(error);
  }
};
