import { Bot } from "grammy";
import type { Update } from "grammy/types";

type Env = {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  BOT_INTERNAL_SECRET: string;
  FRONTEND_URL: string;
  API: Fetcher;
};
function equal(a: string, b: string) {
  if (!a || a.length !== b.length) return false;
  let v = 0;
  for (let i = 0; i < a.length; i++) v |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return v === 0;
}
async function api<T>(env: Env, path: string, body: unknown): Promise<T> {
  const r = await env.API.fetch(`https://api.internal/api/v1/bot/${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-bot-secret": env.BOT_INTERNAL_SECRET,
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw Error("Bot API failed");
  return r.json() as Promise<T>;
}
type MessageResult = { message: string; registrationToken?: string };
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (
      !env.TELEGRAM_BOT_TOKEN ||
      !env.TELEGRAM_WEBHOOK_SECRET ||
      !env.BOT_INTERNAL_SECRET
    )
      return new Response("Not configured", { status: 503 });
    const url = new URL(request.url);
    const bot = new Bot(env.TELEGRAM_BOT_TOKEN);
    if (url.pathname === "/notify" || url.pathname === "/registered") {
      if (
        request.method !== "POST" ||
        !equal(
          request.headers.get("x-bot-secret") || "",
          env.BOT_INTERNAL_SECRET,
        )
      )
        return new Response("Forbidden", { status: 403 });
      const payload = (await request.json()) as Record<string, unknown>;
      if (
        typeof payload.telegramUserId !== "string" ||
        !/^\d+$/.test(payload.telegramUserId)
      )
        return new Response("Invalid", { status: 400 });
      if (url.pathname === "/registered") {
        if (typeof payload.code !== "string" || !/^\d{6}$/.test(payload.code))
          return new Response("Invalid", { status: 400 });
        await bot.api.sendMessage(
          Number(payload.telegramUserId),
          `Yuristim hisobingiz yaratildi. Maxsus identifikatsiya raqamingiz: ${payload.code}\nVeb-sayt va Mini Appda kirish uchun shu raqamni kiriting va kirishni shu botda tasdiqlang.`,
        );
      } else {
        if (
          typeof payload.challenge !== "string" ||
          !/^[0-9a-f-]{36}$/.test(payload.challenge)
        )
          return new Response("Invalid", { status: 400 });
        await bot.api.sendMessage(
          Number(payload.telegramUserId),
          "Yuristim hisobingizga kirish so‘rovi. Agar siz yubormagan bo‘lsangiz, rad eting.",
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "Tasdiqlash",
                    callback_data: `approve:${payload.challenge}`,
                  },
                  {
                    text: "Rad etish",
                    callback_data: `deny:${payload.challenge}`,
                  },
                ],
              ],
            },
          },
        );
      }
      return new Response("OK");
    }
    if (url.pathname !== "/webhook" || request.method !== "POST")
      return new Response("Not found", { status: 404 });
    if (
      !equal(
        request.headers.get("x-telegram-bot-api-secret-token") || "",
        env.TELEGRAM_WEBHOOK_SECRET,
      )
    )
      return new Response("Forbidden", { status: 403 });
    let update: Update;
    try {
      update = (await request.json()) as Update;
    } catch {
      return new Response("Invalid", { status: 400 });
    }
    if (!Number.isSafeInteger(update.update_id))
      return new Response("Invalid", { status: 400 });
    const claim = await api<{ claimed: boolean }>(env, "update-claim", {
      updateId: update.update_id,
    });
    if (!claim.claimed) return new Response("OK");
    bot.use(async (ctx, next) => {
      if (ctx.chat && ctx.chat.type !== "private") return;
      await next();
    });
    bot.command("start", async (ctx) => {
      const user = ctx.from?.id;
      if (!user) return;
      const param = ctx.match?.toString() || "";
      if (param === "code") {
        const r = await api<MessageResult>(env, "code", {
          telegramUserId: user,
        });
        await ctx.reply(r.message);
        return;
      }
      if (param.startsWith("link_")) {
        const r = await api<{ ok?: boolean; code?: string; error?: string }>(
          env,
          "link",
          { token: param.slice(5), telegramUserId: user },
        ).catch((): { ok?: boolean; code?: string; error?: string } => ({
          error: "Havola eskirgan yoki hisob allaqachon bog‘langan",
        }));
        if (r.ok)
          await ctx.reply(
            `Telegram hisobi bog‘landi. Maxsus identifikatsiya raqamingiz: ${r.code}\nMaxsus kirishda bot tasdig‘i ham talab qilinadi.`,
          );
        else
          await ctx.reply(
            "Ulash havolasi eskirgan yoki hisob allaqachon bog‘langan. Saytdan yangi havola oling.",
          );
        return;
      }
      const r = await api<MessageResult>(env, "start", {
        telegramUserId: user,
      });
      await ctx.reply(r.message);
    });
    bot.command("code", async (ctx) => {
      if (!ctx.from) return;
      const r = await api<MessageResult>(env, "code", {
        telegramUserId: ctx.from.id,
      });
      await ctx.reply(r.message);
    });
    bot.on("callback_query:data", async (ctx) => {
      const match = /^(approve|deny):([0-9a-f-]{36})$/.exec(
        ctx.callbackQuery.data,
      );
      if (!match || !ctx.from) return;
      const r = await api<{ ok?: boolean }>(env, "challenge", {
        challenge: match[2],
        telegramUserId: ctx.from.id,
        approve: match[1] === "approve",
      }).catch(() => ({ ok: false }));
      await ctx.answerCallbackQuery({
        text: r.ok
          ? "So‘rov ko‘rib chiqildi"
          : "So‘rov eskirgan yoki qayta ishlangan",
      });
      if (r.ok)
        await ctx.editMessageText(
          match[1] === "approve" ? "Kirish tasdiqlandi." : "Kirish rad etildi.",
        );
    });
    bot.on("message:text", async (ctx) => {
      if (!ctx.from) return;
      const r = await api<MessageResult>(env, "message", {
        telegramUserId: ctx.from.id,
        text: ctx.message.text,
      });
      await ctx.reply(r.message);
      if (r.registrationToken) {
        const link = `${env.FRONTEND_URL.replace(/\/$/, "")}/?bot_token=${encodeURIComponent(r.registrationToken)}`;
        await ctx.reply(`Parol yaratish sahifasi: ${link}`);
      }
    });
    try {
      await bot.handleUpdate(update);
      return new Response("OK");
    } catch {
      await api(env, "update-release", { updateId: update.update_id }).catch(
        () => {},
      );
      return new Response("Temporary failure", { status: 503 });
    }
  },
};
