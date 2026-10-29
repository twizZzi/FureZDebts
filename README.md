# FureZ Debts

Telegram-бот [@FureZDebtsBot](https://t.me/FureZDebtsBot) и Mini App для учёта долгов с друзьями.
Бот закрытый: попасть можно только по одноразовой ссылке-приглашению от участника (действует 7 дней,
после входа вы сразу друзья). Участники находят друг друга по @username, долги и возвраты записываются
в любой валюте, вторая сторона сразу получает уведомление от бота. Каждый видит только записи, в которых
участвует сам; лента фильтруется по другу.

## Запуск

```bash
npm install
cp .dev.vars.example .dev.vars   # DEV_MODE=1, BOT_TOKEN
npm run db:migrate:local
npm run dev                      # http://localhost:5173/?dev=1001
npm test && npm run lint
```

Вне Telegram, только локально и при `DEV_MODE=1`, можно войти фейковыми пользователями:
`?dev=1001` (Рома), `?dev=1002` (Петя), `?dev=1003` (Аня); `?dev=1004` и `?dev=1005` — не участники,
пустить их можно приглашением: `?dev=1004&start=inv_<код>`.
Кнопки Telegram (Back/Main) в этом режиме заменяются кнопками на странице.

## Деплой (Cloudflare Workers + D1)

```bash
npx wrangler login
npx wrangler d1 create furez-debts        # database_id → wrangler.jsonc
npm run db:migrate:remote
npx wrangler secret put BOT_TOKEN
npx wrangler secret put WEBHOOK_SECRET    # любая длинная случайная строка
npm run deploy
WEBHOOK_SECRET=... npm run setup-bot -- https://furez-debts.<аккаунт>.workers.dev
```

`setup-bot` настраивает webhook, кнопку меню «Долги», команды и описание бота.

## Устройство

- `worker/` — Cloudflare Worker на Hono: `/api/*` для Mini App, `/bot/webhook` для бота, остальное отдают статические файлы
  - `auth.js` — проверка подписи initData (HMAC-SHA256), данные старше суток отклоняются
  - `actions.js` — допуск по приглашениям, заявки в друзья, записи, «погасить полностью», удаление, уведомления
  - `db.js` — запросы к D1, балансы
  - `bot.js`, `messages.js`, `telegram.js` — /start, кнопки «Принять / Отклонить», тексты уведомлений
- `shared/` — валюты, форматирование сумм, подписи; используются и сервером, и Mini App
- `migrations/` — схема D1: `users`, `friendships`, `entries`, `invites`
- `src/` — Mini App на React (оформление из FureZTracker): вкладки Долги / Лента / Друзья, листы друга, записи, поиска и профиля

Запись означает, что `creditor` передал ценность `debtor`: дал в долг (`debt`) или вернул долг (`payment`).
Баланс с другом считается по каждой валюте отдельно: сумма того, что дал я, минус сумма того, что дал друг.
Удалённые записи остаются в базе с отметкой `deleted_at`.
