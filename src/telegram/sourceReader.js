const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { NewMessage } = require('telegram/events');
const store = require('../store/jsonStore');
const { processOffer: defaultProcessOffer } = require('../lib/pipeline');

// GramJS documents automatic reconnection at the transport level, but that
// hasn't been verified live from this environment (no real Telegram access
// here) — this interval is a belt-and-suspenders check on top of it, not a
// replacement for it. Much lighter than the old venom-bot CONFLICT/
// reconnect dance (legacy/shopee-whatsapp-bot/whatsappBot.js) since MTProto
// user sessions don't have WhatsApp Web's single-active-session semantics —
// that assumption also needs verifying at implementation time, not trusted.
const RECONNECT_CHECK_INTERVAL_MS = 60 * 1000;

function normalizeChatId(id) {
  return String(id ?? '').trim();
}

/**
 * Handles one GramJS NewMessage event: if the message has text AND comes
 * from one of the configured source chats, runs it through processOffer().
 * Kept separate from start() so it's testable against a fake event object
 * without any real GramJS connection. A message from an unconfigured/empty
 * source_chat_ids list is skipped, not processed — nothing should be
 * ingested from an arbitrary chat before the user explicitly lists it in
 * /config/telegram.
 */
async function handleNewMessage(event, { sourceChatIds = [], processOffer = defaultProcessOffer } = {}) {
  const message = event?.message;
  const text = message?.message;
  if (!text) {
    return null;
  }

  // TODO(setup, live verification): confirm this actually yields the right
  // chat identifier shape for both regular groups and channels once a real
  // session exists — GramJS message objects expose chatId/peerId in a few
  // different forms depending on chat type.
  const chatId = normalizeChatId(message.chatId ?? message.peerId?.channelId ?? message.peerId?.chatId ?? '');
  const allowed = sourceChatIds.map(normalizeChatId);
  if (!allowed.includes(chatId)) {
    return null;
  }

  try {
    return await processOffer(text);
  } catch (error) {
    console.error('[sourceReader] falha ao processar mensagem de', chatId, error);
    return null;
  }
}

/**
 * Connects to Telegram as the user's own account (MTProto userbot session —
 * see scripts/telegramLogin.js for the one-time interactive login that
 * produces TELEGRAM_SESSION_STRING) and listens for new messages in the
 * configured source chats, feeding each one into processOffer(). Not
 * auto-run on require — call start() explicitly (see src/index.js).
 */
function start({ processOffer = defaultProcessOffer } = {}) {
  const apiId = Number(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH;
  const sessionString = process.env.TELEGRAM_SESSION_STRING;

  if (!apiId || !apiHash || !sessionString) {
    throw new Error(
      'TELEGRAM_API_ID/TELEGRAM_API_HASH/TELEGRAM_SESSION_STRING não configurados — rode "npm run telegram-login" primeiro.'
    );
  }

  const client = new TelegramClient(new StringSession(sessionString), apiId, apiHash, { connectionRetries: 5 });
  let stopped = false;
  let reconnectInterval = null;

  async function boot() {
    await client.connect();
    console.log('[sourceReader] conectado ao Telegram.');

    client.addEventHandler(async (event) => {
      const appConfig = store.getAppConfig();
      await handleNewMessage(event, { sourceChatIds: appConfig.telegram.source_chat_ids, processOffer });
    }, new NewMessage({}));

    reconnectInterval = setInterval(async () => {
      if (stopped) return;
      if (!client.connected) {
        console.warn('[sourceReader] cliente desconectado, tentando reconectar...');
        try {
          await client.connect();
        } catch (error) {
          console.error('[sourceReader] falha ao reconectar:', error.message);
        }
      }
    }, RECONNECT_CHECK_INTERVAL_MS);
  }

  boot().catch((error) => {
    console.error('[sourceReader] falha fatal ao iniciar:', error);
  });

  return {
    stop() {
      stopped = true;
      if (reconnectInterval) {
        clearInterval(reconnectInterval);
      }
      client.disconnect().catch(() => {});
    },
  };
}

module.exports = { start, handleNewMessage };
