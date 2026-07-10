// src/services/telegram.service.js
const fs = require("fs/promises");
const path = require("path");
const { CONFIG } = require("../config");
const { addJob } = require("./queue.service");
const { formatEventMessage } = require("../formatters/event.formatter");
const { retryOperation } = require("../utils/retry");
const logger = require("../utils/logger");

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRetryAfter(body) {
  const retryAfter = Number(body?.parameters?.retry_after);
  return Number.isFinite(retryAfter) ? retryAfter : 0;
}

async function readJsonFile(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

async function writeJsonFile(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

async function sendTelegramApiRequest(method, payload) {
  const response = await fetch(
    `https://api.telegram.org/bot${CONFIG.telegramBotToken}/${method}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const retryAfterSeconds =
      response.status === 429 ? getRetryAfter(body) : 0;
    if (retryAfterSeconds > 0) {
      await delay(retryAfterSeconds * 1000);
    }

    const error = new Error(
      body?.description ||
        `Telegram request failed with status ${response.status}`,
    );
    error.response = {
      statusCode: response.status,
      body,
    };
    throw error;
  }

  return body;
}

async function getStoredTelegramTargets() {
  return readJsonFile(CONFIG.telegramTargetsPath, []);
}

async function saveTelegramTargets(targets) {
  await writeJsonFile(CONFIG.telegramTargetsPath, targets);
  return targets;
}

function normalizeChatTarget(chat, source = "runtime") {
  return {
    id: String(chat.id),
    type: chat.type || "",
    title: chat.title || "",
    username: chat.username || "",
    source,
    registeredAt: new Date().toISOString(),
  };
}

async function upsertTelegramTarget(chat, source = "runtime") {
  const targets = await getStoredTelegramTargets();
  const normalized = normalizeChatTarget(chat, source);

  const nextTargets = targets.filter(
    (target) => String(target.id) !== String(normalized.id),
  );
  nextTargets.push(normalized);

  await saveTelegramTargets(nextTargets);
  return normalized;
}

async function getTelegramTargetChats() {
  const targets = [];
  const seen = new Set();

  if (CONFIG.telegramChatId) {
    const envTarget = {
      id: String(CONFIG.telegramChatId),
      type: "private",
      title: "",
      username: "",
      source: "env",
      registeredAt: null,
    };
    targets.push(envTarget);
    seen.add(envTarget.id);
  }

  const storedTargets = await getStoredTelegramTargets();
  for (const target of storedTargets) {
    const id = String(target?.id || "");
    if (!id || seen.has(id)) {
      continue;
    }
    targets.push({
      id,
      type: target.type || "",
      title: target.title || "",
      username: target.username || "",
      source: target.source || "stored",
      registeredAt: target.registeredAt || null,
    });
    seen.add(id);
  }

  return targets;
}

async function getTelegramTargetChatIds() {
  const targets = await getTelegramTargetChats();
  return targets.map((target) => target.id);
}

async function getTelegramUpdatesState() {
  return readJsonFile(CONFIG.telegramUpdatesStatePath, { offset: 0 });
}

async function saveTelegramUpdatesState(offset) {
  await writeJsonFile(CONFIG.telegramUpdatesStatePath, { offset });
}

async function getTelegramUpdates() {
  const state = await getTelegramUpdatesState();

  const result = await sendTelegramApiRequest("getUpdates", {
    offset: state.offset,
    timeout: 0,
    allowed_updates: ["message"],
  });

  const updates = Array.isArray(result?.result) ? result.result : [];
  let nextOffset = state.offset;

  for (const update of updates) {
    if (typeof update?.update_id === "number") {
      nextOffset = Math.max(nextOffset, update.update_id + 1);
    }
  }

  if (nextOffset !== state.offset) {
    await saveTelegramUpdatesState(nextOffset);
  }

  return updates;
}

function isStartCommand(text = "") {
  const value = text.trim();
  return /^\/start(?:@[A-Za-z0-9_]+)?(?:\s+.*)?$/.test(value);
}

function extractStartChatRegistration(update) {
  const message = update?.message;
  const chat = message?.chat;
  const text = message?.text;

  if (!chat || !text) {
    return null;
  }

  const supportedTypes = new Set(["private", "group", "supergroup"]);
  if (!supportedTypes.has(chat.type)) {
    return null;
  }

  if (!isStartCommand(text)) {
    return null;
  }

  return {
    id: chat.id,
    type: chat.type,
    title: chat.title || "",
    username: chat.username || "",
  };
}

async function syncTelegramTargetsFromUpdates() {
  const updates = await getTelegramUpdates();
  const registeredTargets = [];

  for (const update of updates) {
    const chat = extractStartChatRegistration(update);
    if (!chat) {
      continue;
    }

    const saved = await upsertTelegramTarget(chat, "telegram-start");
    registeredTargets.push(saved);
  }

  if (registeredTargets.length > 0) {
    logger.info(
      {
        targets: registeredTargets.map((target) => ({
          chatId: target.id,
          chatType: target.type,
          title: target.title,
          username: target.username,
        })),
      },
      "telegram targets registered from /start",
    );
  }

  return registeredTargets;
}

async function sendTelegramMessageToChat(chatId, message) {
  return sendTelegramApiRequest("sendMessage", {
    chat_id: chatId,
    text: message,
    parse_mode: "MarkdownV2",
    disable_web_page_preview: true,
  });
}

async function sendTelegramPhotoToChat(chatId, event, message) {
  const caption =
    message.length <= 1024
      ? message
      : formatEventMessage({
          ...event,
          description: "",
        });

  const photoResult = await sendTelegramApiRequest("sendPhoto", {
    chat_id: chatId,
    photo: event.imageUrl,
    caption,
    parse_mode: "MarkdownV2",
  });

  if (caption !== message) {
    await sendTelegramMessageToChat(chatId, message);
  }

  return photoResult;
}

async function sendTelegramMessage(message) {
  const chatIds = await getTelegramTargetChatIds();

  if (!chatIds.length) {
    throw new Error(
      "Telegram chat ID is not configured. Send /start in the target DM or group first, or set TELEGRAM_CHAT_ID.",
    );
  }

  const results = [];
  for (const chatId of chatIds) {
    const result = await sendTelegramMessageToChat(chatId, message);
    results.push(result);
  }

  return results;
}

async function sendTelegramPhoto(event, message) {
  const chatIds = await getTelegramTargetChatIds();

  if (!chatIds.length) {
    throw new Error(
      "Telegram chat ID is not configured. Send /start in the target DM or group first, or set TELEGRAM_CHAT_ID.",
    );
  }

  const results = [];
  for (const chatId of chatIds) {
    const result = await sendTelegramPhotoToChat(chatId, event, message);
    results.push(result);
  }

  return results;
}

async function sendEvent(event) {
  const message = formatEventMessage(event);

  return addJob(() =>
    retryOperation(
      () =>
        event.imageUrl
          ? sendTelegramPhoto(event, message)
          : sendTelegramMessage(message),
      {
        retries: 2,
        minTimeout: 2000,
      },
    ),
  );
}

module.exports = {
  sendEvent,
  syncTelegramTargetsFromUpdates,
  getTelegramTargetChats,
  getTelegramTargetChatIds,
};