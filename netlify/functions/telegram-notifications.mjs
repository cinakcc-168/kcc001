import {
  escapeHtml,
  miniAppUrl,
  sendTelegramMessage,
  serviceClient
} from "./_telegram-shared.mjs";

export const config = {
  schedule: "*/15 * * * *"
};

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value, currency) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "KHR" ? 0 : 2
  }).format(number(value));
}

function zonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);

  return Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );
}

function zonedDateTimeToUtc({
  year,
  month,
  day,
  hour = 0,
  minute = 0,
  second = 0
}, timeZone) {
  const desired = Date.UTC(
    year,
    month - 1,
    day,
    hour,
    minute,
    second
  );

  let guess = desired;

  for (let index = 0; index < 3; index += 1) {
    const parts = zonedParts(new Date(guess), timeZone);
    const represented = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second
    );
    guess += desired - represented;
  }

  return new Date(guess);
}

function localContext(now, timeZone) {
  const parts = zonedParts(now, timeZone);
  const start = zonedDateTimeToUtc({
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: 0,
    minute: 0,
    second: 0
  }, timeZone);

  const tomorrowLocal = new Date(Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day + 1
  ));

  const tomorrowParts = {
    year: tomorrowLocal.getUTCFullYear(),
    month: tomorrowLocal.getUTCMonth() + 1,
    day: tomorrowLocal.getUTCDate(),
    hour: 0,
    minute: 0,
    second: 0
  };

  const end = zonedDateTimeToUtc(tomorrowParts, timeZone);

  return {
    date: `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`,
    hour: parts.hour,
    start: start.toISOString(),
    end: end.toISOString()
  };
}

function isQuiet(preferences, hour) {
  const start = preferences.quiet_start_hour;
  const end = preferences.quiet_end_hour;

  if (start === null || start === undefined || end === null || end === undefined) {
    return false;
  }

  if (start === end) return false;
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

function canReceive(role, eventType) {
  const roles = {
    stock: ["owner", "admin", "manager"],
    summary: ["owner", "admin", "manager", "cashier", "viewer"],
    credit: ["owner", "admin", "manager"],
    supplier: ["owner", "admin", "manager"],
    purchase: ["owner", "admin", "manager"],
    transfer: ["owner", "admin", "manager"],
    quotation: ["owner", "admin", "manager", "cashier"],
    register: ["owner", "admin", "manager", "cashier"]
  };

  return (roles[eventType] || []).includes(role);
}

async function reserveDelivery(service, link, event) {
  const { data, error } = await service
    .from("telegram_notification_deliveries")
    .insert({
      organization_id: link.organization_id,
      user_id: link.user_id,
      telegram_link_id: link.id,
      event_type: event.type,
      event_key: event.key,
      chat_id: link.chat_id,
      message_text: event.text,
      status: "pending",
      payload: event.payload || {}
    })
    .select("id")
    .single();

  if (error?.code === "23505") return null;
  if (error) throw error;
  return data.id;
}

async function deliver(service, link, event) {
  const deliveryId = await reserveDelivery(service, link, event);
  if (!deliveryId) return false;

  try {
    const message = await sendTelegramMessage({
      chatId: link.chat_id,
      text: event.text,
      path: event.path,
      buttonText: event.buttonText || "Open Tiny POS"
    });

    await service
      .from("telegram_notification_deliveries")
      .update({
        status: "sent",
        telegram_message_id: message.message_id,
        sent_at: new Date().toISOString()
      })
      .eq("id", deliveryId);

    return true;
  } catch (error) {
    await service
      .from("telegram_notification_deliveries")
      .update({
        status: "failed",
        error_message: String(error.message || error).slice(0, 1000)
      })
      .eq("id", deliveryId);

    if (/blocked by the user|chat not found|user is deactivated/i.test(error.message)) {
      await service
        .from("telegram_user_links")
        .update({ is_active: false })
        .eq("id", link.id);
    }

    return false;
  }
}

async function activeBranchIds(service, link, profile, preferences) {
  if (
    preferences.all_branches
    && ["owner", "admin"].includes(profile.role)
  ) {
    const { data, error } = await service
      .from("branches")
      .select("id,name,code")
      .eq("organization_id", link.organization_id)
      .eq("is_active", true)
      .order("name");

    if (error) throw error;
    return data || [];
  }

  return profile.branches
    ? [profile.branches]
    : profile.branch_id
      ? [{ id: profile.branch_id, name: "Assigned branch" }]
      : [];
}

async function buildSummary(service, link, branchIds, context, scopeName) {
  const ids = branchIds.map((branch) => branch.id);

  const [salesResult, returnsResult] = await Promise.all([
    service
      .from("sales")
      .select("id,currency,total_amount")
      .eq("organization_id", link.organization_id)
      .in("branch_id", ids)
      .in("status", ["completed", "partially_refunded", "refunded"])
      .gte("completed_at", context.start)
      .lt("completed_at", context.end),
    service
      .from("returns")
      .select("id,currency,refund_amount")
      .eq("organization_id", link.organization_id)
      .in("branch_id", ids)
      .eq("status", "completed")
      .gte("processed_at", context.start)
      .lt("processed_at", context.end)
  ]);

  if (salesResult.error) throw salesResult.error;
  if (returnsResult.error) throw returnsResult.error;

  const totals = { USD: 0, KHR: 0 };
  const refunds = { USD: 0, KHR: 0 };

  for (const sale of salesResult.data || []) {
    totals[sale.currency] += number(sale.total_amount);
  }

  for (const row of returnsResult.data || []) {
    refunds[row.currency] += number(row.refund_amount);
  }

  return {
    type: "summary",
    key: `summary:${context.date}:${scopeName}`,
    path: "/dashboard",
    buttonText: "Open Dashboard",
    text: [
      `📊 <b>Daily sales summary · ${escapeHtml(scopeName)}</b>`,
      "",
      `Transactions: ${(salesResult.data || []).length}`,
      `Net USD: ${money(totals.USD - refunds.USD, "USD")}`,
      `Net KHR: ${money(totals.KHR - refunds.KHR, "KHR")}`,
      `Refunds: ${(returnsResult.data || []).length}`,
      "",
      `Business date: ${context.date}`
    ].join("\n"),
    payload: { totals, refunds }
  };
}

async function buildStock(service, link, branchIds, context, scopeName, settings) {
  const ids = branchIds.map((branch) => branch.id);
  const { data, error } = await service
    .from("inventory_balances")
    .select(`
      quantity,
      branch_id,
      products!inner(
        id,
        name,
        is_active,
        track_stock,
        low_stock_threshold
      )
    `)
    .eq("organization_id", link.organization_id)
    .in("branch_id", ids)
    .eq("products.is_active", true)
    .eq("products.track_stock", true);

  if (error) throw error;

  let out = 0;
  let low = 0;

  for (const row of data || []) {
    const quantity = number(row.quantity);
    const threshold = number(
      row.products?.low_stock_threshold
      ?? settings.low_stock_threshold
      ?? 0
    );

    if (quantity <= 0) out += 1;
    else if (quantity <= threshold) low += 1;
  }

  if (!out && !low) return null;

  return {
    type: "stock",
    key: `stock:${context.date}:${scopeName}`,
    path: "/reorder",
    buttonText: "Open Reorder Planner",
    text: [
      `⚠️ <b>Stock alert · ${escapeHtml(scopeName)}</b>`,
      "",
      `Out of stock: ${out}`,
      `Low stock: ${low}`,
      "",
      "Review the Reorder Planner before the next purchase."
    ].join("\n"),
    payload: { out_of_stock: out, low_stock: low }
  };
}

async function buildCredit(service, link, branchIds, context, scopeName) {
  const ids = branchIds.map((branch) => branch.id);
  const { data, error } = await service
    .from("sales")
    .select("id,currency,credit_amount,paid_amount,credit_due_date")
    .eq("organization_id", link.organization_id)
    .in("branch_id", ids)
    .not("credit_account_id", "is", null)
    .lt("credit_due_date", context.date)
    .in("payment_status", ["unpaid", "partial"]);

  if (error) throw error;
  if (!(data || []).length) return null;

  const due = { USD: 0, KHR: 0 };
  for (const sale of data || []) {
    due[sale.currency] += Math.max(
      0,
      number(sale.credit_amount) - number(sale.paid_amount)
    );
  }

  return {
    type: "credit",
    key: `credit:${context.date}:${scopeName}`,
    path: "/credit-accounts",
    buttonText: "Open Credit Accounts",
    text: [
      `⏰ <b>Overdue customer credit · ${escapeHtml(scopeName)}</b>`,
      "",
      `Overdue invoices: ${data.length}`,
      `Outstanding USD: ${money(due.USD, "USD")}`,
      `Outstanding KHR: ${money(due.KHR, "KHR")}`
    ].join("\n"),
    payload: { count: data.length, due }
  };
}

async function buildSupplier(service, link, branchIds, context, scopeName) {
  const ids = branchIds.map((branch) => branch.id);
  const { data, error } = await service
    .from("purchases")
    .select("id,currency,total_amount,amount_paid,payment_due_date")
    .eq("organization_id", link.organization_id)
    .in("branch_id", ids)
    .eq("status", "received")
    .lte("payment_due_date", context.date);

  if (error) throw error;

  const rows = (data || []).filter(
    (row) => number(row.total_amount) > number(row.amount_paid)
  );

  if (!rows.length) return null;

  return {
    type: "supplier",
    key: `supplier:${context.date}:${scopeName}`,
    path: "/supplier-payables",
    buttonText: "Open Supplier Payables",
    text: [
      `🧾 <b>Supplier balances due · ${escapeHtml(scopeName)}</b>`,
      "",
      `Due or overdue purchase orders: ${rows.length}`,
      "Open Supplier Payables for return-credit-adjusted balances and aging."
    ].join("\n"),
    payload: { count: rows.length }
  };
}

async function buildPurchase(service, link, branchIds, context, scopeName) {
  const ids = branchIds.map((branch) => branch.id);
  const { data, error } = await service
    .from("purchases")
    .select("id,status,expected_date")
    .eq("organization_id", link.organization_id)
    .in("branch_id", ids)
    .in("status", ["ordered", "partially_received"])
    .lt("expected_date", context.date);

  if (error) throw error;
  if (!(data || []).length) return null;

  return {
    type: "purchase",
    key: `purchase:${context.date}:${scopeName}`,
    path: "/purchase-orders",
    buttonText: "Open Purchase Orders",
    text: [
      `📦 <b>Overdue purchase deliveries · ${escapeHtml(scopeName)}</b>`,
      "",
      `Orders past expected date: ${data.length}`,
      "Review ordered and partially received purchase orders."
    ].join("\n"),
    payload: { count: data.length }
  };
}

async function buildTransfer(service, link, branchIds, context, scopeName) {
  const ids = branchIds.map((branch) => branch.id);
  const { data, error } = await service
    .from("stock_transfers")
    .select("id,source_branch_id,destination_branch_id")
    .eq("organization_id", link.organization_id)
    .eq("status", "pending")
    .or(
      `source_branch_id.in.(${ids.join(",")}),destination_branch_id.in.(${ids.join(",")})`
    );

  if (error) throw error;
  if (!(data || []).length) return null;

  const inbound = (data || []).filter(
    (row) => ids.includes(row.destination_branch_id)
  ).length;
  const outbound = (data || []).filter(
    (row) => ids.includes(row.source_branch_id)
  ).length;

  return {
    type: "transfer",
    key: `transfer:${context.date}:${scopeName}`,
    path: "/transfers",
    buttonText: "Open Stock Transfers",
    text: [
      `🚚 <b>Pending stock transfers · ${escapeHtml(scopeName)}</b>`,
      "",
      `Inbound waiting: ${inbound}`,
      `Outbound in transit: ${outbound}`
    ].join("\n"),
    payload: { inbound, outbound }
  };
}

async function buildQuotation(service, link, branchIds, context, scopeName) {
  const ids = branchIds.map((branch) => branch.id);
  const soon = new Date(`${context.date}T00:00:00.000Z`);
  soon.setUTCDate(soon.getUTCDate() + 2);
  const soonDate = soon.toISOString().slice(0, 10);

  const { data, error } = await service
    .from("sales_quotes")
    .select("id,currency,total_amount,valid_until")
    .eq("organization_id", link.organization_id)
    .in("branch_id", ids)
    .in("status", ["draft", "sent", "accepted"])
    .gte("valid_until", context.date)
    .lte("valid_until", soonDate);

  if (error) throw error;
  if (!(data || []).length) return null;

  return {
    type: "quotation",
    key: `quotation:${context.date}:${scopeName}`,
    path: "/quotes",
    buttonText: "Open Quotations",
    text: [
      `📄 <b>Quotations expiring soon · ${escapeHtml(scopeName)}</b>`,
      "",
      `Expiring within 2 days: ${data.length}`,
      "Contact customers or create updated quotations before expiry."
    ].join("\n"),
    payload: { count: data.length }
  };
}

async function buildRegister(service, link, branchIds, context, scopeName) {
  const ids = branchIds.map((branch) => branch.id);
  const { data, error } = await service
    .from("cash_register_sessions")
    .select("id,status,opened_at,closed_at,variance_usd,variance_khr")
    .eq("organization_id", link.organization_id)
    .in("branch_id", ids)
    .or(`and(status.eq.closed,closed_at.gte.${context.start},closed_at.lt.${context.end}),status.eq.open`);

  if (error) throw error;

  const now = Date.now();
  const longOpen = (data || []).filter(
    (row) => row.status === "open"
      && now - new Date(row.opened_at).getTime() > 14 * 60 * 60 * 1000
  );
  const variances = (data || []).filter(
    (row) => row.status === "closed"
      && (Math.abs(number(row.variance_usd)) >= 0.01
        || Math.abs(number(row.variance_khr)) >= 1)
  );

  if (!longOpen.length && !variances.length) return null;

  return {
    type: "register",
    key: `register:${context.date}:${scopeName}`,
    path: "/cash-register",
    buttonText: "Open Cash Register",
    text: [
      `💵 <b>Cash register attention · ${escapeHtml(scopeName)}</b>`,
      "",
      `Open longer than 14 hours: ${longOpen.length}`,
      `Closed with a variance today: ${variances.length}`
    ].join("\n"),
    payload: {
      long_open: longOpen.length,
      variance_sessions: variances.length
    }
  };
}

export default async () => {
  const service = serviceClient();
  let sent = 0;
  let failed = 0;
  let considered = 0;

  try {
    const { data: links, error: linksError } = await service
      .from("telegram_user_links")
      .select(`
        *,
        profiles!inner(
          id,
          organization_id,
          branch_id,
          full_name,
          role,
          is_active,
          branches(id,name,code)
        )
      `)
      .eq("is_active", true)
      .eq("profiles.is_active", true);

    if (linksError) throw linksError;

    const userIds = (links || []).map((link) => link.user_id);
    const { data: preferenceRows, error: preferenceError } = userIds.length
      ? await service
          .from("telegram_notification_preferences")
          .select("*")
          .in("user_id", userIds)
      : { data: [], error: null };

    if (preferenceError) throw preferenceError;

    const preferenceMap = new Map(
      (preferenceRows || []).map((row) => [row.user_id, row])
    );

    const settingsCache = new Map();

    for (const link of links || []) {
      considered += 1;

      const profile = link.profiles;
      const preferences = preferenceMap.get(link.user_id);

      if (!profile || !preferences) continue;

      let settings = settingsCache.get(link.organization_id);
      if (!settings) {
        const { data, error } = await service
          .from("app_settings")
          .select("timezone,low_stock_threshold")
          .eq("organization_id", link.organization_id)
          .single();

        if (error) throw error;
        settings = data;
        settingsCache.set(link.organization_id, settings);
      }

      const timeZone = settings.timezone || "Asia/Phnom_Penh";
      const context = localContext(new Date(), timeZone);

      if (isQuiet(preferences, context.hour)) continue;

      const branches = await activeBranchIds(
        service,
        link,
        profile,
        preferences
      );

      if (!branches.length) continue;

      const scopeName = branches.length > 1
        ? "All branches"
        : branches[0].name || "Current branch";

      const builders = [];

      if (
        preferences.sales_summary
        && canReceive(profile.role, "summary")
        && context.hour === Number(preferences.daily_summary_hour)
      ) {
        builders.push(() => buildSummary(
          service, link, branches, context, scopeName
        ));
      }

      if (preferences.stock_alerts && canReceive(profile.role, "stock")) {
        builders.push(() => buildStock(
          service, link, branches, context, scopeName, settings
        ));
      }

      if (preferences.credit_alerts && canReceive(profile.role, "credit")) {
        builders.push(() => buildCredit(
          service, link, branches, context, scopeName
        ));
      }

      if (preferences.supplier_alerts && canReceive(profile.role, "supplier")) {
        builders.push(() => buildSupplier(
          service, link, branches, context, scopeName
        ));
      }

      if (preferences.purchase_alerts && canReceive(profile.role, "purchase")) {
        builders.push(() => buildPurchase(
          service, link, branches, context, scopeName
        ));
      }

      if (preferences.transfer_alerts && canReceive(profile.role, "transfer")) {
        builders.push(() => buildTransfer(
          service, link, branches, context, scopeName
        ));
      }

      if (preferences.quotation_alerts && canReceive(profile.role, "quotation")) {
        builders.push(() => buildQuotation(
          service, link, branches, context, scopeName
        ));
      }

      if (preferences.cash_register_alerts && canReceive(profile.role, "register")) {
        builders.push(() => buildRegister(
          service, link, branches, context, scopeName
        ));
      }

      for (const build of builders) {
        try {
          const event = await build();
          if (!event) continue;
          const delivered = await deliver(service, link, event);
          if (delivered) sent += 1;
        } catch (error) {
          failed += 1;
          console.error(
            "Telegram notification event failed",
            profile.id,
            error
          );
        }
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      considered,
      sent,
      failed
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error("Telegram notification schedule failed", error);

    return new Response(JSON.stringify({
      ok: false,
      error: error.message,
      considered,
      sent,
      failed: failed + 1
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
