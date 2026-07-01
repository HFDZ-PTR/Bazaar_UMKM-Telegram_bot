const { CONFIG } = require("../config");
const { addJob } = require("./queue.service");
const { formatEventMessage } = require("../formatters/event.formatter");
const { retryOperation } = require("../utils/retry");

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRetryAfter(body) {
  const retryAfter = Number(body?.parameters?.retry_after);
  return Number.isFinite(retryAfter) ? retryAfter : 0;
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
    const retryAfterSeconds = response.status === 429 ? getRetryAfter(body) : 0;
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

async function sendTelegramMessage(message) {
  return sendTelegramApiRequest("sendMessage", {
    chat_id: CONFIG.telegramChatId,
    text: message,
    parse_mode: "MarkdownV2",
    disable_web_page_preview: true,
  });
}

async function sendTelegramPhoto(event, message) {
  const caption =
    message.length <= 1024
      ? message
      : formatEventMessage({
          ...event,
          description: "",
        });

  const photoResult = await sendTelegramApiRequest("sendPhoto", {
    chat_id: CONFIG.telegramChatId,
    photo: event.imageUrl,
    caption,
    parse_mode: "MarkdownV2",
  });

  if (caption !== message) {
    await sendTelegramMessage(message);
  }

  return photoResult;
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
};
