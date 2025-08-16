// api/telegram.js — Vercel serverless (Node/ESM) + grammY
import { Bot, InlineKeyboard } from "grammy";

const {
  BOT_TOKEN,            // токен бота
  BOT_SECRET,           // секрет для проверки Telegram вебхука
  SUPPORT_USER_ID,      // ЧИСЛОВОЙ ID: 7437456248
  SUPPORT_USERNAME      // опционально: username без @ (например, emigrate_support)
} = process.env;

if (!BOT_TOKEN) throw new Error("BOT_TOKEN is not set");
if (!BOT_SECRET) throw new Error("BOT_SECRET is not set");
if (!SUPPORT_USER_ID) throw new Error("SUPPORT_USER_ID is not set");

const bot = new Bot(BOT_TOKEN);

// Инициализация бота один раз на холодном старте (serverless-safe)
let initPromise = null;
async function ensureBotInit() {
  if (initPromise) return initPromise;
  initPromise = bot.init().catch((e) => {
    initPromise = null; // позволим повторить на следующем запросе
    throw e;
  });
  return initPromise;
}

function buildKeyboard() {
  const kb = new InlineKeyboard();
  // Открывает родной клиент Telegram (мобайл/десктоп)
  kb.url("💬 Открыть чат с поддержкой", `tg://user?id=${Number(SUPPORT_USER_ID)}`);
  // Фолбэк через t.me (если задан username)
  if (SUPPORT_USERNAME) {
    const uname = SUPPORT_USERNAME.replace(/^@/, "");
    kb.row().url("🌐 Открыть через t.me", `https://t.me/${uname}`);
  }
  return kb;
}

const PREVIEW_PREFIX = "🔎 Предпросмотр заявки:\n\nТема: ";

bot.command("start", async (ctx) => {
  await ctx.reply(
    "Напиши тему одним сообщением, затем нажми кнопку — откроется личный чат поддержки.",
    { reply_markup: buildKeyboard() }
  );
});

bot.on("message:text", async (ctx) => {
  const topic = (ctx.message.text || "").trim();
  const text =
    `${PREVIEW_PREFIX}${topic || "—"}\n\n` +
    `Нажми кнопку ниже — откроется личный чат поддержки. Скопируй туда тему.`;
  await ctx.reply(text, { reply_markup: buildKeyboard() });
});

// --- Vercel HTTP handler (webhook) ---
export default async function handler(req, res) {
  // Проверяем секрет из Telegram
  const secret = req.headers["x-telegram-bot-api-secret-token"];
  if (secret !== BOT_SECRET) {
    res.status(401).send("Unauthorized");
    return;
  }

  // GET-пинг/проверка
  if (req.method !== "POST") {
    res.status(200).send("OK");
    return;
  }

  try {
    await ensureBotInit();
    await bot.handleUpdate(req.body || {});
    res.status(200).send("OK");
  } catch (err) {
    console.error("Webhook error:", err);
    // Возвращаем 200, чтобы Telegram не ретраил повторно
    res.status(200).send("OK");
  }
}
