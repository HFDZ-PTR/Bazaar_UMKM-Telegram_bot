# umkm-bazaar-bot

Production-ready Node.js bot that scrapes Instagram and TikTok hashtag pages for UMKM bazaar event posts, deduplicates them with file-based storage, forwards new events to Telegram, and exposes a public Express API.

## Stack

- Node.js CommonJS
- `puppeteer-extra` + `puppeteer-extra-plugin-stealth`
- `cheerio`
- `node-cron`
- `p-queue`
- `p-retry`
- `pino`
- `express`
- `helmet`
- `cors`
- `express-rate-limit`
- Telegram Bot API via native `fetch`
- `zod`
- `dotenv`

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

If you want both the API and bot worker in one process, set `RUN_BOT_WITH_API=true` and run `npm start`.

## Environment

- `CHROME_PATH`: Chrome executable path
- `CHROME_PROFILE_DIR`: Browser profile directory used by Puppeteer
- `TELEGRAM_BOT_TOKEN`: Telegram bot token
- `TELEGRAM_CHAT_ID`: Channel or group chat ID
- `PORT`: API server port
- `API_KEY`: Optional API key required in `x-api-key`
- `RUN_BOT_WITH_API`: Set to `true` to start the bot worker with the API server
- `INSTAGRAM_HASHTAGS`: Comma-separated Instagram hashtags to scan
- `TIKTOK_HASHTAGS`: Comma-separated TikTok hashtags to scan
- `SCRAPE_INTERVAL_HOURS`: Cron interval in hours
- `LOG_LEVEL`: Pino log level
- `DEBUG_HTML_DUMP`: Set to `1` to write the latest scraped HTML into `data/debug/`

## Storage

- `data/seen_ids.json`: Deduplication state
- `data/events/YYYY-MM-DD.json`: Events captured for each day
- `data/logs/errors.json`: Persisted scraper failures
- `cookies/instagram.json` and `cookies/tiktok.json`: Session cookies

Each saved event is normalized with `id`, `eventDate`, `scrapedAt`, and `createdAt`. Cleanup runs before every bot cycle and removes events whose parsed `eventDate` is at least 7 days old. Events without a valid parsed `eventDate` are retained.

## Public API

The API uses consistent JSON responses:

```json
{
  "success": true,
  "data": [],
  "meta": { "page": 1, "limit": 20, "total": 0 },
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

## Notes

- Instagram posts are scraped from hashtag grids, then the bot visits individual post pages to extract caption text and image URLs.
- The scrapers use best-effort HTML extraction and may need selector tuning if the target platforms change markup.
- Telegram messages are sent with MarkdownV2 escaping and queued to respect rate limits.
- Debug HTML dumps are disabled by default to keep runs faster; enable them with `DEBUG_HTML_DUMP=1` when needed.
