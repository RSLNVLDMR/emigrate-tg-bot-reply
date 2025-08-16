# eMigrant Telegram Bot (Vercel serverless)

Бот принимает "топик" от пользователя и по нажатию кнопки отправляет заявку модератору `@emigrate_support`.

## Развёртывание

1) Создайте репозиторий на GitHub и залейте файлы из этого проекта.

2) В Vercel:
   - New Project → Import из вашего GitHub репо.
   - В Settings → Environment Variables добавьте:
     - `BOT_TOKEN` — токен от @BotFather
     - `SUPPORT_USER_ID` — числовой id @emigrate_support (или id приватной группы, **отрицательный**)
     - `BOT_SECRET` — длинная случайная строка
   - Deploy → получите продовый URL вида `https://<project>.vercel.app`.

3) Настройте вебхук Telegram (однократно):

   Подставьте значения и выполните в терминале:
   ```bash
   curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
     -H "Content-Type: application/json" \
     -d '{
       "url": "https://<project>.vercel.app/api/telegram",
       "secret_token": "<BOT_SECRET>"
     }'
