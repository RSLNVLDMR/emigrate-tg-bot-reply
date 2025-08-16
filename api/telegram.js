// Serverless Telegram bot on Vercel (Node runtime).
// Framework: bare grammY + webhook, no session state required.
// Topic извлекаем из текста "превью" сообщения, к которому привязана кнопка (надёжно для serverless).

import { Bot, InlineKeyboard } from "grammy";

const BOT_TOKEN = process.env.BOT_TOKEN;
const SUPPORT_USER_ID = process.env.SUPPORT_USER_ID; // number or negative (group)
const BOT_SECRET = process.env.BOT_SECRET; // any random string; must match webhook setup

if (!BOT_TOKEN) throw new Error("BOT_TOKEN is not set");
if (!SUPPORT_USER_ID) throw new Error("SUPPORT_USER_ID is not set");
if (!BOT_SECRET) throw new Error("BOT_SECRET is not set");

// Create bot once (Vercel keeps module cached while warm)
const bot = new Bot(BOT_TOKEN);

// text helpers
const PREVIEW_PREFIX = "🔎 Предпросмотр заявки:\n\nТема: ";

// /start
bot.command("start", async (ctx) => {
  await ctx.reply(
    "Привет! Я приму твою заявку.\n\n" +
      "1) Отправь одним сообщением тему заявки (любой текст).\n" +
      "2) Нажми «Отправить заявку» под предпросмотром."
  );
});

// any text = capture topic and show button
bot.on("message:text", async (ctx) => {
  const topicRaw = (ctx.message.text || "").trim();
  if (!topicRaw) {
    return ctx.reply("Пустую тему отправить нельзя. Напиши текст темы одним сообщением.");
  }

  // Сформируем предпросмотр. Важно: включаем тему в сам текст,
  // чтобы на колбэке можно было её извлечь из ctx.callbackQuery.message.text.
  const preview =
    PREVIEW_PREFIX +
    topicRaw +
    "\n\nЕсли всё верно — нажми кнопку ниже.";

  const kb = new InlineKeyboard()
    .text("✅ Отправить заявку", "send_request")
    .row()
    .text("✍️ Изменить тему (просто пришли новый текст)", "noop");

  await ctx.reply(preview, { reply_markup: kb });
});

// noop (подсказка — просто отправь новый текст)
bot.callbackQuery("noop", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Пришли новый текст темы одним сообщением." });
});

// send_request: parse topic from preview message and forward to SUPPORT_USER_ID
bot.callbackQuery("send_request", async (ctx) => {
  await ctx.answerCallbackQuery();

  const msg = ctx.callbackQuery.message;
  const user = ctx.from;

  // Извлекаем тему: после PREVIEW_PREFIX до конца или до "\n\nЕсли всё верно"
  let topic = "";
  if (msg && "text" in msg && typeof msg.text === "string") {
    const full = msg.text;
    const start = full.indexOf(PREVIEW_PREFIX);
    if (start >= 0) {
      const slice = full.slice(start + PREVIEW_PREFIX.length);
      const stopMarker = "\n\nЕсли всё верно";
      const end = slice.indexOf(stopMarker);
      topic = (end >= 0 ? slice.slice(0, end) : slice).trim();
    }
  }

  if (!topic) {
    // fallback: попросим прислать заново
    await ctx.editMessageText(
      "Не удалось извлечь тему заявки. Пришли текст темы сообщением ещё раз."
    );
    return;
  }

  const mention = `<a href="tg://user?id=${user.id}">${escapeHtml(
    user.first_name + (user.last_name ? " " + user.last_name : "")
  )}</a>`;
  const username = user.username ? `@${user.username}` : "—";

  const supportText =
    "📩 Новая заявка\n\n" +
    `От: ${mention}\n` +
    `User ID: <code>${user.id}</code>\n` +
    `Username: ${escapeHtml(username)}\n\n` +
    `Тема: ${escapeHtml(topic)}`;

  try {
    await ctx.api.sendMessage(Number(SUPPORT_USER_ID), supportText, {
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
  } catch (e) {
    // типичные причины: модератор не нажимал /start боту; бот заблокирован
    await ctx.editMessageText(
      "Не удалось отправить заявку модератору.\n\n" +
        "Возможные причины:\n" +
        "• Аккаунт модератора ещё не писал боту (/start)\n" +
        "• Бот заблокирован модератором\n\n" +
        "Попроси модератора один раз написать этому боту. После этого отправка заработает."
    );
    console.error("Failed to DM SUPPORT_USER_ID:", e);
    return;
  }

  await ctx.editMessageText("✅ Заявка отправлена. Мы свяжемся с тобой в личке при необходимости.");
});

function escapeHtml(s) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

// ---- Vercel HTTP handler (webhook) ----
export default async function handler(req, res) {
  // Verify secret token from Telegram
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
    // Vercel auto-parses JSON if header is correct; ensure we have body
    const update = req.body || {};
    await bot.handleUpdate(update);
    res.status(200).send("OK");
  } catch (err) {
    console.error("Webhook error:", err);
    res.status(200).send("OK"); // Telegram expects 200 to stop retries; log the error instead
  }
}
