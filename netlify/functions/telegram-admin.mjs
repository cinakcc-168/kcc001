import {
  authenticatedProfile,
  botToken,
  json,
  miniAppUrl,
  sendTelegramMessage,
  serviceClient,
  telegramApi,
  validateTelegramInitData
} from "./_telegram-shared.mjs";

function errorResponse(error) {
  return json(
    { ok: false, error: error.message },
    error.status || 500
  );
}

async function botStatus(service, userId) {
  const [me, webhookInfo, linkResult, preferenceResult] = await Promise.all([
    telegramApi("getMe"),
    telegramApi("getWebhookInfo"),
    service
      .from("telegram_user_links")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle(),
    service
      .from("telegram_notification_preferences")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle()
  ]);

  if (linkResult.error) throw linkResult.error;
  if (preferenceResult.error) throw preferenceResult.error;

  return {
    bot: {
      id: me.id,
      username: me.username,
      first_name: me.first_name,
      can_join_groups: me.can_join_groups
    },
    mini_app_url: miniAppUrl("/"),
    webhook: {
      configured: Boolean(webhookInfo.url),
      url: webhookInfo.url || null,
      pending_update_count: webhookInfo.pending_update_count || 0,
      last_error_message: webhookInfo.last_error_message || null
    },
    link: linkResult.data || null,
    preferences: preferenceResult.data || null
  };
}

async function linkMiniApp({ service, profile }, initData) {
  const verified = validateTelegramInitData(initData);
  const telegramUser = verified.user;

  const { data: collision, error: collisionError } = await service
    .from("telegram_user_links")
    .select("id,user_id")
    .eq("organization_id", profile.organization_id)
    .eq("telegram_user_id", telegramUser.id)
    .neq("user_id", profile.id)
    .maybeSingle();

  if (collisionError) throw collisionError;
  if (collision) {
    throw Object.assign(
      new Error(
        "This Telegram account is already connected to another POS user in this organization."
      ),
      { status: 409 }
    );
  }

  const payload = {
    organization_id: profile.organization_id,
    user_id: profile.id,
    telegram_user_id: telegramUser.id,
    chat_id: telegramUser.id,
    username: telegramUser.username || null,
    first_name: telegramUser.first_name || null,
    last_name: telegramUser.last_name || null,
    language_code: telegramUser.language_code || null,
    is_active: true,
    linked_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString()
  };

  const { data: link, error: linkError } = await service
    .from("telegram_user_links")
    .upsert(payload, { onConflict: "user_id" })
    .select()
    .single();

  if (linkError) throw linkError;


  await service.from("audit_logs").insert({
    organization_id: profile.organization_id,
    branch_id: profile.branch_id,
    user_id: profile.id,
    action: "link_telegram_mini_app",
    entity_type: "telegram_user_link",
    entity_id: link.id,
    new_data: {
      telegram_user_id: telegramUser.id,
      username: telegramUser.username || null
    }
  });

  await sendTelegramMessage({
    chatId: telegramUser.id,
    text: [
      "✅ <b>Tiny POS connected</b>",
      "",
      `User: ${profile.full_name}`,
      `Role: ${profile.role}`,
      `Branch: ${profile.branches?.name || "Assigned branch"}`,
      "",
      "Relevant Telegram alerts will follow your personal notification settings."
    ].join("\n"),
    path: "/dashboard"
  });

  return link;
}

async function setupBot(profile) {
  if (!["owner", "admin"].includes(profile.role)) {
    throw Object.assign(
      new Error("Owner or admin access is required."),
      { status: 403 }
    );
  }

  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!webhookSecret || !/^[A-Za-z0-9_-]{16,256}$/.test(webhookSecret)) {
    throw new Error(
      "TELEGRAM_WEBHOOK_SECRET must contain 16-256 letters, numbers, underscores or hyphens."
    );
  }

  const webhookUrl = miniAppUrl("/.netlify/functions/telegram-webhook");
  const appUrl = miniAppUrl("/");

  const webhook = await telegramApi("setWebhook", {
    url: webhookUrl,
    secret_token: webhookSecret,
    allowed_updates: ["message"],
    drop_pending_updates: false
  });

  const menu = await telegramApi("setChatMenuButton", {
    menu_button: {
      type: "web_app",
      text: "Open Tiny POS",
      web_app: { url: appUrl }
    }
  });

  const commands = await telegramApi("setMyCommands", {
    commands: [
      { command: "start", description: "Open Tiny POS" },
      { command: "pos", description: "Open the Mini App" },
      { command: "status", description: "Show linked POS account" },
      { command: "link", description: "Link with a one-time code" },
      { command: "unlink", description: "Disconnect Telegram" },
      { command: "help", description: "Show bot help" }
    ]
  });

  return {
    webhook,
    menu,
    commands,
    webhook_url: webhookUrl,
    mini_app_url: appUrl
  };
}

export default async (request) => {
  try {
    if (!["GET", "POST"].includes(request.method)) {
      return json({ ok: false, error: "Method not allowed." }, 405);
    }

    botToken();
    const context = await authenticatedProfile(request);

    if (request.method === "GET") {
      const status = await botStatus(
        context.service,
        context.profile.id
      );
      return json({ ok: true, ...status });
    }

    const body = await request.json().catch(() => ({}));
    const action = body.action || "status";

    if (action === "status") {
      const status = await botStatus(
        context.service,
        context.profile.id
      );
      return json({ ok: true, ...status });
    }

    if (action === "link-mini-app") {
      const link = await linkMiniApp(context, body.init_data);
      return json({ ok: true, link });
    }

    if (action === "setup") {
      const result = await setupBot(context.profile);
      return json({ ok: true, ...result });
    }

    if (action === "test") {
      const { data: link, error } = await context.service
        .from("telegram_user_links")
        .select("*")
        .eq("user_id", context.profile.id)
        .eq("is_active", true)
        .maybeSingle();

      if (error) throw error;
      if (!link) {
        throw Object.assign(
          new Error("Connect Telegram before sending a test message."),
          { status: 409 }
        );
      }

      const sent = await sendTelegramMessage({
        chatId: link.chat_id,
        text: [
          "🧪 <b>Tiny POS test message</b>",
          "",
          `Hello ${context.profile.full_name}.`,
          "Your Telegram connection is working."
        ].join("\n"),
        path: "/telegram",
        buttonText: "Notification settings"
      });

      return json({ ok: true, message_id: sent.message_id });
    }

    return json({ ok: false, error: "Unknown action." }, 400);
  } catch (error) {
    return errorResponse(error);
  }
};
