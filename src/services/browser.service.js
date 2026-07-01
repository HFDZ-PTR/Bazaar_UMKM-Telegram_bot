const fs = require("fs").promises;
const path = require("path");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const { CONFIG } = require("../config");
const logger = require("../utils/logger");
const {
  HUMAN_DELAY_MAX_MS,
  HUMAN_DELAY_MIN_MS,
  SCRAPER_SCROLL_DELAY_MS,
  SCRAPER_SCROLL_STEPS,
} = require("../config/constants");
const { ensureDirectory } = require("../utils/storage.service");

puppeteer.use(StealthPlugin());

let browser;
let browserLaunchPromise;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomHumanDelay() {
  return (
    Math.floor(Math.random() * (HUMAN_DELAY_MAX_MS - HUMAN_DELAY_MIN_MS + 1)) +
    HUMAN_DELAY_MIN_MS
  );
}

async function readCookies(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const cookies = JSON.parse(raw);
    return Array.isArray(cookies) ? cookies : [];
  } catch {
    return [];
  }
}

function parseCookieJson(value) {
  if (!value || !value.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed;
    }

    if (parsed && typeof parsed === "object") {
      return [parsed];
    }
  } catch {
    return [];
  }

  return [];
}

function buildSessionCookie(name, value, domain) {
  if (!value || !String(value).trim()) {
    return null;
  }

  return {
    name,
    value: String(value),
    domain,
    path: "/",
    secure: true,
    httpOnly: true,
    sameSite: "None",
  };
}

function getEnvCookies(platform) {
  if (platform === "instagram") {
    const sessionCookie = buildSessionCookie(
      "sessionid",
      CONFIG.instagramSessionId,
      ".instagram.com",
    );

    return [
      ...parseCookieJson(CONFIG.instagramCookieJson),
      ...(sessionCookie ? [sessionCookie] : []),
    ];
  }

  if (platform === "twitter") {
    const authTokenCookie = buildSessionCookie(
      "auth_token",
      CONFIG.twitterAuthToken,
      ".x.com",
    );

    return [
      ...parseCookieJson(CONFIG.twitterCookieJson),
      ...(authTokenCookie ? [authTokenCookie] : []),
    ];
  }

  return [];
}

async function writeCookies(filePath, cookies) {
  await ensureDirectory(filePath);
  await fs.writeFile(filePath, JSON.stringify(cookies, null, 2), "utf8");
}

async function loadCookies(page, platform) {
  const cookiePath =
    platform === "instagram"
      ? CONFIG.instagramCookiesPath
      : CONFIG.twitterCookiesPath;
  const envCookies = getEnvCookies(platform);
  const fileCookies = await readCookies(cookiePath);
  const cookies = [...envCookies, ...fileCookies];
  if (cookies.length > 0) {
    await page.setCookie(...cookies);
  }
}

async function saveCookies(page, platform) {
  const cookiePath =
    platform === "instagram"
      ? CONFIG.instagramCookiesPath
      : CONFIG.twitterCookiesPath;
  const cookies = await page.cookies();
  await writeCookies(cookiePath, cookies);
}

async function launchBrowser() {
  if (browser) {
    return browser;
  }

  if (browserLaunchPromise) {
    return browserLaunchPromise;
  }

  browserLaunchPromise = (async () => {
    await ensureDirectory(path.join(CONFIG.chromeProfileDir, "placeholder"));
    const launchedBrowser = await puppeteer.launch({
      headless: "new",
      executablePath: CONFIG.chromePath,
      userDataDir: CONFIG.chromeProfileDir,
      args: ["--disable-blink-features=AutomationControlled"],
    });
    browser = launchedBrowser;
    return launchedBrowser;
  })();

  try {
    return await browserLaunchPromise;
  } finally {
    browserLaunchPromise = undefined;
  }
}

async function createPage(platform) {
  const currentBrowser = await launchBrowser();
  const page = await currentBrowser.newPage();
  await loadCookies(page, platform);
  await page.setViewport({ width: 1366, height: 900 });
  return page;
}

async function scrollPage(page, steps = SCRAPER_SCROLL_STEPS) {
  for (let index = 0; index < steps; index += 1) {
    await page.evaluate(() => {
      window.scrollBy(0, window.innerHeight * 0.8);
    });
    await delay(SCRAPER_SCROLL_DELAY_MS);
    await delay(randomHumanDelay());
  }
}

async function closePage(page, platform) {
  if (!page) {
    return;
  }

  try {
    if (platform) {
      try {
        if (!page.isClosed()) {
          await saveCookies(page, platform);
        }
      } catch (error) {
        logger.warn(
          { err: error, platform },
          "failed to save cookies because page session is closed",
        );
      }
    }
  } finally {
    await page.close().catch(() => {});
  }
}

function isLoginPage(platform, currentUrl) {
  if (platform === "instagram") {
    return currentUrl.includes("instagram.com/accounts/login");
  }

  if (platform === "twitter") {
    return (
      currentUrl.includes("x.com/i/flow/login") ||
      currentUrl.includes("twitter.com/i/flow/login")
    );
  }

  return false;
}

async function waitForManualLogin(page, platform, timeoutMs = 180000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const currentUrl = page.url();
    if (!isLoginPage(platform, currentUrl)) {
      return true;
    }
    await delay(1000);
  }
  return false;
}

async function tryInstagramCredentialLogin(page) {
  if (!CONFIG.instagramUsername || !CONFIG.instagramPassword) {
    return false;
  }

  await page.waitForSelector('input[name="username"]', { timeout: 20000 });
  await page.click('input[name="username"]', { clickCount: 3 });
  await page.type('input[name="username"]', CONFIG.instagramUsername, {
    delay: 45,
  });
  await page.click('input[name="password"]', { clickCount: 3 });
  await page.type('input[name="password"]', CONFIG.instagramPassword, {
    delay: 45,
  });
  await delay(randomHumanDelay());
  await page.click('button[type="submit"]');
  await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 45000 });
  return true;
}

async function tryTwitterCredentialLogin(page) {
  if (!CONFIG.twitterUsername || !CONFIG.twitterPassword) {
    return false;
  }

  const usernameSelector = 'input[autocomplete="username"], input[name="text"]';
  await page.waitForSelector(usernameSelector, { timeout: 20000 });
  await page.click(usernameSelector, { clickCount: 3 });
  await page.type(usernameSelector, CONFIG.twitterUsername, { delay: 45 });
  await page.keyboard.press("Enter");

  const passwordSelector = 'input[name="password"]';
  await page.waitForSelector(passwordSelector, { timeout: 30000 });
  await page.click(passwordSelector, { clickCount: 3 });
  await page.type(passwordSelector, CONFIG.twitterPassword, { delay: 45 });
  await delay(randomHumanDelay());
  await page.keyboard.press("Enter");
  await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 45000 });
  return true;
}

async function ensureAuthenticated(page, platform) {
  const currentUrl = page.url();
  if (!isLoginPage(platform, currentUrl)) {
    return;
  }

  logger.info({ platform }, "login page detected, attempting authentication");

  let loggedIn = false;
  try {
    if (platform === "instagram") {
      loggedIn = await tryInstagramCredentialLogin(page);
    } else if (platform === "twitter") {
      loggedIn = await tryTwitterCredentialLogin(page);
    }
  } catch (error) {
    logger.warn({ err: error, platform }, "credential login attempt failed");
  }

  if (!loggedIn) {
    logger.info(
      { platform },
      "waiting for manual login in opened browser window",
    );
    const ok = await waitForManualLogin(page, platform);
    if (!ok) {
      throw new Error(
        `${platform} login timeout. Please sign in manually and rerun.`,
      );
    }
  }
}

async function closeBrowser() {
  if (!browser) {
    return;
  }

  await browser.close().catch(() => {});
  browser = undefined;
}

module.exports = {
  delay,
  randomHumanDelay,
  launchBrowser,
  createPage,
  scrollPage,
  ensureAuthenticated,
  loadCookies,
  saveCookies,
  closePage,
  closeBrowser,
};
