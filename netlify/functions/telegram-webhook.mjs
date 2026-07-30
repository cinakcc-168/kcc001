import {
  appKeyboard,
  escapeHtml,
  hashLinkCode,
  json,
  miniAppUrl,
  sendTelegramMessage,
  serviceClient
} from "./_telegram-shared.mjs";

function commandParts(text) {
  const trimmed = String(text || "").trim();
  const [first = "", ...rest] = trimmed.split(/\s+/);
  const command = first.split("@")[0].toLowerCase();
  return { command, argument: rest.join(" ").trim() };
}

async function linkedProfile(service, telegramUserId) {
  const { data, error } = await service
    .from("telegram_user_links")
    .select(`
      *,
      profiles!inner(
        id,
        full_name,
        role,
        is_active,
        branch_id,
        branches(id,name,code)
      )
    `)
    .eq("telegram_user_id", telegramUserId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function claimCode(service, code, message) {
  const normalized = String(code || "")
    .trim()
    .replace(/^link_/i, "")
    .toUpperCase();

  if (!/^[A-F0-9]{8}$/.test(normalized)) {
    throw new Error("The link code must contain 8 letters or numbers.");
  }

  const { data: linkCode, error: codeError } = await service
    .from("telegram_link_codes")
    .select("*")
    .eq("code_hash", hashLinkCode(normalized))
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (codeError) throw codeError;
  if (!linkCode) {
    throw new Error("This link code is invalid or expired.");
  }

  const { data: profile, error: profileError } = await service
    .from("profiles")
    .select("*,branches(id,name,code)")
    .eq("id", linkCode.user_id)
    .eq("is_active", true)
    .single();

  if (profileError || !profile) {
    throw new Error("The POS user is inactive or missing.");
  }

  const { data: collision, error: collisionError } = await service
    .from("telegram_user_links")
    .select("id,user_id")
    .eq("organization_id", profile.organization_id)
    .eq("telegram_user_id", message.from.id)
    .neq("user_id", profile.id)
    .maybeSingle();

  if (collisionError) throw collisionError;
  if (collision) {
    throw new Error(
      "This Telegram account is already connected to another POS user."
    );
  }

  const { data: link, error: linkError } = await service
    .from("telegram_user_links")
    .upsert({
      organization_id: profile.organization_id,
      user_id: profile.id,
      telegram_user_id: message.from.id,
      chat_id: message.chat.id,
      username: message.from.username || null,
      first_name: message.from.first_name || null,
      last_name: message.from.last_name || null,
      language_code: message.from.language_code || null,
      is_active: true,
      linked_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString()
    }, { onConflict: "user_id" })
    .select()
    .single();

  if (linkError) throw linkError;

  await service
    .from("telegram_link_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("id", linkCode.id);

  await service.from("audit_logs").insert({
    organization_id: profile.organization_id,
    branch_id: profile.branch_id,
    user_id: profile.id,
    action: "link_telegram_code",
    entity_type: "telegram_user_link",
    entity_id: link.id,
    new_data: {
      telegram_user_id: message.from.id,
      username: message.from.username || null
    }
  });

  return { profile, link };
}

async function welcome(chatId, linked) {
  if (linked) {
    const profile = linked.profiles;
    await sendTelegramMessage({
      chatId,
      text: [
        "👋 <b>Welcome to Tiny POS</b>",
        "",
        `Connected user: ${escapeHtml(profile.full_name)}`,
        `Role: ${escapeHtml(profile.role)}`,
        `Branch: ${escapeHtml(profile.branches?.name || "Assigned branch")}`,
        "",
        "Use the button below to open the POS Mini App."
      ].join("\n"),
      path: "/dashboard"
    });
    return;
  }

  await sendTelegramMessage({
    chatId,
    text: [
      "👋 <b>Welcome to Tiny POS</b>",
      "",
      "Open the Mini App and sign in with your POS account.",
      "Then open Telegram Settings inside Tiny POS and connect this Telegram account.",
      "",
      "You may also create a one-time code in Tiny POS and send:",
      "<code>/link YOUR_CODE</code>"
    ].join("\n"),
    path: "/login"
  });
}

export default async (request) => {
  if (request.method !== "POST") {
    return json({ ok: false, error: "Method not allowed." }, 405);
  }

  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET || "";
  const receivedSecret = request.headers.get(
    "x-telegram-bot-api-secret-token"
  ) || "";

  if (!expectedSecret || receivedSecret !== expectedSecret) {
    return json({ ok: false, error: "Invalid webhook secret." }, 401);
  }

  try {
    const update = await request.json();
    const message = update.message;

    if (!message?.from?.id || !message?.chat?.id) {
      return json({ ok: true, ignored: true });
    }

    if (message.chat.type !== "private") {
      return json({ ok: true, ignored: true });
    }

    const service = serviceClient();
    const text = String(message.text || "");
    const { command, argument } = commandParts(text);
    let linked = await linkedProfile(service, message.from.id);

    if (linked) {
      await service
        .from("telegram_user_links")
        .update({
          chat_id: message.chat.id,
          username: message.from.username || null,
          first_name: message.from.first_name || null,
          last_name: message.from.last_name || null,
          language_code: message.from.language_code || null,
          last_seen_at: new Date().toISOString()
        })
        .eq("id", linked.id);
    }

    if (command === "/start") {
      const payload = argument.replace(/^link_/i, "");

      if (payload) {
        try {
          const result = await claimCode(service, payload, message);
          linked = await linkedProfile(service, message.from.id);

          await sendTelegramMessage({
            chatId: message.chat.id,
            text: [
              "✅ <b>Telegram connected</b>",
              "",
              `User: ${escapeHtml(result.profile.full_name)}`,
              `Role: ${escapeHtml(result.profile.role)}`,
              `Branch: ${escapeHtml(result.profile.branches?.name || "Assigned branch")}`,
              "",
              "You will receive only the alert categories enabled in your POS Telegram settings."
            ].join("\n"),
            path: "/telegram",
            buttonText: "Notification settings"
          });
          return json({ ok: true });
        } catch (error) {
          await sendTelegramMessage({
            chatId: message.chat.id,
            text: `❌ ${escapeHtml(error.message)}`,
            path: "/telegram",
            buttonText: "Create a new link code"
          });
          return json({ ok: true });
        }
      }

      await welcome(message.chat.id, linked);
      return json({ ok: true });
    }

    if (command === "/link") {
      try {
        const result = await claimCode(service, argument, message);
        await sendTelegramMessage({
          chatId: message.chat.id,
          text: [
            "✅ <b>Tiny POS connected</b>",
            "",
            `User: ${escapeHtml(result.profile.full_name)}`,
            `Branch: ${escapeHtml(result.profile.branches?.name || "Assigned branch")}`
          ].join("\n"),
          path: "/telegram",
          buttonText: "Notification settings"
        });
      } catch (error) {
        await sendTelegramMessage({
          chatId: message.chat.id,
          text: `❌ ${escapeHtml(error.message)}`,
          path: "/telegram"
        });
      }
      return json({ ok: true });
    }

    if (command === "/unlink") {
      if (!linked) {
        await sendTelegramMessage({
          chatId: message.chat.id,
          text: "This Telegram account is not connected to Tiny POS.",
          path: "/login"
        });
        return json({ ok: true });
      }

      await service
        .from("telegram_user_links")
        .update({ is_active: false })
        .eq("id", linked.id);

      await sendTelegramMessage({
        chatId: message.chat.id,
        text: "✅ Telegram notifications disconnected from your POS account.",
        path: "/login"
      });
      return json({ ok: true });
    }

    if (command === "/status") {
      if (!linked) {
        await sendTelegramMessage({
          chatId: message.chat.id,
          text: "Not connected. Open Tiny POS and connect Telegram from Settings.",
          path: "/login"
        });
        return json({ ok: true });
      }

      const profile = linked.profiles;
      await sendTelegramMessage({
        chatId: message.chat.id,
        text: [
          "✅ <b>Connected POS account</b>",
          "",
          `User: ${escapeHtml(profile.full_name)}`,
          `Role: ${escapeHtml(profile.role)}`,
          `Branch: ${escapeHtml(profile.branches?.name || "Assigned branch")}`
        ].join("\n"),
        path: "/telegram",
        buttonText: "Notification settings"
      });
      return json({ ok: true });
    }

    if (["/pos", "/menu", "/help"].includes(command)) {
      await welcome(message.chat.id, linked);
      return json({ ok: true });
    }

    await telegramApiFallback(message.chat.id, linked);
    return json({ ok: true });
  } catch (error) {
    console.error("Telegram webhook error", error);
    return json({ ok: true, handled_error: error.message });
  }
};

async function telegramApiFallback(chatId, linked) {
  const text = linked
    ? "Use the button below to open Tiny POS, or send /status to check your connection."
    : "Open Tiny POS and connect your Telegram account, or send /link YOUR_CODE.";

  await sendTelegramMessage({
    chatId,
    text,
    path: linked ? "/dashboard" : "/login"
  });
}
