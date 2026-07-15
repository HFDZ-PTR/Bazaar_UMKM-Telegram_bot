// src/services/browser.service.js
const fs = require("fs").promises;
const path = require("path");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");

const { CONFIG } = require("../config");
const logger = require("../utils/logger");
const { ensureDirectory } = require("../utils/storage.service");

puppeteer.use(StealthPlugin());

let browser = null;
let browserLaunchPromise = null;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomHumanDelay() {
  return (
    Math.floor(
      Math.random() * (CONFIG.humanDelayMaxMs - CONFIG.humanDelayMinMs + 1),
    ) + CONFIG.humanDelayMinMs
  );
}

async function readCookies(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseCookieJson(value = "") {
  const raw = String(value).trim();
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }

    return parsed && typeof parsed === "object" ? [parsed] : [];
  } catch {
    return [];
  }
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

function getCookiePath(platform) {
  return platform === "instagram"
    ? CONFIG.instagramCookiesPath
    : CONFIG.tiktokCookiesPath;
}

function getEnvCookies(platform) {
  if (platform !== "instagram") {
    return [];
  }

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

async function writeCookies(filePath, cookies) {
  await ensureDirectory(filePath);
  await fs.writeFile(filePath, JSON.stringify(cookies, null, 2), "utf8");
}

async function loadCookies(page, platform) {
  const cookies = [
    ...getEnvCookies(platform),
    ...(await readCookies(getCookiePath(platform))),
  ];

  if (cookies.length > 0) {
    await page.setCookie(...cookies);
  }
}

async function saveCookies(page, platform) {
  const cookies = await page.cookies();
  await writeCookies(getCookiePath(platform), cookies);
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

    const instance = await puppeteer.launch({
      headless: "new",
      executablePath: CONFIG.chromePath,
      userDataDir: CONFIG.chromeProfileDir,
      args: ["--disable-blink-features=AutomationControlled"],
    });

    browser = instance;
    return instance;
  })();

  try {
    return await browserLaunchPromise;
  } finally {
    browserLaunchPromise = null;
  }
}

async function createPage(platform) {
  const instance = await launchBrowser();
  const page = await instance.newPage();

  await loadCookies(page, platform);
  await page.setViewport({ width: 1366, height: 900 });

  return page;
}

async function scrollPage(page, steps = CONFIG.scraperScrollSteps) {
  for (let i = 0; i < steps; i += 1) {
    await page.evaluate(() => {
      window.scrollBy(0, window.innerHeight * 0.8);
    });

    await delay(CONFIG.scraperScrollDelayMs);
    await delay(randomHumanDelay());
  }
}

function isLoginPage(platform, url = "") {
  if (platform === "instagram") {
    return url.includes("instagram.com/accounts/login");
  }

  return false;
}

async function waitForManualLogin(page, platform, timeoutMs = 180000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (!isLoginPage(platform, page.url())) {
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

async function ensureAuthenticated(page, platform) {
  if (platform === "tiktok" || !isLoginPage(platform, page.url())) {
    return;
  }

  logger.info({ platform }, "login page detected");

  let loggedIn = false;

  try {
    if (platform === "instagram") {
      loggedIn = await tryInstagramCredentialLogin(page);
    }
  } catch (error) {
    logger.warn({ platform, err: error }, "credential login failed");
  }

  if (loggedIn) {
    return;
  }

  logger.info({ platform }, "waiting for manual login");

  const isAuthenticated = await waitForManualLogin(page, platform);
  if (!isAuthenticated) {
    throw new Error(
      `${platform} login timeout. Please sign in manually and rerun.`,
    );
  }
}

async function closePage(page, platform) {
  if (!page) {
    return;
  }

  try {
    if (platform && !page.isClosed()) {
      try {
        await saveCookies(page, platform);
      } catch (error) {
        logger.warn(
          { platform, err: error },
          "failed to save cookies before closing page",
        );
      }
    }
  } finally {
    await page.close().catch(() => {});
  }
}

async function closeBrowser() {
  if (!browser) {
    return;
  }

  await browser.close().catch(() => {});
  browser = null;
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
