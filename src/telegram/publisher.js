const { Bot, GrammyError } = require('grammy');
const store = require('../store/jsonStore');

// Telegram's Bot API allows roughly 1 message/sec sustained per chat before
// 429s become likely — this queue enforces a minimum gap between sends
// regardless of how many callers ask to send at once.
const MIN_INTERVAL_MS = 1100;

let cachedBot = null;
function getBot() {
  if (!cachedBot) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN não configurado — veja .env.example.');
    }
    cachedBot = new Bot(token);
  }
  return cachedBot;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function defaultSendMessage(chatId, text) {
  return getBot().api.sendMessage(chatId, text);
}

// Queue design note: `queueTail` must never stay rejected, or every future
// call would skip its work (a promise chain propagates rejection forward).
// Each call's own success/failure is preserved in the promise returned to
// its caller; `queueTail` itself always resolves so the chain keeps moving.
let queueTail = Promise.resolve();
let lastSendAt = 0;

function enqueueSend(fn) {
  const run = async () => {
    const wait = Math.max(0, MIN_INTERVAL_MS - (Date.now() - lastSendAt));
    if (wait > 0) {
      await sleep(wait);
    }
    lastSendAt = Date.now();
    return fn();
  };
  const result = queueTail.then(run, run);
  queueTail = result.then(
    () => {},
    () => {}
  );
  return result;
}

async function sendWithRetry(sendFn) {
  try {
    return await sendFn();
  } catch (error) {
    if (error instanceof GrammyError && error.error_code === 429) {
      const retryAfterSeconds = error.parameters?.retry_after || 1;
      await sleep(retryAfterSeconds * 1000);
      return sendFn(); // single retry; a second failure bubbles up to the caller
    }
    throw error;
  }
}

/**
 * Sends the offer's recommended Telegram copy to the configured publish
 * channel. `sendMessage` is injectable for tests; defaults to the real
 * grammY bot.
 */
async function publishOffer(offer, { sendMessage = defaultSendMessage } = {}) {
  const config = store.getAppConfig();
  const channelId = config.telegram.publish_channel_id;
  if (!channelId) {
    throw new Error('Nenhum canal de publicação configurado (telegram.publish_channel_id em /config/telegram).');
  }
  return enqueueSend(() => sendWithRetry(() => sendMessage(channelId, offer.recommended_copy_telegram)));
}

/**
 * DMs the configured owner chat with an operational alert (e.g. Mercado
 * Livre session expired). Never throws for a missing destination — just
 * logs loudly, since an alert about a broken alert channel isn't useful.
 */
async function sendAlert(text, { sendMessage = defaultSendMessage } = {}) {
  const config = store.getAppConfig();
  const ownerChatId = config.telegram.owner_chat_id;
  if (!ownerChatId) {
    console.warn('[publisher] alerta sem destinatário configurado (owner_chat_id em /config/telegram):', text);
    return;
  }
  return enqueueSend(() => sendWithRetry(() => sendMessage(ownerChatId, text)));
}

module.exports = { publishOffer, sendAlert };
