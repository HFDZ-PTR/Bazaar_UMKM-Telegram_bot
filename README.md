# umkm-bazaar-bot

SQLite-backed Node.js bot for scraping Instagram and TikTok hashtag pages for UMKM bazaar event posts, forwarding new events to Telegram, and exposing a public REST API.

## Overview

`umkm-bazaar-bot` is built for operators who want new UMKM bazaar posts collected automatically without manually monitoring social media. The bot scrapes configured hashtags, normalizes event data, deduplicates results, stores records in SQLite, sends new findings to Telegram, and serves the same data through an Express API.

The current architecture uses SQLite as the primary application datastore. JSON sidecar files are still used for browser cookies, Telegram target registration, Telegram update offsets, and optional debug HTML dumps.

## Stack

- Node.js 18+
- CommonJS modules
- `dotenv`
- `better-sqlite3`
- `puppeteer-core`
- `puppeteer-extra`
- `puppeteer-extra-plugin-stealth`
- `cheerio`
- `express`
- `cors`
- `helmet`
- `express-rate-limit`
- `p-queue`
- `p-retry`
- `pino`
- `pino-pretty`
- `zod`
- Native `fetch` for Telegram Bot API
- `nodemon` for local development

## Features

- Scrapes Instagram and TikTok hashtag pages for UMKM bazaar announcements.
- Rotates hashtags per scrape cycle using `shuffle`, `random`, or `all` selection modes.
- Normalizes parsed posts into a shared event schema.
- Deduplicates events using a SHA-256 fingerprint of `platform:postId`.
- Stores events, scrape errors, and hashtag rotation state in SQLite.
- Sends new events to one or more Telegram chats.
- Registers Telegram targets dynamically from `/start` messages.
- Exposes a public REST API for querying stored events.
- Removes expired events automatically before each scrape cycle.
- Supports API-only, bot-only, combined, and single-run execution modes.

## Project structure

```text
umkm-bazaar-bot/
├── .env
├── .env.example
├── README.md
├── package.json
├── package-lock.json
├── chrome-profiles/
│   └── main/
├── cookies/
│   ├── instagram.json
│   └── tiktok.json
├── data/
│   ├── app.db
│   ├── debug/
│   ├── telegram_targets.json
│   └── telegram_updates_state.json
├── scripts/
│   └── migrate-json-to-sqlite.js
└── src/
    ├── app.js
    ├── bot.js
    ├── run-once.js
    ├── api/
    ├── config/
    ├── formatters/
    ├── parsers/
    ├── scrapers/
    ├── services/
    └── utils/
```

## Data model

Main SQLite tables:

- `events`: normalized event records with unique constraint on `platform` and `post_id`.
- `hashtag_rotation_state`: persisted queue and last-picked hashtags per platform.
- `scrape_errors`: persisted scraper and processing failures.

Typical `events` fields:

- `id`
- `platform`
- `post_id`
- `title`
- `date`
- `event_date`
- `location`
- `organizer`
- `description`
- `image_url`
- `source_url`
- `source_hashtag`
- `scraped_at`
- `created_at`

Notes about schema and migrations:

- **New fields:** the `events` table now includes a `region` column and a `content_fingerprint` column used for cross-account deduplication.
- **Automatic migration:** the application will attempt to add missing columns and indexes on startup if they are not present in an existing `app.db`. Startup errors during DB initialization are logged and re-thrown to make failures visible.
- **Indexes:** indexes are created on `platform`, `event_date`, `created_at`, `region`, and `content_fingerprint` for query performance.

## Execution modes

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

Starts the API server and bot worker in the same Node.js process.

### Single run

```bash
npm run run:once
```

Runs one scrape-cleanup-notification cycle and exits.

## Setup

1. Install dependencies.

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env`.

3. Fill in the required environment values.

4. Make sure Chrome is installed and `CHROME_PATH` points to the executable.

5. Start the API, bot, or both depending on your deployment mode.

## Environment variables

```env
CHROME_PATH=/usr/bin/google-chrome
CHROME_PROFILE_DIR=./chrome-profiles/main
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
PORT=3000
API_KEY=
RUN_BOT_WITH_API=false
INSTAGRAM_USERNAME=
INSTAGRAM_PASSWORD=
INSTAGRAM_SESSIONID=
INSTAGRAM_COOKIE_JSON=
INSTAGRAM_HASHTAGS=bazarumkm,umkmjakarta,bazarjakarta,callingtenant,infobazaar
TIKTOK_HASHTAGS=bazarumkm,umkmjakarta,bazarjakarta,callingtenant,infobazaar
HASHTAG_SELECTION_MODE=shuffle
HASHTAGS_PER_CYCLE=2
MAX_POSTS_PER_SCRAPE=3
SCRAPE_INTERVAL=1h
LOG_LEVEL=info
DEBUG_HTML_DUMP=0
```

Configuration & paths

- Runtime paths are derived from the project root and exposed via `CONFIG`:
  - `dataDir` → `data/` (main app DB `data/app.db`, `data/debug/`, `data/logs/`)
  - `cookiesDir` → `cookies/` (browser cookies like `cookies/instagram.json`)
  - `logsDir` → `data/logs/`
- The app validates environment variables with `zod` and supports multiline hashtag lists in `INSTAGRAM_HASHTAGS` and `TIKTOK_HASHTAGS` (comma or newline separated).

Default scraper behavior

- Human-like delays and scrolling behavior are configurable; defaults are:
  - `humanDelayMinMs`: 1000
  - `humanDelayMaxMs`: 3000
  - `scrollSteps`: 8
  - `scrollDelayMs`: 1500
  - `networkTimeoutMs`: 45000

Scripts

- `npm start`: start API server (`src/app.js`).
- `npm run bot`: start bot worker (`src/bot.js`).
- `npm run run:once`: run one scrape cycle (`src/run-once.js`).
- `npm run migrate:sqlite`: migrate legacy JSON to SQLite (`scripts/migrate-json-to-sqlite.js`).

Variable notes:

- `CHROME_PATH`: path to the Chrome or Chromium executable used by Puppeteer.
- `CHROME_PROFILE_DIR`: browser profile directory for persisted browser session data.
- `TELEGRAM_BOT_TOKEN`: Telegram bot token.
- `TELEGRAM_CHAT_ID`: optional fixed Telegram chat ID.
- `PORT`: API port.
- `API_KEY`: optional API key checked through the `x-api-key` header.
- `RUN_BOT_WITH_API`: starts the bot worker inside the API process when `true`.
- `INSTAGRAM_USERNAME` and `INSTAGRAM_PASSWORD`: optional credential fallback for Instagram login.
- `INSTAGRAM_SESSIONID`: optional `sessionid` cookie value for Instagram.
- `INSTAGRAM_COOKIE_JSON`: optional raw JSON cookie payload for Instagram.
- `INSTAGRAM_HASHTAGS`: comma-separated Instagram hashtags.
- `TIKTOK_HASHTAGS`: comma-separated TikTok hashtags.
- `HASHTAG_SELECTION_MODE`: hashtag selection mode, `shuffle`, `random`, or `all`.
- `HASHTAGS_PER_CYCLE`: number of hashtags selected per platform on each cycle.
- `MAX_POSTS_PER_SCRAPE`: maximum number of posts processed per hashtag scrape.
- `SCRAPE_INTERVAL`: interval string such as `5m`, `1h`, or `1h30m`.
- `LOG_LEVEL`: Pino log level.
- `DEBUG_HTML_DUMP=1`: enables debug HTML dumps into `data/debug/`.

## Storage

```text
data/
├── app.db
├── debug/
├── telegram_targets.json
└── telegram_updates_state.json

cookies/
├── instagram.json
└── tiktok.json
```

- `data/app.db`: main SQLite database for events, hashtag rotation state, and scrape errors.
- `data/debug/`: optional HTML dumps written only when `DEBUG_HTML_DUMP=1`.
- `data/telegram_targets.json`: registered Telegram chat targets discovered from `/start`.
- `data/telegram_updates_state.json`: last processed Telegram update offset.
- `cookies/*.json`: persisted browser cookies used by scrapers.

## API

The API returns a consistent JSON response shape:

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

If `API_KEY` is set, send it in the `x-api-key` header. If it is empty, the API is public.

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

## Workflow

1. The bot selects a subset of hashtags for each platform based on the configured selection mode.
2. A scraper opens the hashtag page with Puppeteer and loads cookies from disk.
3. The scraper scrolls and extracts raw post or video cards.
4. The parser normalizes the content into a shared event object.
5. Validation runs before persistence and notification.
6. Dedup checks whether the event already exists in SQLite.
7. New events are written into the `events` table.
8. Telegram notifications are queued and sent.
9. The API reads the same stored events from SQLite.
10. Cleanup removes expired events before the next cycle begins.

## Development commands

```bash
npm start
npm run bot
npm run dev
npm run dev:bot
npm run run:once
npm run migrate:sqlite
```

- `npm start`: start the API server.
- `npm run bot`: start the bot worker.
- `npm run dev`: start the API server with `nodemon`.
- `npm run dev:bot`: start the bot worker with `nodemon`.
- `npm run run:once`: execute one bot cycle and exit.
- `npm run migrate:sqlite`: migrate legacy JSON event data into SQLite.

## Notes

- Instagram scraping may need valid cookies or manual login recovery.
- TikTok scraping may trigger verification or anti-bot walls depending on request patterns.
- Telegram messages use MarkdownV2 formatting and are queued to reduce rate-limit issues.
- The application uses SQLite for primary app data; JSON files are only sidecar storage for cookies, Telegram runtime state, and debug artifacts.
