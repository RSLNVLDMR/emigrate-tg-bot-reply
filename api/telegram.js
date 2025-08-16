// api/telegram.js — Vercel serverless, grammY, ESM
import { Bot, InlineKeyboard } from "grammy";

const BOT_TOKEN = process.env.BOT_TOKEN;
const SUPPORT_USER_ID = process.env.SUPPORT_USER_ID;
const BOT_SECRET = process.env.BOT_SECRET;

if (!BOT_TOKEN) throw new Error("BOT_TOKEN is not set");
if (!SUPPORT_USER_ID) throw new Error("SUPPORT_USER_ID is not set");
if (!BOT_SECRET) throw new Error("BOT_SECRET is not set");

const bot = new Bot(BOT_TOKEN);

// --- Гарантируем инициализацию botInfo без падений ---
let botInfoPromise;
async function ensureBotInfo() {
  // Если уже есть botInfo — выходим
  if (bot.botInfo) return;
  // Один запрос на холодный старт
  if (!botInfoPromise) {
    botInfoPromise = bot.api.getMe().then((me) => {
      bot.botInfo = me; // <-- ключевая строка
      return me;
    }).catch((e) => {
      botInfoPromise = undefined; // позволяем повторить на следующем запросе
      throw e;
    });
  }
  await botInfoPromise;
}

// ===== Логика бота =====
const PREVIEW_PREFIX = "🔎 Предпросмотр заявки:\n\nТема: ";

bot.command("start", async (ctx) => {
  const kb = new InlineKeyboard().text("✍️ Пришли тему сообщением", "noop");
  await ctx.reply(
    "Привет! Я приму твою заявку.\n\n" +
      "1) Пришли тему одним сообщением.\n" +
      "2) Нажми «Отправить заявку» под предпросмотром.",
    { reply_markup: kb }
  );
});

bot.on("message:text", async (ctx) => {
  const topic = (ctx.message.text || "").trim();
  if (!topic) return ctx.reply("Пустую тему отправить нельзя.");

  const kb = new InlineKeyboard()
    .text("✅ Отправить заявку", "send_request")
    .row()
    .text("✍️ Изменить тему", "noop");

  await ctx.reply(
    `${PREVIEW_PREFIX}${topic}\n\nЕсли всё верно — нажми кнопку ниже.`,
    { reply_markup: kb }
  );
});

bot.callbackQuery("noop", (ctx) =>
  ctx.answerCallbackQuery({ text: "Пришли новый текст темой одним сообщением." })
);

bot.callbackQuery("send_request", async (ctx) => {
  await ctx.answerCallbackQuery();

  const msg = ctx.callbackQuery.message;
  let topic = "";
  if (msg && "text" in msg && typeof msg.text === "string") {
    const full = msg.text;
    const start = full.indexOf(PREVIEW_PREFIX);
    if (start >= 0) {
      const slice = full.slice(start + PREVIEW_PREFIX.length);
      const stop = slice.indexOf("\n\nЕсли всё верно");
      topic = (stop >= 0 ? slice.slice(0, stop) : slice).trim();
    }
  }
  if (!topic) return ctx.editMessageText("Не удалось извлечь тему. Пришли её ещё раз.");

  const u = ctx.from;
  const mention = `<a href="tg://user?id=${u.id}">${escapeHtml(
    u.first_name + (u.last_name ? " " + u.last_name : "")
  )}</a>`;
  const username = u.username ? `@${u.username}` : "—";
  const text =
    "📩 Новая заявка\n\n" +
    `От: ${mention}\nUser ID: <code>${u.id}</code>\nUsername: ${escapeHtml(username)}\n\n` +
    `Тема: ${escapeHtml(topic)}`;

  try {
    await ctx.api.sendMessage(Number(SUPPORT_USER_ID), text, {
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
    await ctx.editMessageText("✅ Заявка отправлена.");
  } catch (e) {
    await ctx.editMessageText(
      "Не удалось отправить заявку модератору. Возможно, модератор не писал боту / бот заблокирован. " +
        "Попроси модератора один раз написать боту."
    );
    console.error("sendMessage error:", e);
  }
});

function escapeHtml(s) {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

// ===== Vercel handler =====
export default async function handler(req, res) {
  // Проверяем секрет вебхука
  const secret = req.headers["x-telegram-bot-api-secret-token"];
  if (secret !== BOT_SECRET) {
    res.status(401).send("Unauthorized");
    return;
  }

  if (req.method !== "POST") {
    res.status(200).send("OK");
    return;
  }

  try {
    await ensureBotInfo();            // <-- ВАЖНО: гарантируем init
    const update = req.body || {};
    await bot.handleUpdate(update);   // теперь ошибки Bot not initialized не будет
    res.status(200).send("OK");
  } catch (err) {
    console.error("Webhook error:", err);
    res.status(200).send("OK"); // чтобы TG не ретраил
  }
}
