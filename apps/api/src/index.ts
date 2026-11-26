import { Hono, type Context } from "hono";
import { z } from "zod";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import {
  registerSchema,
  loginSchema,
  profileSchema,
  settingsSchema,
  specialStartSchema,
  telegramInitSchema,
  usernameSchema,
  displayNameSchema,
  languageSchema,
  type Account,
} from "../../../packages/shared/src/index";
import {
  keyedHash,
  passwordHash,
  randomToken,
  timingEqual,
  verifyPassword,
  verifyTelegramInitData,
} from "./crypto";

type Env = {
  DB: D1Database;
  SESSION_PEPPER: string;
  BOT_INTERNAL_SECRET: string;
  TELEGRAM_BOT_TOKEN: string;
  BOT_URL: string;
  ALLOWED_ORIGIN: string;
};
type Vars = { userId: string; sessionId: string };
type ApiContext = Context<{ Bindings: Env; Variables: Vars }>;
const app = new Hono<{ Bindings: Env; Variables: Vars }>();
const now = () => Math.floor(Date.now() / 1000);
const cookieOpts = {
  httpOnly: true,
  secure: true,
  sameSite: "Strict" as const,
  path: "/",
};
const parse = async <T>(
  req: Request,
  schema: {
    safeParse: (x: unknown) => { success: true; data: T } | { success: false };
  },
): Promise<T | null> => {
  try {
    if (Number(req.headers.get("content-length") || 0) > 8192) return null;
    const text = await req.text();
    if (text.length > 8192) return null;
    const result = schema.safeParse(JSON.parse(text));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
};
async function audit(
  db: D1Database,
  type: string,
  userId: string | null = null,
) {
  await db
    .prepare("INSERT INTO security_events(id,user_id,event_type) VALUES(?,?,?)")
    .bind(crypto.randomUUID(), userId, type)
    .run();
}
async function rate(db: D1Database, key: string, limit: number, window = 60) {
  const end = now() + window;
  await db
    .prepare(
      "INSERT INTO rate_limits(key,count,resets_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN resets_at<? THEN 1 ELSE count+1 END,resets_at=CASE WHEN resets_at<? THEN ? ELSE resets_at END",
    )
    .bind(key, end, now(), now(), end)
    .run();
  const row = await db
    .prepare("SELECT count FROM rate_limits WHERE key=?")
    .bind(key)
    .first<{ count: number }>();
  return (row?.count || 0) <= limit;
}
async function account(env: Env, id: string): Promise<Account | null> {
  const row = await env.DB.prepare(
    "SELECT u.id,u.username,p.display_name,s.language,o.tutorial_done,t.telegram_user_id FROM users u JOIN user_profiles p ON p.user_id=u.id JOIN user_settings s ON s.user_id=u.id JOIN onboarding_states o ON o.user_id=u.id LEFT JOIN telegram_identities t ON t.user_id=u.id WHERE u.id=?",
  )
    .bind(id)
    .first<{
      id: string;
      username: string;
      display_name: string;
      language: "uz" | "ru" | "en";
      tutorial_done: number;
      telegram_user_id: string | null;
    }>();
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    language: row.language,
    telegramLinked: !!row.telegram_user_id,
    tutorialDone: !!row.tutorial_done,
  };
}
async function session(c: ApiContext, id: string) {
  const token = randomToken();
  const csrf = randomToken(16);
  const sid = crypto.randomUUID();
  await c.env.DB.prepare(
    "INSERT INTO sessions(id,user_id,token_hash,csrf_hash,created_at,expires_at) VALUES(?,?,?,?,?,?)",
  )
    .bind(
      sid,
      id,
      await keyedHash(token, c.env.SESSION_PEPPER),
      await keyedHash(csrf, c.env.SESSION_PEPPER),
      now(),
      now() + 60 * 60 * 24 * 14,
    )
    .run();
  setCookie(c, "__Host-yuristim", token, {
    ...cookieOpts,
    maxAge: 60 * 60 * 24 * 14,
  });
  setCookie(c, "__Host-yuristim-csrf", csrf, {
    ...cookieOpts,
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 14,
  });
  return csrf;
}
async function getSession(c: ApiContext) {
  const token = getCookie(c, "__Host-yuristim");
  if (!token) return null;
  return c.env.DB.prepare(
    "SELECT id,user_id,csrf_hash FROM sessions WHERE token_hash=? AND revoked_at IS NULL AND expires_at>?",
  )
    .bind(await keyedHash(token, c.env.SESSION_PEPPER), now())
    .first<{ id: string; user_id: string; csrf_hash: string }>();
}
function ip(c: ApiContext) {
  return c.req.header("cf-connecting-ip") || "unknown";
}
async function botAuth(c: ApiContext) {
  const supplied = c.req.header("x-bot-secret") || "";
  return !!supplied && timingEqual(supplied, c.env.BOT_INTERNAL_SECRET);
}
app.use("*", async (c, next) => {
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "no-referrer");
  c.header(
    "Content-Security-Policy",
    "default-src 'none'; frame-ancestors 'none'",
  );
  c.header("Cache-Control", "no-store");
  if (
    !["GET", "HEAD", "OPTIONS"].includes(c.req.method) &&
    !c.req.path.startsWith("/api/v1/bot/")
  ) {
    const origin = c.req.header("origin");
    if (
      origin !== c.env.ALLOWED_ORIGIN &&
      !(
        new URL(c.req.url).hostname === "localhost" &&
        origin === "http://localhost:5173"
      )
    )
      return c.json({ error: "Origin rad etildi" }, 403);
  }
  await next();
});
app.get("/health", (c) => c.json({ status: "ok" }));
app.post("/api/v1/auth/register", async (c) => {
  const data = await parse(c.req.raw, registerSchema);
  if (!data) return c.json({ error: "Ma’lumotlarni tekshiring" }, 400);
  if (!(await rate(c.env.DB, `register:${ip(c)}`, 5, 3600)))
    return c.json({ error: "Keyinroq urinib ko‘ring" }, 429);
  const existing = await c.env.DB.prepare(
    "SELECT id FROM users WHERE username=?",
  )
    .bind(data.username)
    .first();
  if (existing) return c.json({ error: "Username band" }, 409);
  const botState = data.botToken
    ? await c.env.DB.prepare(
        "SELECT telegram_user_id,username,display_name,language FROM bot_registration_tokens WHERE token_hash=? AND used_at IS NULL AND expires_at>?",
      )
        .bind(await keyedHash(data.botToken, c.env.SESSION_PEPPER), now())
        .first<{
          telegram_user_id: string;
          username: string;
          display_name: string;
          language: string;
        }>()
    : null;
  if (
    data.botToken &&
    (!botState ||
      botState.username !== data.username ||
      botState.display_name !== data.displayName ||
      botState.language !== data.language)
  )
    return c.json({ error: "Bot havolasi eskirgan" }, 400);
  const code = botState
    ? String(
        crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000,
      ).padStart(6, "0")
    : null;
  const id = crypto.randomUUID(),
    pw = await passwordHash(data.password);
  try {
    await c.env.DB.batch([
      c.env.DB.prepare("INSERT INTO users(id,username) VALUES(?,?)").bind(
        id,
        data.username,
      ),
      c.env.DB.prepare(
        "INSERT INTO user_profiles(user_id,display_name) VALUES(?,?)",
      ).bind(id, data.displayName),
      c.env.DB.prepare(
        "INSERT INTO user_credentials(user_id,password_salt,password_hash,iterations) VALUES(?,?,?,?)",
      ).bind(id, pw.salt, pw.hash, pw.iterations),
      c.env.DB.prepare(
        "INSERT INTO user_settings(user_id,language) VALUES(?,?)",
      ).bind(id, data.language),
      c.env.DB.prepare("INSERT INTO onboarding_states(user_id) VALUES(?)").bind(
        id,
      ),
      ...(botState && code
        ? [
            c.env.DB.prepare(
              "INSERT INTO telegram_identities(telegram_user_id,user_id) VALUES(?,?)",
            ).bind(botState.telegram_user_id, id),
            c.env.DB.prepare(
              "INSERT INTO special_login_identifiers(user_id,code_hash) VALUES(?,?)",
            ).bind(id, await keyedHash(code, c.env.SESSION_PEPPER)),
            c.env.DB.prepare(
              "UPDATE bot_registration_tokens SET used_at=? WHERE token_hash=? AND used_at IS NULL",
            ).bind(
              now(),
              await keyedHash(data.botToken!, c.env.SESSION_PEPPER),
            ),
            c.env.DB.prepare(
              "DELETE FROM bot_states WHERE telegram_user_id=?",
            ).bind(botState.telegram_user_id),
          ]
        : []),
    ]);
  } catch {
    return c.json({ error: "Username band" }, 409);
  }
  if (botState && code) {
    try {
      await fetch(`${c.env.BOT_URL}/registered`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-bot-secret": c.env.BOT_INTERNAL_SECRET,
        },
        body: JSON.stringify({
          telegramUserId: botState.telegram_user_id,
          code,
        }),
      });
    } catch {}
  }
  const csrf = await session(c, id);
  await audit(c.env.DB, "register", id);
  return c.json({ account: await account(c.env, id), csrf }, 201);
});
app.post("/api/v1/auth/login", async (c) => {
  const data = await parse(c.req.raw, loginSchema);
  if (!data) return c.json({ error: "Ma’lumotlarni tekshiring" }, 400);
  if (!(await rate(c.env.DB, `login:${ip(c)}`, 10, 900)))
    return c.json({ error: "Keyinroq urinib ko‘ring" }, 429);
  const row = await c.env.DB.prepare(
    "SELECT u.id,cr.password_salt,cr.password_hash,cr.iterations FROM users u JOIN user_credentials cr ON cr.user_id=u.id WHERE u.username=?",
  )
    .bind(data.username)
    .first<{
      id: string;
      password_salt: string;
      password_hash: string;
      iterations: number;
    }>();
  const valid = row
    ? await verifyPassword(
        data.password,
        row.password_salt,
        row.iterations,
        row.password_hash,
      )
    : await verifyPassword(
        data.password,
        "00000000000000000000000000000000",
        600_000,
        "0".repeat(64),
      );
  if (!row || !valid) {
    await audit(c.env.DB, "login_failed");
    return c.json({ error: "Username yoki parol noto‘g‘ri" }, 401);
  }
  const csrf = await session(c, row.id);
  await audit(c.env.DB, "login", row.id);
  return c.json({ account: await account(c.env, row.id), csrf });
});
app.use("/api/v1/users/*", async (c, next) => {
  const s = await getSession(c);
  if (!s) return c.json({ error: "Kirish talab qilinadi" }, 401);
  c.set("userId", s.user_id);
  c.set("sessionId", s.id);
  if (!["GET", "HEAD"].includes(c.req.method)) {
    const token = c.req.header("x-csrf-token") || "";
    if (
      !token ||
      !timingEqual(await keyedHash(token, c.env.SESSION_PEPPER), s.csrf_hash)
    )
      return c.json({ error: "CSRF tekshiruvi muvaffaqiyatsiz" }, 403);
  }
  await next();
});
app.get("/api/v1/users/me", async (c) =>
  c.json({ account: await account(c.env, c.get("userId")) }),
);
app.patch("/api/v1/users/me/profile", async (c) => {
  const data = await parse(c.req.raw, profileSchema);
  if (!data) return c.json({ error: "Ma’lumotlarni tekshiring" }, 400);
  await c.env.DB.prepare(
    "UPDATE user_profiles SET display_name=? WHERE user_id=?",
  )
    .bind(data.displayName, c.get("userId"))
    .run();
  return c.json({ account: await account(c.env, c.get("userId")) });
});
app.patch("/api/v1/users/me/settings", async (c) => {
  const data = await parse(c.req.raw, settingsSchema);
  if (!data) return c.json({ error: "Ma’lumotlarni tekshiring" }, 400);
  await c.env.DB.prepare("UPDATE user_settings SET language=? WHERE user_id=?")
    .bind(data.language, c.get("userId"))
    .run();
  return c.json({ account: await account(c.env, c.get("userId")) });
});
app.post("/api/v1/users/me/tutorial", async (c) => {
  await c.env.DB.prepare(
    "UPDATE onboarding_states SET tutorial_done=1 WHERE user_id=?",
  )
    .bind(c.get("userId"))
    .run();
  return c.json({ ok: true });
});
app.post("/api/v1/users/me/telegram-link", async (c) => {
  const token = randomToken(18);
  await c.env.DB.prepare(
    "INSERT INTO telegram_link_tokens(token_hash,user_id,session_id,expires_at) VALUES(?,?,?,?)",
  )
    .bind(
      await keyedHash(token, c.env.SESSION_PEPPER),
      c.get("userId"),
      c.get("sessionId"),
      now() + 600,
    )
    .run();
  return c.json({ token, expiresIn: 600 });
});
app.get("/api/v1/users/me/special", async (c) => {
  const row = await c.env.DB.prepare(
    "SELECT code_hash FROM special_login_identifiers WHERE user_id=?",
  )
    .bind(c.get("userId"))
    .first();
  return c.json({
    telegramLinked: (await account(c.env, c.get("userId")))?.telegramLinked,
    hasIdentifier: !!row,
  });
});
app.post("/api/v1/users/me/telegram-unlink", async (c) => {
  const data = await parse(c.req.raw, loginSchema.pick({ password: true }));
  if (!data) return c.json({ error: "Parolni kiriting" }, 400);
  const row = await c.env.DB.prepare(
    "SELECT password_salt,password_hash,iterations FROM user_credentials WHERE user_id=?",
  )
    .bind(c.get("userId"))
    .first<{
      password_salt: string;
      password_hash: string;
      iterations: number;
    }>();
  if (
    !row ||
    !(await verifyPassword(
      data.password,
      row.password_salt,
      row.iterations,
      row.password_hash,
    ))
  )
    return c.json({ error: "Parol noto‘g‘ri" }, 403);
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM telegram_identities WHERE user_id=?").bind(
      c.get("userId"),
    ),
    c.env.DB.prepare(
      "DELETE FROM special_login_identifiers WHERE user_id=?",
    ).bind(c.get("userId")),
    c.env.DB.prepare(
      "UPDATE login_challenges SET status='denied' WHERE user_id=? AND status IN ('pending','approved')",
    ).bind(c.get("userId")),
  ]);
  await audit(c.env.DB, "telegram_unlinked", c.get("userId"));
  return c.json({ account: await account(c.env, c.get("userId")) });
});
app.post("/api/v1/auth/logout", async (c) => {
  const s = await getSession(c);
  if (s) {
    const token = c.req.header("x-csrf-token") || "";
    if (
      !token ||
      !timingEqual(await keyedHash(token, c.env.SESSION_PEPPER), s.csrf_hash)
    )
      return c.json({ error: "CSRF tekshiruvi muvaffaqiyatsiz" }, 403);
    await c.env.DB.prepare("UPDATE sessions SET revoked_at=? WHERE id=?")
      .bind(now(), s.id)
      .run();
    await audit(c.env.DB, "logout", s.user_id);
  }
  deleteCookie(c, "__Host-yuristim", { path: "/", secure: true });
  deleteCookie(c, "__Host-yuristim-csrf", { path: "/", secure: true });
  return c.json({ ok: true });
});
app.post("/api/v1/auth/special/start", async (c) => {
  const data = await parse(c.req.raw, specialStartSchema);
  if (!data) return c.json({ error: "6 xonali raqam kiriting" }, 400);
  if (!(await rate(c.env.DB, `special:${ip(c)}`, 5, 900)))
    return c.json({ error: "Keyinroq urinib ko‘ring" }, 429);
  const nonce = randomToken(),
    challenge = crypto.randomUUID();
  setCookie(c, "__Host-yuristim-challenge", nonce, {
    ...cookieOpts,
    maxAge: 300,
  });
  const row = await c.env.DB.prepare(
    "SELECT i.user_id,t.telegram_user_id FROM special_login_identifiers i JOIN telegram_identities t ON t.user_id=i.user_id WHERE i.code_hash=?",
  )
    .bind(await keyedHash(data.code, c.env.SESSION_PEPPER))
    .first<{ user_id: string; telegram_user_id: string }>();
  if (row) {
    try {
      await c.env.DB.batch([
        c.env.DB.prepare(
          "UPDATE login_challenges SET status='denied' WHERE user_id=? AND status='pending'",
        ).bind(row.user_id),
        c.env.DB.prepare(
          "INSERT INTO login_challenges(id,user_id,browser_nonce_hash,status,expires_at,created_at) VALUES(?,?,?,?,?,?)",
        ).bind(
          challenge,
          row.user_id,
          await keyedHash(nonce, c.env.SESSION_PEPPER),
          "pending",
          now() + 300,
          now(),
        ),
      ]);
    } catch {
      return c.json({ challenge, expiresIn: 300 });
    }
    try {
      const notify = await fetch(`${c.env.BOT_URL}/notify`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-bot-secret": c.env.BOT_INTERNAL_SECRET,
        },
        body: JSON.stringify({
          challenge,
          telegramUserId: row.telegram_user_id,
        }),
      });
      if (!notify.ok) throw Error("Bot unavailable");
    } catch {
      await c.env.DB.prepare(
        "UPDATE login_challenges SET status='denied' WHERE id=?",
      )
        .bind(challenge)
        .run();
    }
  }
  return c.json({ challenge, expiresIn: 300 });
});
app.get("/api/v1/auth/special/status/:id", async (c) => {
  const nonce = getCookie(c, "__Host-yuristim-challenge");
  if (!nonce) return c.json({ status: "pending" });
  const row = await c.env.DB.prepare(
    "SELECT user_id,status,expires_at FROM login_challenges WHERE id=? AND browser_nonce_hash=?",
  )
    .bind(c.req.param("id"), await keyedHash(nonce, c.env.SESSION_PEPPER))
    .first<{ user_id: string; status: string; expires_at: number }>();
  if (!row) return c.json({ status: "pending" });
  if (row.expires_at <= now()) {
    await c.env.DB.prepare(
      "UPDATE login_challenges SET status='expired' WHERE id=? AND status IN ('pending','denied')",
    )
      .bind(c.req.param("id"))
      .run();
    return c.json({ status: "expired" });
  }
  if (row.status === "approved") {
    const changed = await c.env.DB.prepare(
      "UPDATE login_challenges SET status='used' WHERE id=? AND status='approved'",
    )
      .bind(c.req.param("id"))
      .run();
    if (changed.meta.changes === 1) {
      const csrf = await session(c, row.user_id);
      deleteCookie(c, "__Host-yuristim-challenge", { path: "/", secure: true });
      await audit(c.env.DB, "special_login", row.user_id);
      return c.json({
        status: "approved",
        account: await account(c.env, row.user_id),
        csrf,
      });
    }
  }
  return c.json({ status: "pending" });
});
app.post("/api/v1/auth/telegram/verify", async (c) => {
  const data = await parse(c.req.raw, telegramInitSchema);
  if (!data) return c.json({ error: "initData talab qilinadi" }, 400);
  const telegramId = await verifyTelegramInitData(
    data.initData,
    c.env.TELEGRAM_BOT_TOKEN,
  );
  if (telegramId === null)
    return c.json({ error: "Telegram ma’lumotlari noto‘g‘ri" }, 401);
  const row = await c.env.DB.prepare(
    "SELECT user_id FROM telegram_identities WHERE telegram_user_id=?",
  )
    .bind(String(telegramId))
    .first<{ user_id: string }>();
  if (!row) return c.json({ error: "Hisob bog‘lanmagan" }, 404);
  const csrf = await session(c, row.user_id);
  return c.json({ account: await account(c.env, row.user_id), csrf });
});
app.use("/api/v1/bot/*", async (c, next) => {
  if (!(await botAuth(c))) return c.json({ error: "Forbidden" }, 403);
  await next();
});
app.post("/api/v1/auth/bot-onboarding", async (c) => {
  const data = await parse(
    c.req.raw,
    z.object({ token: z.string().min(16).max(128) }),
  );
  if (!data) return c.json({ error: "Invalid" }, 400);
  const row = await c.env.DB.prepare(
    "SELECT username,display_name,language FROM bot_registration_tokens WHERE token_hash=? AND used_at IS NULL AND expires_at>?",
  )
    .bind(await keyedHash(data.token, c.env.SESSION_PEPPER), now())
    .first<{ username: string; display_name: string; language: string }>();
  if (!row) return c.json({ error: "Havola eskirgan" }, 404);
  return c.json({
    username: row.username,
    displayName: row.display_name,
    language: row.language,
  });
});
app.post("/api/v1/bot/update-claim", async (c) => {
  const raw = await parse(
    c.req.raw,
    z.object({ updateId: z.number().int().safe() }),
  );
  if (!raw) return c.json({ error: "Invalid" }, 400);
  try {
    await c.env.DB.prepare(
      "INSERT INTO bot_updates(update_id,processed_at) VALUES(?,?)",
    )
      .bind(raw.updateId, now())
      .run();
    return c.json({ claimed: true });
  } catch {
    return c.json({ claimed: false });
  }
});
app.post("/api/v1/bot/update-release", async (c) => {
  const raw = await parse(
    c.req.raw,
    z.object({ updateId: z.number().int().safe() }),
  );
  if (!raw) return c.json({ error: "Invalid" }, 400);
  await c.env.DB.prepare("DELETE FROM bot_updates WHERE update_id=?")
    .bind(raw.updateId)
    .run();
  return c.json({ ok: true });
});
app.post("/api/v1/bot/start", async (c) => {
  const raw = await parse(
    c.req.raw,
    z.object({ telegramUserId: z.number().int().safe() }),
  );
  if (!raw) return c.json({ error: "Invalid" }, 400);
  const telegramUserId = String(raw.telegramUserId);
  if (!(await rate(c.env.DB, `bot-start:${telegramUserId}`, 10, 3600)))
    return c.json({ message: "Keyinroq urinib ko‘ring." }, 429);
  const linked = await c.env.DB.prepare(
    "SELECT user_id FROM telegram_identities WHERE telegram_user_id=?",
  )
    .bind(telegramUserId)
    .first();
  if (linked)
    return c.json({
      message:
        "Yuristim hisobingiz allaqachon ulangan. Maxsus kirish raqamingizni yangilash uchun /code yuboring.",
    });
  await c.env.DB.prepare(
    "INSERT INTO bot_states(telegram_user_id,step,updated_at) VALUES(?,'username',?) ON CONFLICT(telegram_user_id) DO UPDATE SET step='username',username=NULL,display_name=NULL,language=NULL,updated_at=excluded.updated_at",
  )
    .bind(telegramUserId, now())
    .run();
  return c.json({
    message:
      "Yuristimga xush kelibsiz! Avval Yuristim username kiriting (4–24 belgi, lotin harfidan boshlanadi). Parolni Telegram chatiga yubormang.",
  });
});
app.post("/api/v1/bot/message", async (c) => {
  const raw = await parse(
    c.req.raw,
    z.object({
      telegramUserId: z.number().int().safe(),
      text: z.string().max(256),
    }),
  );
  if (!raw) return c.json({ error: "Invalid" }, 400);
  const tid = String(raw.telegramUserId);
  if (!(await rate(c.env.DB, `bot-message:${tid}`, 30, 3600)))
    return c.json({ message: "Keyinroq urinib ko‘ring." }, 429);
  const state = await c.env.DB.prepare(
    "SELECT step,username,display_name FROM bot_states WHERE telegram_user_id=?",
  )
    .bind(tid)
    .first<{
      step: string;
      username: string | null;
      display_name: string | null;
    }>();
  if (!state) return c.json({ message: "Boshlash uchun /start yuboring." });
  const value = raw.text.trim();
  if (state.step === "username") {
    const result = usernameSchema.safeParse(value);
    if (!result.success)
      return c.json({
        message:
          "Username mos emas. 4–24 belgi, lotin harfidan boshlansin; raqam va _ mumkin.",
      });
    const exists = await c.env.DB.prepare(
      "SELECT id FROM users WHERE username=?",
    )
      .bind(result.data)
      .first();
    if (exists)
      return c.json({ message: "Bu username band. Boshqasini tanlang." });
    await c.env.DB.prepare(
      "UPDATE bot_states SET username=?,step='display_name',updated_at=? WHERE telegram_user_id=?",
    )
      .bind(result.data, now(), tid)
      .run();
    return c.json({
      message: "Sizni nima deb chaqiraylik? Murojaat nomini kiriting.",
    });
  }
  if (state.step === "display_name") {
    const result = displayNameSchema.safeParse(value);
    if (!result.success)
      return c.json({ message: "Murojaat nomi 2–64 belgi bo‘lsin." });
    await c.env.DB.prepare(
      "UPDATE bot_states SET display_name=?,step='language',updated_at=? WHERE telegram_user_id=?",
    )
      .bind(result.data, now(), tid)
      .run();
    return c.json({ message: "Tilni tanlang: uz, ru yoki en." });
  }
  if (state.step === "language") {
    const result = languageSchema.safeParse(value.toLowerCase());
    if (!result.success)
      return c.json({ message: "uz, ru yoki en deb yuboring." });
    await c.env.DB.prepare(
      "UPDATE bot_states SET language=?,step='finish',updated_at=? WHERE telegram_user_id=?",
    )
      .bind(result.data, now(), tid)
      .run();
  }
  const full = await c.env.DB.prepare(
    "SELECT username,display_name,language FROM bot_states WHERE telegram_user_id=?",
  )
    .bind(tid)
    .first<{ username: string; display_name: string; language: string }>();
  if (!full) return c.json({ message: "Boshlash uchun /start yuboring." });
  const token = randomToken(24);
  await c.env.DB.prepare(
    "INSERT INTO bot_registration_tokens(token_hash,telegram_user_id,username,display_name,language,expires_at) VALUES(?,?,?,?,?,?)",
  )
    .bind(
      await keyedHash(token, c.env.SESSION_PEPPER),
      tid,
      full.username,
      full.display_name,
      full.language,
      now() + 900,
    )
    .run();
  return c.json({
    message:
      "Parolni xavfsiz veb sahifada yarating. Telegram chatiga parol yubormang. Havola 15 daqiqa amal qiladi.",
    registrationToken: token,
  });
});
app.post("/api/v1/bot/code", async (c) => {
  const raw = await parse(
    c.req.raw,
    z.object({ telegramUserId: z.number().int().safe() }),
  );
  if (!raw) return c.json({ error: "Invalid" }, 400);
  if (!(await rate(c.env.DB, `bot-code:${raw.telegramUserId}`, 10, 3600)))
    return c.json({ message: "Keyinroq urinib ko‘ring." }, 429);
  const row = await c.env.DB.prepare(
    "SELECT user_id FROM telegram_identities WHERE telegram_user_id=?",
  )
    .bind(String(raw.telegramUserId))
    .first<{ user_id: string }>();
  if (!row) return c.json({ message: "Avval /start orqali hisob yarating." });
  for (let i = 0; i < 10; i++) {
    const code = String(
      crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000,
    ).padStart(6, "0");
    try {
      await c.env.DB.prepare(
        "INSERT INTO special_login_identifiers(user_id,code_hash) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET code_hash=excluded.code_hash,created_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')",
      )
        .bind(row.user_id, await keyedHash(code, c.env.SESSION_PEPPER))
        .run();
      return c.json({
        message: `Yangi maxsus identifikatsiya raqamingiz: ${code}\nBu raqamning o‘zi hisobga kirishga yetarli emas; bot tasdiqlashi ham kerak.`,
      });
    } catch {}
  }
  return c.json(
    { message: "Raqam yaratib bo‘lmadi. Keyinroq urinib ko‘ring." },
    503,
  );
});
app.post("/api/v1/bot/link", async (c) => {
  const raw = await parse(
    c.req.raw,
    z.object({ token: z.string(), telegramUserId: z.number().int().safe() }),
  );
  if (!raw) return c.json({ error: "Invalid" }, 400);
  const hash = await keyedHash(raw.token, c.env.SESSION_PEPPER);
  const row = await c.env.DB.prepare(
    "SELECT l.user_id,l.session_id FROM telegram_link_tokens l JOIN sessions s ON s.id=l.session_id AND s.user_id=l.user_id WHERE l.token_hash=? AND l.used_at IS NULL AND l.expires_at>? AND s.revoked_at IS NULL AND s.expires_at>?",
  )
    .bind(hash, now(), now())
    .first<{ user_id: string; session_id: string }>();
  if (!row) return c.json({ error: "Expired" }, 404);
  const existing = await c.env.DB.prepare(
    "SELECT user_id FROM telegram_identities WHERE telegram_user_id=? OR user_id=?",
  )
    .bind(String(raw.telegramUserId), row.user_id)
    .first();
  if (existing) return c.json({ error: "Already linked" }, 409);
  const code = String(
    crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000,
  ).padStart(6, "0");
  try {
    await c.env.DB.batch([
      c.env.DB.prepare(
        "INSERT INTO telegram_identities(telegram_user_id,user_id) VALUES(?,?)",
      ).bind(String(raw.telegramUserId), row.user_id),
      c.env.DB.prepare(
        "INSERT INTO special_login_identifiers(user_id,code_hash) VALUES(?,?)",
      ).bind(row.user_id, await keyedHash(code, c.env.SESSION_PEPPER)),
      c.env.DB.prepare(
        "UPDATE telegram_link_tokens SET used_at=? WHERE token_hash=? AND used_at IS NULL",
      ).bind(now(), hash),
    ]);
  } catch {
    return c.json({ error: "Link failed" }, 409);
  }
  await audit(c.env.DB, "telegram_linked", row.user_id);
  return c.json({ ok: true, code });
});
app.post("/api/v1/bot/challenge", async (c) => {
  const raw = await parse(
    c.req.raw,
    z.object({
      challenge: z.string().uuid(),
      telegramUserId: z.number().int().safe(),
      approve: z.boolean(),
    }),
  );
  if (!raw) return c.json({ error: "Invalid" }, 400);
  const row = await c.env.DB.prepare(
    "SELECT l.user_id FROM login_challenges l JOIN telegram_identities t ON t.user_id=l.user_id WHERE l.id=? AND t.telegram_user_id=? AND l.status=? AND l.expires_at>?",
  )
    .bind(raw.challenge, String(raw.telegramUserId), "pending", now())
    .first<{ user_id: string }>();
  if (!row) return c.json({ error: "Expired" }, 404);
  const updated = await c.env.DB.prepare(
    "UPDATE login_challenges SET status=? WHERE id=? AND status=? AND expires_at>? AND EXISTS(SELECT 1 FROM telegram_identities t WHERE t.user_id=login_challenges.user_id AND t.telegram_user_id=?)",
  )
    .bind(
      raw.approve ? "approved" : "denied",
      raw.challenge,
      "pending",
      now(),
      String(raw.telegramUserId),
    )
    .run();
  if (updated.meta.changes !== 1)
    return c.json({ error: "Already handled" }, 409);
  await audit(
    c.env.DB,
    raw.approve ? "special_approved" : "special_denied",
    row.user_id,
  );
  return c.json({ ok: true });
});
app.get("/api/v1/conversations", async (c) => {
  const s = await getSession(c);
  if (!s) return c.json({ error: "Kirish talab qilinadi" }, 401);
  const rows = await c.env.DB.prepare(
    "SELECT id,title,created_at FROM conversations WHERE user_id=? ORDER BY created_at DESC LIMIT 50",
  )
    .bind(s.user_id)
    .all();
  return c.json({ conversations: rows.results });
});
export default app;
