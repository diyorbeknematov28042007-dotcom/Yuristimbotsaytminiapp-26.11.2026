import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { retrieveRawInitData, init as initTelegram } from "@telegram-apps/sdk";
import {
  ArrowLeft,
  ArrowRight,
  AtSign,
  BookOpen,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  Eye,
  EyeOff,
  FileText,
  GraduationCap,
  HelpCircle,
  KeyRound,
  LockKeyhole,
  LogOut,
  Menu,
  Paperclip,
  Search,
  Send,
  Settings,
  ShieldCheck,
  UserRound,
  UserRoundSearch,
  X,
} from "lucide-react";
import type { Account } from "../../../packages/shared/src/index";
import "./style.css";

type Screen =
  | "welcome"
  | "choose"
  | "password"
  | "special"
  | "pending"
  | "register"
  | "profileSetup"
  | "chat"
  | "profile"
  | "accountSettings"
  | "specialManage";
type ApiResult = {
  account?: Account;
  csrf?: string;
  error?: string;
  challenge?: string;
  status?: string;
  token?: string;
  username?: string;
  displayName?: string;
  language?: "uz" | "ru" | "en";
};
const BOT = import.meta.env.VITE_TELEGRAM_BOT_USERNAME || "";
const sticker = (name: string, klass = "") => (
  <picture className={klass}>
    <source srcSet={`/stickers/${name}.webp`} type="image/webp" />
    <img src={`/stickers/${name}.png`} alt="" />
  </picture>
);
const csrfCookie = () =>
  document.cookie
    .split("; ")
    .find((x) => x.startsWith("__Host-yuristim-csrf="))
    ?.split("=")[1] || "";
async function api(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<ApiResult> {
  const res = await fetch(`/api/v1${path}`, {
    method,
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...(csrfCookie() ? { "x-csrf-token": csrfCookie() } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json()) as ApiResult;
  if (!res.ok) throw Error(data.error || "So‘rov bajarilmadi");
  return data;
}
function useMiniApp() {
  const [data, setData] = useState<string | null>(null);
  useEffect(() => {
    try {
      initTelegram();
      setData(retrieveRawInitData() || null);
    } catch {
      /* regular browser */
    }
  }, []);
  return data;
}
function App() {
  const miniAppData = useMiniApp();
  const reduced = useReducedMotion();
  const [screen, setScreen] = useState<Screen>("welcome");
  const [account, setAccount] = useState<Account | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [displayName, setDisplayName] = useState(""),
    [language, setLanguage] = useState<"uz" | "ru" | "en">("uz"),
    [botToken, setBotToken] = useState("");
  const [code, setCode] = useState(""),
    [challenge, setChallenge] = useState(""),
    [mode, setMode] = useState<"Chat" | "Work">("Chat");
  const [menuOpen, setMenuOpen] = useState(false),
    [tutorial, setTutorial] = useState(false),
    [showBanner, setShowBanner] = useState(true),
    [linkUrl, setLinkUrl] = useState(""),
    [helpOpen, setHelpOpen] = useState(false);
  const [unlinkPassword, setUnlinkPassword] = useState(""),
    [chatText, setChatText] = useState(""),
    [chatNotice, setChatNotice] = useState(false);
  const navigate = (next: Screen) => {
    setError("");
    setScreen(next);
  };
  useEffect(() => {
    const token = new URLSearchParams(location.search).get("bot_token");
    if (token) {
      history.replaceState({}, "", location.pathname);
      api("/auth/bot-onboarding", "POST", { token })
        .then((r) => {
          if (r.username && r.displayName && r.language) {
            setBotToken(token);
            setUsername(r.username);
            setDisplayName(r.displayName);
            setLanguage(r.language);
            setScreen("register");
          }
        })
        .catch(() =>
          setError("Bot havolasi eskirgan. Botdan yangi havola oling."),
        );
    }
    api("/users/me")
      .then((r) => {
        if (r.account) {
          setAccount(r.account);
          setScreen("chat");
          setTutorial(!r.account.tutorialDone);
        }
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!miniAppData) return;
    api("/auth/telegram/verify", "POST", { initData: miniAppData })
      .then((r) => {
        if (r.account) {
          setAccount(r.account);
          setScreen("chat");
          setTutorial(!r.account.tutorialDone);
        }
      })
      .catch(() => {});
  }, [miniAppData]);
  useEffect(() => {
    if (!linkUrl || !account || account.telegramLinked) return;
    const timer = setInterval(() => {
      api("/users/me")
        .then((r) => {
          if (r.account?.telegramLinked) {
            setAccount(r.account);
            setLinkUrl("");
          }
        })
        .catch(() => {});
    }, 3000);
    return () => clearInterval(timer);
  }, [linkUrl, account]);
  useEffect(() => {
    if (screen !== "pending" || !challenge) return;
    const timer = setInterval(() => {
      api(`/auth/special/status/${encodeURIComponent(challenge)}`)
        .then((r) => {
          if (r.status === "approved" && r.account) {
            setAccount(r.account);
            setScreen("chat");
            setTutorial(!r.account.tutorialDone);
          } else if (r.status === "expired") {
            setError("So‘rov muddati tugadi");
            setScreen("special");
          }
        })
        .catch(() => {});
    }, 1800);
    const timeout = setTimeout(() => {
      setError("So‘rov muddati tugadi");
      setScreen("special");
    }, 300000);
    return () => {
      clearInterval(timer);
      clearTimeout(timeout);
    };
  }, [screen, challenge]);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xatolik yuz berdi");
    } finally {
      setBusy(false);
    }
  }
  const register = () =>
    run(async () => {
      const r = await api("/auth/register", "POST", {
        username,
        password,
        displayName,
        language,
        ...(botToken ? { botToken } : {}),
      });
      if (r.account) {
        setAccount(r.account);
        setScreen("chat");
        setTutorial(true);
      }
    });
  const login = () =>
    run(async () => {
      const r = await api("/auth/login", "POST", { username, password });
      if (r.account) {
        setAccount(r.account);
        setScreen("chat");
        setTutorial(!r.account.tutorialDone);
      }
    });
  const startSpecial = () =>
    run(async () => {
      const r = await api("/auth/special/start", "POST", { code });
      if (r.challenge) {
        setChallenge(r.challenge);
        setScreen("pending");
      }
    });
  const logout = () =>
    run(async () => {
      await api("/auth/logout", "POST");
      setAccount(null);
      setMenuOpen(false);
      navigate("welcome");
    });
  const linkTelegram = () =>
    run(async () => {
      const r = await api("/users/me/telegram-link", "POST");
      if (r.token && BOT) {
        const url = `https://t.me/${BOT}?start=link_${r.token}`;
        setLinkUrl(url);
      } else setError("Telegram bot manzili hali sozlanmagan");
    });
  const finishTutorial = () =>
    run(async () => {
      await api("/users/me/tutorial", "POST");
      setTutorial(false);
      setAccount((a) => (a ? { ...a, tutorialDone: true } : a));
    });
  const updateLanguage = async (v: "uz" | "ru" | "en") => {
    setLanguage(v);
    if (account) {
      await run(async () => {
        const r = await api("/users/me/settings", "PATCH", { language: v });
        if (r.account) setAccount(r.account);
      });
    }
  };
  const back = () =>
    navigate(
      screen === "profileSetup"
        ? "register"
        : screen === "special" || screen === "password"
          ? "choose"
          : screen === "specialManage" || screen === "accountSettings"
            ? "profile"
            : "welcome",
    );
  return (
    <div className="app-shell">
      <div className="app-card">
        <AnimatePresence mode="wait">
          <motion.main
            key={screen}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: reduced ? 0 : 0.25 }}
            className={`screen screen-${screen}`}
          >
            {screen === "welcome" && (
              <>
                <div className="welcome-center">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.94 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: reduced ? 0 : 0.45 }}
                  >
                    {sticker("yuristim-logo", "hero-logo")}
                  </motion.div>
                  <h1>Yuristim</h1>
                </div>
                <div className="bottom-actions">
                  <button
                    className="primary"
                    onClick={() => navigate("choose")}
                  >
                    Hisobimga kirish
                  </button>
                  <button
                    className="secondary"
                    onClick={() => navigate("register")}
                  >
                    Yangi hisob ochish
                  </button>
                </div>
              </>
            )}
            {screen === "choose" && (
              <>
                <button className="back" onClick={back}>
                  <ArrowLeft size={20} />
                </button>
                <div className="choose-top">
                  {sticker("yuristim-logo", "small-logo")}
                  <h1>Yuristim</h1>
                  <p>Sizning ishonchli yuridik yordamchingiz</p>
                </div>
                <section className="choice-panel">
                  <div className="choice-tabs">
                    <button className="selected">Kirish</button>
                    <button onClick={() => navigate("register")}>
                      Ro‘yxatdan o‘tish
                    </button>
                  </div>
                  <h2>Kirish usulini tanlang</h2>
                  <button
                    className="choice-row"
                    onClick={() => navigate("special")}
                  >
                    <span className="choice-icon">#</span>
                    <span>
                      <strong>Maxsus identifikatsiya raqami</strong>
                      <small>Telegram botidan olingan 6 xonali raqam</small>
                    </span>
                    <ChevronRight size={18} />
                  </button>
                  <button
                    className="choice-row"
                    onClick={() => navigate("password")}
                  >
                    <UserRound size={20} />
                    <span>
                      <strong>@Username va parol</strong>
                      <small>Login va parol orqali kirish</small>
                    </span>
                    <ChevronRight size={18} />
                  </button>
                  <button
                    className="primary"
                    onClick={() => navigate("special")}
                  >
                    Davom etish <ArrowRight size={18} />
                  </button>
                </section>
              </>
            )}
            {screen === "register" && (
              <>
                <header className="screen-head">
                  <button className="back" onClick={back}>
                    <ArrowLeft size={20} />
                  </button>
                  {sticker("yuristim-logo", "head-logo")}
                  <span />
                </header>
                <div className="stepper">
                  <span className="active">
                    ✓<small>Hisob</small>
                  </span>
                  <i />
                  <span>
                    2<small>Profil</small>
                  </span>
                  <i />
                  <span>
                    3<small>Tayyor</small>
                  </span>
                </div>
                <div className="form-hero">
                  {sticker("yuristim-logo", "form-logo")}
                  <h1>Yangi hisob ochish</h1>
                  <p>Yuristimdan to‘liq foydalanish uchun hisob yarating.</p>
                </div>
                <div className="fields">
                  <label>
                    <AtSign size={18} />
                    <input
                      autoComplete="username"
                      placeholder="Yuristim username"
                      value={username}
                      readOnly={!!botToken}
                      onChange={(e) =>
                        setUsername(e.target.value.toLowerCase())
                      }
                    />
                  </label>
                  <small>
                    Faqat lotin harflari, raqam va pastki chiziq. 4–24 belgi.
                  </small>
                  <label>
                    <LockKeyhole size={18} />
                    <input
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder="Parol"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      className="icon-button"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </label>
                  <small>Kamida 12 ta belgidan iborat bo‘lsin.</small>
                </div>
                <div className="form-bottom">
                  {error && <p className="error">{error}</p>}
                  <button
                    className="primary"
                    onClick={() => {
                      if (
                        !/^[a-z][a-z0-9_]{3,23}$/.test(username) ||
                        password.length < 12
                      ) {
                        setError("Username yoki parol talabga mos emas");
                        return;
                      }
                      navigate("profileSetup");
                    }}
                  >
                    Davom etish <ArrowRight size={18} />
                  </button>
                </div>
              </>
            )}
            {screen === "profileSetup" && (
              <>
                <header className="screen-head">
                  <button className="back" onClick={back}>
                    <ArrowLeft size={20} />
                  </button>
                  <span className="wordmark">
                    {sticker("yuristim-logo", "tiny-logo")} Yuristim
                  </span>
                  <select
                    aria-label="Tilni tanlash"
                    value={language}
                    disabled={!!botToken}
                    onChange={(e) =>
                      setLanguage(e.target.value as typeof language)
                    }
                  >
                    <option value="uz">O‘zbekcha</option>
                    <option value="ru">Русский</option>
                    <option value="en">English</option>
                  </select>
                </header>
                <div className="stepper">
                  <span className="active">
                    ✓<small>Hisob</small>
                  </span>
                  <i />
                  <span className="active">
                    2<small>Profil</small>
                  </span>
                  <i />
                  <span>
                    3<small>Tayyor</small>
                  </span>
                </div>
                <div className="profile-setup-copy">
                  <h1>Profil ma’lumotlari</h1>
                  <p>
                    Hisobingizni to‘liq faollashtirish uchun asosiy ma’lumotni
                    kiriting.
                  </p>
                </div>
                <div className="fields">
                  <label>
                    <UserRound size={18} />
                    <input
                      placeholder="Sizni nima deb chaqiraylik?"
                      value={displayName}
                      readOnly={!!botToken}
                      onChange={(e) => setDisplayName(e.target.value)}
                      autoComplete="name"
                    />
                  </label>
                  <small>Masalan: Ali, Azizbek, Dilshoda</small>
                </div>
                <div className="form-bottom">
                  {error && <p className="error">{error}</p>}
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={register}
                  >
                    {busy ? "Hisob yaratilmoqda…" : "Davom etish"}{" "}
                    <ArrowRight size={18} />
                  </button>
                </div>
              </>
            )}
            {screen === "password" && (
              <>
                <button className="back" onClick={back}>
                  <ArrowLeft size={20} />
                </button>
                <div className="auth-hero">
                  {sticker("secure-login", "auth-sticker")}
                  <h1>Username va parol</h1>
                  <p>Hisobingizga xavfsiz kiring</p>
                </div>
                <div className="fields">
                  <label>
                    <UserRound size={18} />
                    <input
                      placeholder="Yuristim username"
                      autoComplete="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                    />
                  </label>
                  <label>
                    <LockKeyhole size={18} />
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="Parol"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      className="icon-button"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </label>
                </div>
                <div className="form-bottom">
                  {error && <p className="error">{error}</p>}
                  <button className="primary" disabled={busy} onClick={login}>
                    {busy ? "Tekshirilmoqda…" : "Kirish"}{" "}
                    <ArrowRight size={18} />
                  </button>
                  <button
                    className="text-button"
                    onClick={() => navigate("special")}
                  >
                    Maxsus kirish usuli
                  </button>
                </div>
              </>
            )}
            {screen === "special" && (
              <>
                <button className="back" onClick={back}>
                  <ArrowLeft size={20} />
                </button>
                <div className="auth-hero special-hero">
                  {sticker("special-login", "auth-sticker")}
                  <h1>Maxsus kirish</h1>
                  <p>
                    Hisobingizga kirish uchun 6 xonali identifikatsiya raqamini
                    kiriting.
                  </p>
                  <div className="pin-dots">
                    {Array.from({ length: 6 }, (_, i) => (
                      <span
                        className={i < code.length ? "filled" : ""}
                        key={i}
                      />
                    ))}
                  </div>
                </div>
                <div className="keypad">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, "delete"].map((n, i) =>
                    n === null ? (
                      <span key={i} />
                    ) : (
                      <button
                        key={i}
                        aria-label={n === "delete" ? "O‘chirish" : String(n)}
                        onClick={() =>
                          n === "delete"
                            ? setCode(code.slice(0, -1))
                            : setCode((code + String(n)).slice(0, 6))
                        }
                      >
                        {n === "delete" ? <X size={20} /> : n}
                      </button>
                    ),
                  )}
                </div>
                <div className="special-bottom">
                  {error && <p className="error">{error}</p>}
                  <button
                    className="primary"
                    disabled={code.length !== 6 || busy}
                    onClick={startSpecial}
                  >
                    Kirish so‘rovini yuborish
                  </button>
                  <button
                    className="text-button"
                    onClick={() => {
                      setHelpOpen(true);
                      setError(
                        BOT
                          ? `6 xonali raqamni @${BOT} botidan olasiz. Botda /code yuboring.`
                          : "Raqam Telegram botda beriladi. Bot manzili hali sozlanmagan",
                      );
                    }}
                  >
                    Uni qayerdan olaman?
                  </button>
                  {helpOpen && BOT && (
                    <a
                      className="soft-link"
                      href={`https://t.me/${BOT}?start=code`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Botni ochish <ArrowRight size={16} />
                    </a>
                  )}
                </div>
              </>
            )}
            {screen === "pending" && (
              <>
                <button className="back" onClick={() => navigate("special")}>
                  <ArrowLeft size={20} />
                </button>
                <div className="pending-content">
                  {sticker(
                    "confirmation-pending",
                    "auth-sticker pending-sticker",
                  )}
                  <h1>Kirishni botdan tasdiqlang</h1>
                  <p>
                    Yuristim Telegram botida kelgan so‘rovni Tasdiqlash tugmasi
                    bilan tasdiqlang.
                  </p>
                  <div className="pending-steps">
                    <p>
                      <b>1</b> Telegramda Yuristim botini oching
                    </p>
                    <p>
                      <b>2</b> Kirish so‘rovini toping
                    </p>
                    <p>
                      <b>3</b> “Tasdiqlash” tugmasini bosing
                    </p>
                  </div>
                  {BOT && (
                    <a
                      className="soft-link"
                      href={`https://t.me/${BOT}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Botni ochish <ArrowRight size={16} />
                    </a>
                  )}
                  <button
                    className="text-button"
                    onClick={() => navigate("password")}
                  >
                    Boshqa usulda kirish
                  </button>
                </div>
              </>
            )}
            {screen === "chat" && (
              <>
                <header className="chat-header">
                  <button aria-label="Menyu" onClick={() => setMenuOpen(true)}>
                    <Menu size={23} />
                  </button>
                  <div className="segmented">
                    <motion.span
                      layout
                      transition={{ duration: reduced ? 0 : 0.22 }}
                      style={{ left: mode === "Chat" ? "3px" : "50%" }}
                    />
                    <button
                      className={mode === "Chat" ? "active" : ""}
                      onClick={() => setMode("Chat")}
                    >
                      Chat
                    </button>
                    <button
                      className={mode === "Work" ? "active" : ""}
                      onClick={() => setMode("Work")}
                    >
                      Work
                    </button>
                  </div>
                  <button
                    aria-label="Profil"
                    onClick={() => navigate("profile")}
                  >
                    <UserRound size={23} />
                  </button>
                </header>
                {!account?.telegramLinked && showBanner && (
                  <motion.div
                    className="telegram-banner"
                    initial={{ opacity: 0, y: -12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: reduced ? 0 : 0.25 }}
                  >
                    {sticker("telegram-verification", "banner-sticker")}
                    <div>
                      <strong>Telegram orqali identifikatsiya</strong>
                      <small>
                        Hisobingizni tasdiqlab, barcha imkoniyatlardan
                        foydalaning.
                      </small>
                    </div>
                    {linkUrl ? (
                      <a
                        className="banner-go"
                        href={linkUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Botni ochish <ArrowRight size={13} />
                      </a>
                    ) : (
                      <button className="banner-go" onClick={linkTelegram}>
                        O‘tish <ArrowRight size={13} />
                      </button>
                    )}
                    <button
                      className="banner-close"
                      aria-label="Yopish"
                      onClick={() => setShowBanner(false)}
                    >
                      <X size={14} />
                    </button>
                  </motion.div>
                )}
                <div className="chat-empty">
                  {sticker("yuristim-logo", "chat-logo")}
                  <h1>Yuristim</h1>
                  <h2>Huquqiy savolingizni bering</h2>
                  <p>
                    Qonunchilikka asoslangan aniq
                    <br /> va ishonchli javob oling.
                  </p>
                  {chatNotice && (
                    <motion.div
                      className="service-notice"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: reduced ? 0 : 0.18 }}
                    >
                      AI xizmati hali faollashtirilmagan.
                    </motion.div>
                  )}
                </div>
                <div className="composer">
                  <button
                    aria-label="Fayl biriktirish"
                    onClick={() => setChatNotice(true)}
                  >
                    <Paperclip size={20} />
                  </button>
                  <input
                    value={chatText}
                    onChange={(e) => setChatText(e.target.value)}
                    placeholder="Savolingizni yozing…"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        setChatNotice(true);
                      }
                    }}
                  />
                  <button
                    className="send"
                    aria-label="Yuborish"
                    onClick={() => setChatNotice(true)}
                  >
                    <Send size={19} />
                  </button>
                </div>
              </>
            )}
            {screen === "profile" && (
              <>
                <header className="simple-header">
                  <button className="back" onClick={() => navigate("chat")}>
                    <ArrowLeft size={20} />
                  </button>
                  <strong>Profil</strong>
                  <span />
                </header>
                <div className="profile-identity">
                  <div className="avatar">
                    <UserRound size={36} />
                  </div>
                  <h2>{account?.displayName}</h2>
                  <p>@{account?.username}</p>
                </div>
                <div className="profile-list">
                  {[
                    [UserRound, "Hisob", "Murojaat nomi va username"],
                    [Settings, "Hisob sozlamalari", "Umumiy sozlamalar"],
                    [ShieldCheck, "Xavfsizlik", "Hisobni himoya qilish"],
                    [BookOpen, "Tariflar", "Mavjud tariflar"],
                    [
                      BriefcaseBusiness,
                      "Obunani boshqarish",
                      "Joriy tarif va to‘lovlar",
                    ],
                  ].map(([Icon, title, sub]) => (
                    <button
                      className="profile-row"
                      key={String(title)}
                      onClick={() => {
                        if (
                          title === "Hisob" ||
                          title === "Hisob sozlamalari"
                        ) {
                          setDisplayName(account?.displayName || "");
                          setLanguage(account?.language || "uz");
                          navigate("accountSettings");
                        } else
                          setError(
                            "Ushbu bo‘lim keyingi bosqichda ishga tushadi",
                          );
                      }}
                    >
                      <Icon size={19} />
                      <span>
                        <strong>{String(title)}</strong>
                        <small>{String(sub)}</small>
                      </span>
                      <ChevronRight size={17} />
                    </button>
                  ))}
                  <button
                    className="profile-row"
                    onClick={() => navigate("specialManage")}
                  >
                    <KeyRound size={19} />
                    <span>
                      <strong>Maxsus kirish usuli</strong>
                      <small>Telegram botga ulanish va boshqarish</small>
                    </span>
                    <em>{account?.telegramLinked ? "Ulangan" : "Ulanmagan"}</em>
                    <ChevronRight size={17} />
                  </button>
                </div>
                <div className="profile-list support-list">
                  <button
                    className="profile-row"
                    onClick={() =>
                      setError("Ma’lumotlar keyingi bosqichda taqdim etiladi")
                    }
                  >
                    <HelpCircle size={18} />
                    <span>
                      <strong>Ilova haqida</strong>
                    </span>
                    <ChevronRight size={17} />
                  </button>
                  <button
                    className="profile-row"
                    onClick={() =>
                      setError("Qo‘llanma keyingi bosqichda taqdim etiladi")
                    }
                  >
                    <HelpCircle size={18} />
                    <span>
                      <strong>Yordam va qo‘llanma</strong>
                    </span>
                    <ChevronRight size={17} />
                  </button>
                </div>
                {error && <p className="profile-message">{error}</p>}
                <button className="logout" onClick={logout}>
                  <LogOut size={18} /> Chiqish
                </button>
              </>
            )}
            {screen === "accountSettings" && (
              <>
                <header className="simple-header">
                  <button className="back" onClick={back}>
                    <ArrowLeft size={20} />
                  </button>
                  <strong>Hisob sozlamalari</strong>
                  <span />
                </header>
                <div className="settings-content">
                  <h2>Profil ma’lumotlari</h2>
                  <p>O‘zgarishlar hisobingizda saqlanadi.</p>
                  <div className="fields">
                    <label>
                      <UserRound size={18} />
                      <input
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="Murojaat nomi"
                      />
                    </label>
                    <label>
                      <AtSign size={18} />
                      <input
                        value={account?.username || ""}
                        readOnly
                        aria-label="Username"
                      />
                    </label>
                    <label>
                      <span className="language-label">Til</span>
                      <select
                        value={language}
                        onChange={(e) =>
                          setLanguage(e.target.value as typeof language)
                        }
                      >
                        <option value="uz">O‘zbekcha</option>
                        <option value="ru">Русский</option>
                        <option value="en">English</option>
                      </select>
                    </label>
                  </div>
                  {error && <p className="error">{error}</p>}
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await api("/users/me/profile", "PATCH", {
                          displayName,
                        });
                        const r = await api("/users/me/settings", "PATCH", {
                          language,
                        });
                        if (r.account) setAccount(r.account);
                        navigate("profile");
                      })
                    }
                  >
                    Saqlash <Check size={18} />
                  </button>
                </div>
              </>
            )}
            {screen === "specialManage" && (
              <>
                <header className="simple-header">
                  <button className="back" onClick={back}>
                    <ArrowLeft size={20} />
                  </button>
                  <strong>Maxsus kirish usuli</strong>
                  <span />
                </header>
                <div className="manage-content">
                  {sticker(
                    account?.telegramLinked
                      ? "telegram-connected"
                      : "telegram-disconnected",
                    "manage-sticker",
                  )}
                  <h2>
                    Telegram bot{" "}
                    {account?.telegramLinked ? "ulangan" : "ulanmagan"}
                  </h2>
                  <p>
                    {account?.telegramLinked
                      ? "Hisobingiz Telegram bot orqali tasdiqlangan. Maxsus kirishdan foydalanishingiz mumkin."
                      : "Telegram hisobingizni bog‘lab, bot orqali kirishni tasdiqlang."}
                  </p>
                  {account?.telegramLinked ? (
                    <>
                      <div className="info-card">
                        <strong>Maxsus identifikatsiya raqami</strong>
                        <small>
                          Xavfsizlik uchun raqamni botning shaxsiy xabarida
                          ko‘ring.
                        </small>
                      </div>
                      {BOT && (
                        <a
                          className="soft-link"
                          href={`https://t.me/${BOT}?start=code`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Botda raqamni olish <ArrowRight size={16} />
                        </a>
                      )}
                      <label className="unlink-field">
                        <LockKeyhole size={18} />
                        <input
                          type="password"
                          placeholder="Uzish uchun parolingizni kiriting"
                          value={unlinkPassword}
                          onChange={(e) => setUnlinkPassword(e.target.value)}
                        />
                      </label>
                      <button
                        className="secondary"
                        disabled={busy || !unlinkPassword}
                        onClick={() =>
                          run(async () => {
                            const r = await api(
                              "/users/me/telegram-unlink",
                              "POST",
                              { password: unlinkPassword },
                            );
                            if (r.account) setAccount(r.account);
                            setUnlinkPassword("");
                          })
                        }
                      >
                        Telegram bog‘lanishini uzish
                      </button>
                    </>
                  ) : (
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={linkTelegram}
                    >
                      Telegram hisobini bog‘lash <ArrowRight size={18} />
                    </button>
                  )}
                  {linkUrl && (
                    <a
                      className="soft-link"
                      href={linkUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Botga o‘tish <ArrowRight size={16} />
                    </a>
                  )}
                  {error && <p className="error">{error}</p>}
                </div>
              </>
            )}
          </motion.main>
        </AnimatePresence>
        <AnimatePresence>
          {menuOpen && (
            <>
              <motion.div
                className="scrim"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduced ? 0 : 0.28 }}
                onClick={() => setMenuOpen(false)}
              />
              <motion.aside
                className="side-menu"
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ duration: reduced ? 0 : 0.28 }}
              >
                <div className="side-brand">
                  {sticker("yuristim-logo", "side-logo")}
                  <span>
                    <strong>Yuristim</strong>
                    <small>Huquqiy AI yordamchi</small>
                  </span>
                  <button onClick={() => setMenuOpen(false)}>
                    <X size={18} />
                  </button>
                </div>
                <div className="side-section">
                  <p>ASOSIY XIZMATLAR</p>
                  {[
                    [BookOpen, "AI chat"],
                    [UserRoundSearch, "Yurist topish"],
                    [Search, "Yuridik izlanish"],
                    [FileText, "Hujjatlar"],
                    [GraduationCap, "Imtihonga tayyorgarlik"],
                  ].map(([Icon, label], i) => (
                    <button
                      key={String(label)}
                      className={i === 0 ? "current" : ""}
                      onClick={() => {
                        if (i === 0) setMenuOpen(false);
                      }}
                    >
                      <Icon size={18} />
                      <span>{String(label)}</span>
                      {i > 0 && <small>Tez orada</small>}
                    </button>
                  ))}
                </div>
                <div className="side-section history">
                  <p>
                    Chat tarixi <span>Barchasini ko‘rish</span>
                  </p>
                  {sticker("empty-chat", "empty-chat-sticker")}
                  <small>Hozircha suhbatlar yo‘q</small>
                </div>
              </motion.aside>
            </>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {tutorial && screen === "chat" && (
            <motion.div
              className="tutorial-cover"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduced ? 0 : 0.25 }}
            >
              <div className="tutorial-card">
                <h2>Yuristimga xush kelibsiz</h2>
                <div className="tutorial-grid">
                  <p>
                    <Menu size={18} />
                    <span>
                      <strong>Menyu</strong> Asosiy bo‘limlarni ochadi.
                    </span>
                  </p>
                  <p>
                    <BriefcaseBusiness size={18} />
                    <span>
                      <strong>Model almashtirish</strong> Chat va Work rejimini
                      tanlang.
                    </span>
                  </p>
                  <p>
                    <UserRound size={18} />
                    <span>
                      <strong>Profil</strong> Hisob va sozlamalarni boshqaring.
                    </span>
                  </p>
                  <p>
                    <ShieldCheck size={18} />
                    <span>
                      <strong>Telegram identifikatsiyasi</strong> Hisobingizni
                      botga bog‘lang.
                    </span>
                  </p>
                </div>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={finishTutorial}
                >
                  Tushundim <Check size={18} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
