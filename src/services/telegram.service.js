// src/services/telegram.service.js
const fs = require("fs/promises");
const path = require("path");
const { CONFIG } = require("../config");
const { addJob } = require("./queue.service");
const {
  formatEventMessage,
  formatPhotoCaption,
} = require("../formatters/event.formatter");
const { retryOperation } = require("../utils/retry");
const { isExpiredEventDate } = require("../utils/date");
const logger = require("../utils/logger");

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRetryAfter(body) {
  const retryAfter = Number(body?.parameters?.retry_after);
  return Number.isFinite(retryAfter) ? retryAfter : 0;
}

function isValidRemotePhotoUrl(value = "") {
  try {
    const url = new URL(String(value).trim());
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.hostname.length > 0
    );
  } catch {
    return false;
  }
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
      body: JSON.stringify(payload || {}),
    },
  );

  const body = await response.json().catch(() => ({}));

  if (!response.ok || body?.ok === false) {
    const statusCode = response.status || 500;
    const retryAfterSeconds = statusCode === 429 ? getRetryAfter(body) : 0;

    if (retryAfterSeconds > 0) {
      await delay(retryAfterSeconds * 1000);
    }

    const error = new Error(
      body?.description || `Telegram request failed with status ${statusCode}`,
    );

    error.response = {
      statusCode,
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
    (target) => String(target.id) !== normalized.id,
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
      type: "unknown",
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

async function requireTelegramChatIds() {
  const chatIds = await getTelegramTargetChatIds();

  if (chatIds.length === 0) {
    throw new Error(
      "Telegram chat ID is not configured. Send /start or any message in the target DM/group first, send a message in the target channel after adding the bot, or set TELEGRAM_CHAT_ID.",
    );
  }

  return chatIds;
}

async function getTelegramUpdatesState() {
  return readJsonFile(CONFIG.telegramUpdatesStatePath, { offset: 0 });
}

async function saveTelegramUpdatesState(offset) {
  await writeJsonFile(CONFIG.telegramUpdatesStatePath, { offset });
}

function isWebhookConflictError(error) {
  const description = String(
    error?.response?.body?.description || error?.message || "",
  ).toLowerCase();

  return description.includes(
    "can't use getupdates method while webhook is active",
  );
}

async function getTelegramWebhookInfo() {
  const result = await sendTelegramApiRequest("getWebhookInfo", {});
  return result?.result || {};
}

async function deleteTelegramWebhook(options = {}) {
  const { dropPendingUpdates = false } = options;

  return sendTelegramApiRequest("deleteWebhook", {
    drop_pending_updates: dropPendingUpdates,
  });
}

async function ensurePollingReady() {
  try {
    const webhookInfo = await getTelegramWebhookInfo();
    const activeWebhookUrl = String(webhookInfo?.url || "").trim();

    if (activeWebhookUrl) {
      logger.warn(
        {
          webhookUrl: activeWebhookUrl,
          pendingUpdateCount: webhookInfo?.pending_update_count || 0,
        },
        "telegram webhook is active, deleting webhook so getUpdates can be used",
      );

      await deleteTelegramWebhook({ dropPendingUpdates: false });
    }
  } catch (error) {
    logger.warn(
      {
        error: error?.message,
      },
      "failed to verify or delete telegram webhook before polling",
    );
  }
}

async function getTelegramUpdates() {
  const state = await getTelegramUpdatesState();

  try {
    const result = await sendTelegramApiRequest("getUpdates", {
      offset: state.offset,
      timeout: 10,
      allowed_updates: [
        "message",
        "channel_post",
        "my_chat_member",
        "chat_member",
      ],
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
  } catch (error) {
    if (isWebhookConflictError(error)) {
      logger.warn(
        "telegram getUpdates conflict detected, attempting to delete webhook",
      );

      await ensurePollingReady();

      const retryResult = await sendTelegramApiRequest("getUpdates", {
        offset: state.offset,
        timeout: 10,
        allowed_updates: [
          "message",
          "channel_post",
          "my_chat_member",
          "chat_member",
        ],
      });

      const updates = Array.isArray(retryResult?.result)
        ? retryResult.result
        : [];

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

    throw error;
  }
}

function isStartCommand(text = "") {
  return /^\/start(?:@[A-Za-z0-9_]+)?(?:\s+.*)?$/.test(text.trim());
}

function extractChatFromMessageContainer(container) {
  const chat = container?.chat;

  if (!chat) {
    return null;
  }

  if (!["private", "group", "supergroup", "channel"].includes(chat.type)) {
    return null;
  }

  return {
    id: chat.id,
    type: chat.type,
    title: chat.title || "",
    username: chat.username || "",
  };
}

function extractChatFromMembershipUpdate(updatePart) {
  const chat = updatePart?.chat;

  if (!chat) {
    return null;
  }

  if (!["private", "group", "supergroup", "channel"].includes(chat.type)) {
    return null;
  }

  return {
    id: chat.id,
    type: chat.type,
    title: chat.title || "",
    username: chat.username || "",
  };
}

function extractChatRegistration(update) {
  const message = update?.message;
  const channelPost = update?.channel_post;
  const myChatMember = update?.my_chat_member;
  const chatMember = update?.chat_member;

  if (message) {
    const chat = extractChatFromMessageContainer(message);
    if (chat) {
      return {
        ...chat,
        sourceEvent: isStartCommand(message?.text || "")
          ? "message-start"
          : "message",
      };
    }
  }

  if (channelPost) {
    const chat = extractChatFromMessageContainer(channelPost);
    if (chat) {
      return {
        ...chat,
        sourceEvent: "channel-post",
      };
    }
  }

  if (myChatMember) {
    const chat = extractChatFromMembershipUpdate(myChatMember);
    if (chat) {
      return {
        ...chat,
        sourceEvent: "my-chat-member",
      };
    }
  }

  if (chatMember) {
    const chat = extractChatFromMembershipUpdate(chatMember);
    if (chat) {
      return {
        ...chat,
        sourceEvent: "chat-member",
      };
    }
  }

  return null;
}

async function syncTelegramTargetsFromUpdates() {
  await ensurePollingReady();

  const updates = await getTelegramUpdates();
  const registeredTargets = [];
  const seen = new Set();

  for (const update of updates) {
    const chat = extractChatRegistration(update);

    if (!chat) {
      continue;
    }

    const dedupeKey = String(chat.id);
    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);

    const saved = await upsertTelegramTarget(
      chat,
      `telegram-${chat.sourceEvent}`,
    );
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
          source: target.source,
        })),
      },
      "telegram targets registered from updates",
    );
  }

  return registeredTargets;
}

async function sendToChats(builder) {
  const chatIds = await requireTelegramChatIds();
  const results = [];

  for (const chatId of chatIds) {
    results.push(await builder(chatId));
  }

  return results;
}

async function sendTelegramMessage(message) {
  return sendToChats((chatId) =>
    sendTelegramApiRequest("sendMessage", {
      chat_id: chatId,
      text: message,
      parse_mode: "MarkdownV2",
      disable_web_page_preview: true,
    }),
  );
}

async function sendTelegramPhoto(event) {
  const caption = formatPhotoCaption(event, 220);

  return sendToChats((chatId) =>
    sendTelegramApiRequest("sendPhoto", {
      chat_id: chatId,
      photo: String(event.imageUrl || "").trim(),
      caption,
      parse_mode: "MarkdownV2",
    }),
  );
}

/**
 * Batas toleransi: kalau eventDate sudah lewat lebih dari N hari dari HARI INI,
 * event dianggap "stale" — kemungkinan besar caption organizer typo tahun atau
 * reuse flyer lama (contoh nyata: caption bertuliskan "29-08-2025" padahal
 * di-scrape tanggal 2026). Event tetap disimpan ke SQLite oleh storage layer
 * (fungsi ini TIDAK mengubah database), tapi tidak dikirim sebagai notifikasi
 * baru ke Telegram karena akan membingungkan user ("post baru" tapi tanggalnya
 * sudah lewat setahun).
 *
 * Kalau eventDate tidak diketahui (null, misal caption TikTok kosong), event
 * tetap dianggap layak kirim karena kita tidak punya dasar untuk menilai basi.
 */
const TELEGRAM_STALE_GRACE_DAYS = 3;

function isStaleEventDate(event) {
  if (!event.eventDate) {
    return false;
  }

  return isExpiredEventDate(event.eventDate, TELEGRAM_STALE_GRACE_DAYS);
}

async function sendEvent(event) {
  if (isStaleEventDate(event)) {
    logger.warn(
      {
        platform: event.platform,
        postId: event.postId,
        eventDate: event.eventDate,
      },
      "skip telegram delivery: eventDate already expired, likely stale caption",
    );
    return { skipped: true, reason: "stale-event-date" };
  }

  const message = formatEventMessage(event);

  return addJob(() =>
    retryOperation(
      async () => {
        if (isValidRemotePhotoUrl(event.imageUrl)) {
          try {
            return await sendTelegramPhoto(event);
          } catch (error) {
            logger.warn(
              {
                platform: event.platform,
                postId: event.postId,
                imageUrl: event.imageUrl,
                error: error?.message,
              },
              "sendPhoto failed, falling back to sendMessage",
            );
          }
        }

        return sendTelegramMessage(message);
      },
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
  getTelegramWebhookInfo,
  deleteTelegramWebhook,
  ensurePollingReady,
};
