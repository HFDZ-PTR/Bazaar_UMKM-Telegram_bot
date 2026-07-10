# umkm-bazaar-bot

Production-ready Node.js bot that scrapes Instagram and TikTok hashtag pages for UMKM bazaar event posts, deduplicates them with file-based storage, forwards new events to Telegram, and exposes a public Express API.

## Stack

- Node.js CommonJS
- `puppeteer-core`
- `puppeteer-extra`
- `puppeteer-extra-plugin-stealth`
- `cheerio`
- `p-queue`
- `p-retry`
- `pino`
- `pino-pretty`
- `express`
- `helmet`
- `cors`
- `express-rate-limit`
- Telegram Bot API via native `fetch`
- `zod`
- `dotenv`
- `nodemon` for local development

## Features

- Scrapes Instagram and TikTok hashtag pages for event posts.
- Normalizes event data into a shared file-based format.
- Deduplicates events using SHA-256 fingerprints of `platform:postId`.
- Stores events in JSON files grouped by platform and event date.
- Sends new events to one or more Telegram targets.
- Discovers Telegram targets dynamically from `/start` messages.
- Exposes a public REST API for querying saved events.
- Removes expired events automatically before each scrape cycle.
- Supports running the API and bot separately or in one combined process.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in your values.

3. Make sure Chrome is installed and `CHROME_PATH` points to the executable.

4. Start the API server:

   ```bash
   npm start
   ```

5. Start the bot worker:

   ```bash
   npm run bot
   ```

If you want both the API and bot worker in one process, set `RUN_BOT_WITH_API=true` and run:

```bash
npm start
```

## Development commands

```bash
npm start
npm run bot
npm run dev
npm run dev:bot
npm run run:once
```

- `npm start`: Start the API server.
- `npm run bot`: Start the bot worker only.
- `npm run dev`: Start the API server with `nodemon`.
- `npm run dev:bot`: Start the bot worker with `nodemon`.
- `npm run run:once`: Run a single bot cycle once, then exit.

## Environment

- `CHROME_PATH`: Chrome executable path.
- `CHROME_PROFILE_DIR`: Browser profile directory used by Puppeteer.
- `TELEGRAM_BOT_TOKEN`: Telegram bot token.
- `TELEGRAM_CHAT_ID`: Optional fixed Telegram chat ID. If omitted, chats can self-register by sending `/start` to the bot.
- `PORT`: API server port.
- `API_KEY`: Optional API key required in the `x-api-key` header.
- `RUN_BOT_WITH_API`: Set to `true` to start the bot worker with the API server.
- `INSTAGRAM_USERNAME`: Optional Instagram username for credential login fallback.
- `INSTAGRAM_PASSWORD`: Optional Instagram password for credential login fallback.
- `INSTAGRAM_SESSIONID`: Optional Instagram `sessionid` cookie value.
- `INSTAGRAM_COOKIE_JSON`: Optional raw JSON cookie payload for Instagram.
- `INSTAGRAM_HASHTAGS`: Comma-separated Instagram hashtags to scan.
- `TIKTOK_HASHTAGS`: Comma-separated TikTok hashtags to scan.
- `SCRAPE_INTERVAL`: Scrape interval string such as `5m`, `1h`, or `1h25m`.
- `LOG_LEVEL`: Pino log level.
- `DEBUG_HTML_DUMP`: Set to `1` to write debug HTML into `data/debug/`.

## Storage

```text
data/
├── debug/
├── events/
├── logs/
│   └── errors.json
├── seen_ids.json
├── telegram_targets.json
└── telegram_updates_state.json

cookies/
├── instagram.json
└── tiktok.json
```

- `data/seen_ids.json`: Deduplication fingerprint state.
- `data/events/<platform>/<YYYY-MM-DD>.json`: Stored event files grouped by platform and event date.
- `data/logs/errors.json`: Persisted scraper failures.
- `data/telegram_targets.json`: Registered Telegram chat targets.
- `data/telegram_updates_state.json`: Stored Telegram update offset.
- `cookies/instagram.json` and `cookies/tiktok.json`: Persisted browser cookies.

Each saved event is normalized with `id`, `eventDate`, `scrapedAt`, and `createdAt`. Cleanup runs before every bot cycle and removes events whose parsed `eventDate` is at least 7 days old. Events without a valid parsed `eventDate` are retained.

## Run modes

### API only

```bash
npm start
```

Starts the Express API only.

### Bot only

```bash
npm run bot
```

Starts the scrape worker only.

### Combined mode

```bash
RUN_BOT_WITH_API=true npm start
```

Starts the API and bot in the same Node.js process.

On Windows PowerShell:

```powershell
$env:RUN_BOT_WITH_API="true"; npm start
```

## Public API

The API uses a consistent JSON response shape:

```json
{
  "success": true,
  "data": [],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 0,
    "totalPages": 1,
    "sortBy": "eventDate",
    "order": "asc"
  },
  "error": null
}
```

If `API_KEY` is set, include it in the `x-api-key` header. If it is blank, the API is public.

### Health

```bash
curl http://localhost:3000/api/health
```

### All events

```bash
curl "http://localhost:3000/api/events?page=1&limit=20&sortBy=eventDate&order=asc"
```

### Upcoming events

```bash
curl "http://localhost:3000/api/events/upcoming?page=1&limit=20"
```

### Platform filter

```bash
curl "http://localhost:3000/api/events/platform/instagram?page=1&limit=20"
```

### Search

```bash
curl "http://localhost:3000/api/events/search?q=bazaar&page=1&limit=20"
```

### Event by ID

```bash
curl http://localhost:3000/api/events/<event-id>
```

### API key example

```bash
curl -H "x-api-key: your-key" http://localhost:3000/api/health
```

## Event flow

1. A scraper loads an Instagram or TikTok hashtag page.
2. The scraper extracts raw post or video card data.
3. A parser normalizes the post into a shared event object.
4. The event is validated with `zod`.
5. The dedup layer hashes `platform:postId` and skips known items.
6. New events are written to JSON storage.
7. Telegram notifications are queued and sent.
8. The API reads from the same stored event files.

## Notes

- Instagram scraping uses hashtag grids and may visit detail pages to recover full caption text.
- TikTok scraping includes verification-wall detection and debug HTML dumping support.
- Telegram messages are escaped for MarkdownV2 and queued to reduce rate-limit issues.
- Telegram chat targets can be registered dynamically by sending `/start` to the bot.
- Debug HTML dumps are disabled by default to keep runs faster; enable them with `DEBUG_HTML_DUMP=1` when needed.
- The project is fully file-based and does not use a database or Redis.