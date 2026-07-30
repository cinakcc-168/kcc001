import {
  escapeHtml,
  hashLinkCode,
  json,
  sendTelegramMessage,
  serviceClient
} from "./_telegram-shared.mjs";
import {
  tg,
  telegramLanguage
} from "./_telegram-i18n.mjs";

function commandParts(text) {
  const trimmed = String(text || "").trim();
  const [first = "", ...rest] = trimmed.split(/\s+/);
  const command = first.split("@")[0].toLowerCase();
  return {
    command,
    argument: rest.join(" ").trim()
  };
}

async function userLanguage(
  service,
  userId,
  fallback = "en"
) {
  if (!userId) return telegramLanguage(fallback);

  const { data } = await service
    .from("user_preferences")
    .select("language")
    .eq("user_id", userId)
    .maybeSingle();

  return telegramLanguage(
    data?.language || fallback
  );
}

async function linkedProfile(
  service,
  telegramUserId,
  fallbackLanguage = "en"
) {
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
  if (!data) return null;

  return {
    ...data,
    language: await userLanguage(
      service,
      data.user_id,
      data.language_code || fallbackLanguage
    )
  };
}

async function claimCode(
  service,
  code,
  message,
  fallbackLanguage
) {
  const language = telegramLanguage(
    fallbackLanguage
  );

  const normalized = String(code || "")
    .trim()
    .replace(/^link_/i, "")
    .toUpperCase();

  if (!/^[A-F0-9]{8}$/.test(normalized)) {
    throw new Error(
      tg(language, "invalid_code_format")
    );
  }

  const { data: linkCode, error: codeError } =
    await service
      .from("telegram_link_codes")
      .select("*")
      .eq(
        "code_hash",
        hashLinkCode(normalized)
      )
      .is("used_at", null)
      .gt(
        "expires_at",
        new Date().toISOString()
      )
      .maybeSingle();

  if (codeError) throw codeError;

  if (!linkCode) {
    throw new Error(
      tg(language, "invalid_code")
    );
  }

  const { data: profile, error: profileError } =
    await service
      .from("profiles")
      .select("*,branches(id,name,code)")
      .eq("id", linkCode.user_id)
      .eq("is_active", true)
      .single();

  if (profileError || !profile) {
    throw new Error(
      tg(language, "inactive_user")
    );
  }

  const preferredLanguage = await userLanguage(
    service,
    profile.id,
    fallbackLanguage
  );

  const { data: collision, error: collisionError } =
    await service
      .from("telegram_user_links")
      .select("id,user_id")
      .eq(
        "organization_id",
        profile.organization_id
      )
      .eq(
        "telegram_user_id",
        message.from.id
      )
      .neq("user_id", profile.id)
      .maybeSingle();

  if (collisionError) throw collisionError;

  if (collision) {
    throw new Error(
      preferredLanguage === "km"
        ? "គណនី Telegram នេះបានភ្ជាប់ជាមួយអ្នកប្រើ POS ផ្សេងរួចហើយ។"
        : "This Telegram account is already connected to another POS user."
    );
  }

  const { data: link, error: linkError } =
    await service
      .from("telegram_user_links")
      .upsert({
        organization_id:
          profile.organization_id,
        user_id: profile.id,
        telegram_user_id: message.from.id,
        chat_id: message.chat.id,
        username:
          message.from.username || null,
        first_name:
          message.from.first_name || null,
        last_name:
          message.from.last_name || null,
        language_code:
          message.from.language_code || null,
        is_active: true,
        linked_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString()
      }, {
        onConflict: "user_id"
      })
      .select()
      .single();

  if (linkError) throw linkError;

  await service
    .from("telegram_link_codes")
    .update({
      used_at: new Date().toISOString()
    })
    .eq("id", linkCode.id);

  await service
    .from("audit_logs")
    .insert({
      organization_id:
        profile.organization_id,
      branch_id: profile.branch_id,
      user_id: profile.id,
      action: "link_telegram_code",
      entity_type: "telegram_user_link",
      entity_id: link.id,
      new_data: {
        telegram_user_id: message.from.id,
        username:
          message.from.username || null
      }
    });

  return {
    profile,
    link,
    language: preferredLanguage
  };
}

function linkedAccountText(
  language,
  titleKey,
  profile,
  includeHelp = false
) {
  return [
    `✅ <b>${tg(language, titleKey)}</b>`,
    "",
    tg(language, "user", {
      value: escapeHtml(profile.full_name)
    }),
    tg(language, "role", {
      value: escapeHtml(profile.role)
    }),
    tg(language, "branch", {
      value: escapeHtml(
        profile.branches?.name
        || tg(language, "assigned_branch")
      )
    }),
    includeHelp ? "" : null,
    includeHelp
      ? tg(language, "alert_settings_help")
      : null
  ]
    .filter((value) => value !== null)
    .join("\n");
}

async function welcome(
  chatId,
  linked,
  fallbackLanguage
) {
  const language = telegramLanguage(
    linked?.language || fallbackLanguage
  );

  if (linked) {
    const profile = linked.profiles;

    await sendTelegramMessage({
      chatId,
      text: [
        language === "km"
          ? "👋 <b>សូមស្វាគមន៍មកកាន់ Tiny POS</b>"
          : "👋 <b>Welcome to Tiny POS</b>",
        "",
        language === "km"
          ? `អ្នកប្រើដែលបានភ្ជាប់៖ ${escapeHtml(profile.full_name)}`
          : `Connected user: ${escapeHtml(profile.full_name)}`,
        tg(language, "role", {
          value: escapeHtml(profile.role)
        }),
        tg(language, "branch", {
          value: escapeHtml(
            profile.branches?.name
            || tg(language, "assigned_branch")
          )
        }),
        "",
        language === "km"
          ? "ប្រើប៊ូតុងខាងក្រោម ដើម្បីបើក POS Mini App។"
          : "Use the button below to open the POS Mini App."
      ].join("\n"),
      path: "/dashboard",
      buttonText: tg(language, "open_pos")
    });

    return;
  }

  await sendTelegramMessage({
    chatId,
    text: language === "km"
      ? [
          "👋 <b>សូមស្វាគមន៍មកកាន់ Tiny POS</b>",
          "",
          "បើក Mini App ហើយចូលដោយគណនី POS របស់អ្នក។",
          "បន្ទាប់មកបើកការកំណត់ Telegram ក្នុង Tiny POS ហើយភ្ជាប់គណនី Telegram នេះ។",
          "",
          "អ្នកក៏អាចបង្កើតកូដប្រើម្ដងក្នុង Tiny POS ហើយផ្ញើ៖",
          "<code>/link YOUR_CODE</code>"
        ].join("\n")
      : [
          "👋 <b>Welcome to Tiny POS</b>",
          "",
          "Open the Mini App and sign in with your POS account.",
          "Then open Telegram Settings inside Tiny POS and connect this Telegram account.",
          "",
          "You may also create a one-time code in Tiny POS and send:",
          "<code>/link YOUR_CODE</code>"
        ].join("\n"),
    path: "/login",
    buttonText: tg(language, "open_pos")
  });
}

export default async (request) => {
  if (request.method !== "POST") {
    return json({
      ok: false,
      error: "Method not allowed."
    }, 405);
  }

  const expectedSecret =
    process.env.TELEGRAM_WEBHOOK_SECRET || "";

  const receivedSecret = request.headers.get(
    "x-telegram-bot-api-secret-token"
  ) || "";

  if (
    !expectedSecret
    || receivedSecret !== expectedSecret
  ) {
    return json({
      ok: false,
      error: "Invalid webhook secret."
    }, 401);
  }

  try {
    const update = await request.json();
    const message = update.message;

    if (
      !message?.from?.id
      || !message?.chat?.id
    ) {
      return json({ ok: true, ignored: true });
    }

    if (message.chat.type !== "private") {
      return json({ ok: true, ignored: true });
    }

    const fallbackLanguage = telegramLanguage(
      message.from.language_code
    );

    const service = serviceClient();
    const text = String(message.text || "");
    const { command, argument } =
      commandParts(text);

    let linked = await linkedProfile(
      service,
      message.from.id,
      fallbackLanguage
    );

    if (linked) {
      await service
        .from("telegram_user_links")
        .update({
          chat_id: message.chat.id,
          username:
            message.from.username || null,
          first_name:
            message.from.first_name || null,
          last_name:
            message.from.last_name || null,
          language_code:
            message.from.language_code || null,
          last_seen_at:
            new Date().toISOString()
        })
        .eq("id", linked.id);
    }

    const language = telegramLanguage(
      linked?.language || fallbackLanguage
    );

    if (command === "/start") {
      const payload = argument.replace(
        /^link_/i,
        ""
      );

      if (payload) {
        try {
          const result = await claimCode(
            service,
            payload,
            message,
            language
          );

          linked = await linkedProfile(
            service,
            message.from.id,
            result.language
          );

          await sendTelegramMessage({
            chatId: message.chat.id,
            text: linkedAccountText(
              result.language,
              "connected_title",
              result.profile,
              true
            ),
            path: "/telegram",
            buttonText: tg(
              result.language,
              "notification_settings"
            )
          });
        } catch (error) {
          await sendTelegramMessage({
            chatId: message.chat.id,
            text: `❌ ${escapeHtml(error.message)}`,
            path: "/telegram",
            buttonText: tg(
              language,
              "create_link_code"
            )
          });
        }

        return json({ ok: true });
      }

      await welcome(
        message.chat.id,
        linked,
        language
      );

      return json({ ok: true });
    }

    if (command === "/link") {
      try {
        const result = await claimCode(
          service,
          argument,
          message,
          language
        );

        await sendTelegramMessage({
          chatId: message.chat.id,
          text: linkedAccountText(
            result.language,
            "connected_pos_title",
            result.profile
          ),
          path: "/telegram",
          buttonText: tg(
            result.language,
            "notification_settings"
          )
        });
      } catch (error) {
        await sendTelegramMessage({
          chatId: message.chat.id,
          text: `❌ ${escapeHtml(error.message)}`,
          path: "/telegram",
          buttonText: tg(
            language,
            "open_pos"
          )
        });
      }

      return json({ ok: true });
    }

    if (command === "/unlink") {
      if (!linked) {
        await sendTelegramMessage({
          chatId: message.chat.id,
          text: tg(
            language,
            "not_connected"
          ),
          path: "/login",
          buttonText: tg(
            language,
            "open_pos"
          )
        });

        return json({ ok: true });
      }

      await service
        .from("telegram_user_links")
        .update({ is_active: false })
        .eq("id", linked.id);

      await sendTelegramMessage({
        chatId: message.chat.id,
        text: `✅ ${tg(
          language,
          "disconnected"
        )}`,
        path: "/login",
        buttonText: tg(
          language,
          "open_pos"
        )
      });

      return json({ ok: true });
    }

    if (command === "/status") {
      if (!linked) {
        await sendTelegramMessage({
          chatId: message.chat.id,
          text: tg(language, "connect_help"),
          path: "/login",
          buttonText: tg(
            language,
            "open_pos"
          )
        });

        return json({ ok: true });
      }

      await sendTelegramMessage({
        chatId: message.chat.id,
        text: linkedAccountText(
          language,
          "connected_account",
          linked.profiles
        ),
        path: "/telegram",
        buttonText: tg(
          language,
          "notification_settings"
        )
      });

      return json({ ok: true });
    }


    if (["/checkin", "/checkout", "/attendance", "/commission"].includes(command)) {
      if (!linked) {
        await sendTelegramMessage({
          chatId: message.chat.id,
          text: tg(language, "connect_help"),
          path: "/login",
          buttonText: tg(language, "open_pos")
        });
        return json({ ok: true });
      }

      try {
        if (command === "/checkin" || command === "/checkout") {
          const action = command === "/checkin" ? "check_in" : "check_out";
          const { data, error } = await service.rpc(
            "telegram_attendance_action",
            { p_user_id: linked.user_id, p_action: action }
          );
          if (error) throw error;
          const sessionRow = data?.session || {};
          const duration = Math.max(0, Number(sessionRow.total_minutes || 0));
          const durationText = `${Math.floor(duration / 60)}h ${Math.round(duration % 60)}m`;
          const formatted = new Intl.DateTimeFormat(
            language === "km" ? "km-KH" : "en-US",
            { dateStyle: "medium", timeStyle: "short" }
          ).format(new Date(action === "check_in" ? sessionRow.check_in_at : sessionRow.check_out_at));
          await sendTelegramMessage({
            chatId: message.chat.id,
            text: `✅ ${tg(language, action === "check_in" ? "attendance_checked_in" : "attendance_checked_out", action === "check_in" ? { time: formatted } : { duration: durationText })}`,
            path: "/staff-operations",
            buttonText: tg(language, "open_staff_operations")
          });
          return json({ ok: true });
        }

        if (command === "/attendance") {
          const { data, error } = await service.rpc(
            "telegram_attendance_status",
            { p_user_id: linked.user_id }
          );
          if (error) throw error;
          let textValue = tg(language, "attendance_not_checked_in");
          if (data?.checked_in) {
            const formatted = new Intl.DateTimeFormat(
              language === "km" ? "km-KH" : "en-US",
              { dateStyle: "medium", timeStyle: "short" }
            ).format(new Date(data.session.check_in_at));
            const minutes = Math.max(0, Number(data.elapsed_minutes || 0));
            textValue = tg(language, "attendance_current", {
              time: formatted,
              duration: `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60)}m`
            });
          }
          await sendTelegramMessage({
            chatId: message.chat.id,
            text: `🕒 <b>${escapeHtml(textValue)}</b>`,
            path: "/staff-operations",
            buttonText: tg(language, "open_staff_operations")
          });
          return json({ ok: true });
        }

        const { data, error } = await service.rpc(
          "telegram_my_commission_summary",
          { p_user_id: linked.user_id }
        );
        if (error) throw error;
        const money = (value, currency) => new Intl.NumberFormat("en-US", {
          style: "currency", currency,
          maximumFractionDigits: currency === "KHR" ? 0 : 2
        }).format(Number(value || 0));
        await sendTelegramMessage({
          chatId: message.chat.id,
          text: [
            `💰 <b>${tg(language, "commission_title")}</b>`,
            "",
            tg(language, "commission_earned_usd", { amount: money(data.earned_usd, "USD") }),
            tg(language, "commission_earned_khr", { amount: money(data.earned_khr, "KHR") }),
            tg(language, "commission_outstanding_usd", { amount: money(data.outstanding_usd, "USD") }),
            tg(language, "commission_outstanding_khr", { amount: money(data.outstanding_khr, "KHR") })
          ].join("\n"),
          path: "/staff-operations",
          buttonText: tg(language, "open_staff_operations")
        });
      } catch (error) {
        await sendTelegramMessage({
          chatId: message.chat.id,
          text: `❌ ${escapeHtml(error.message)}`,
          path: "/staff-operations",
          buttonText: tg(language, "open_staff_operations")
        });
      }
      return json({ ok: true });
    }


    if (command === "/payslip" || command === "/payroll") {
      if (!linked) {
        await sendTelegramMessage({ chatId: message.chat.id, text: tg(language, "connect_help"), path: "/login", buttonText: tg(language, "open_pos") });
        return json({ ok: true });
      }
      try {
        const { data, error } = await service.rpc("telegram_my_payroll_summary", { p_user_id: linked.user_id });
        if (error) throw error;
        const row = data?.latest;
        if (!row || row === "null") {
          await sendTelegramMessage({ chatId: message.chat.id, text: tg(language, "payroll_none"), path: "/payroll", buttonText: tg(language, "open_payroll") });
          return json({ ok: true });
        }
        const money = (value, currency) => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: currency === "KHR" ? 0 : 2 }).format(Number(value || 0));
        await sendTelegramMessage({
          chatId: message.chat.id,
          text: [
            `💵 <b>${tg(language, "payroll_title")}</b>`,
            "",
            `<b>${escapeHtml(row.run_number)}</b>`,
            tg(language, "payroll_period", { from: row.period_start, to: row.period_end }),
            tg(language, "payroll_net", { amount: money(row.net_pay, row.currency) }),
            tg(language, "payroll_paid", { amount: money(row.paid_amount, row.currency) }),
            tg(language, "payroll_outstanding", { amount: money(row.outstanding, row.currency) }),
            tg(language, "payroll_status", { status: row.status })
          ].join("\n"),
          path: "/payroll",
          buttonText: tg(language, "open_payroll")
        });
      } catch (error) {
        await sendTelegramMessage({ chatId: message.chat.id, text: `❌ ${escapeHtml(error.message)}`, path: "/payroll", buttonText: tg(language, "open_payroll") });
      }
      return json({ ok: true });
    }

    if (
      ["/pos", "/menu", "/help"]
        .includes(command)
    ) {
      await welcome(
        message.chat.id,
        linked,
        language
      );

      return json({ ok: true });
    }

    await sendTelegramMessage({
      chatId: message.chat.id,
      text: linked
        ? tg(language, "linked_help")
        : tg(language, "unlinked_help"),
      path: linked ? "/dashboard" : "/login",
      buttonText: tg(language, "open_pos")
    });

    return json({ ok: true });
  } catch (error) {
    console.error(
      "Telegram webhook error",
      error
    );

    return json({
      ok: true,
      handled_error: error.message
    });
  }
};
