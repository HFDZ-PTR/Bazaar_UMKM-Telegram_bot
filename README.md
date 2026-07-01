# umkm-bazaar-bot

Production-ready Node.js bot that scrapes Instagram and X/Twitter hashtag pages for UMKM bazaar event posts, deduplicates them with file-based storage, and forwards new events to Telegram.

## Stack

- Node.js CommonJS
- `puppeteer-extra` + `puppeteer-extra-plugin-stealth`
- `cheerio`
- `node-cron`
- `p-queue`
- `p-retry`
- `pino`
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

4. Start the bot:

   ```bash
   npm run bot
   ```

## Environment

- `CHROME_PATH`: Chrome executable path
- `CHROME_PROFILE_DIR`: Browser profile directory used by Puppeteer
- `TELEGRAM_BOT_TOKEN`: Telegram bot token
- `TELEGRAM_CHAT_ID`: Channel or group chat ID
- `INSTAGRAM_HASHTAGS`: Comma-separated Instagram hashtags to scan
- `TWITTER_HASHTAGS`: Comma-separated X/Twitter hashtags to scan
- `SCRAPE_INTERVAL_HOURS`: Cron interval in hours
- `LOG_LEVEL`: Pino log level
- `DEBUG_HTML_DUMP`: Set to `1` to write the latest scraped HTML into `data/debug/`

## Storage

- `data/seen_ids.json`: Deduplication state
- `data/events/YYYY-MM-DD.json`: Events captured for each day
- `data/logs/errors.json`: Persisted scraper failures
- `cookies/instagram.json` and `cookies/twitter.json`: Session cookies

## Notes

- Instagram posts are scraped from hashtag grids, then the bot visits individual post pages to extract caption text and image URLs.
- The scrapers use best-effort HTML extraction and may need selector tuning if the target platforms change markup.
- Telegram messages are sent with MarkdownV2 escaping and queued to respect rate limits.
- Debug HTML dumps are disabled by default to keep runs faster; enable them with `DEBUG_HTML_DUMP=1` when needed.
