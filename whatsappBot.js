const venom = require('venom-bot');

async function initWhatsapp({ sessionName = 'shopee-affiliate-bot', logger = console } = {}) {
  logger.info('[WhatsApp] Iniciando sessão...');
  const client = await venom.create({
    session: sessionName,
    multidevice: true,
    headless: true,
    logQR: true,
    disableSpins: true,
  });

  client.onStateChange((state) => {
    logger.info(`[WhatsApp] Estado atual: ${state}`);
    if (state === 'CONFLICT') {
      client.useHere();
    }
    if (state === 'UNPAIRED' || state === 'UNPAIRED_IDLE') {
      logger.warn('[WhatsApp] Sessão desconectada. Tentando reconectar...');
      client.start();
    }
  });

  client.onStreamChange((state) => {
    logger.info(`[WhatsApp] Stream: ${state}`);
  });

  return client;
}

async function sendToGroups({ client, text, imageUrl, groups, logger = console }) {
  if (!client) throw new Error('Cliente WhatsApp não inicializado.');
  if (!Array.isArray(groups) || groups.length === 0) {
    logger.warn('[WhatsApp] Nenhum grupo configurado.');
    return;
  }

  let chats;
  try {
    chats = await client.getAllChats();
  } catch (error) {
    logger.error('[WhatsApp] Falha ao obter a lista de grupos:', error);
    throw error;
  }

  const groupMap = new Map();
  chats
    .filter((chat) => chat.isGroup)
    .forEach((chat) => {
      if (chat && chat.name) {
        groupMap.set(chat.name.toLowerCase(), chat);
      }
    });

  for (const groupName of groups) {
    const normalized = String(groupName || '').trim().toLowerCase();
    if (!normalized) {
      continue;
    }

    const chat = groupMap.get(normalized);
    if (!chat) {
      logger.warn(`[WhatsApp] Grupo não encontrado: ${groupName}`);
      continue;
    }

    const chatId = chat.id?._serialized || chat.id;
    if (!chatId) {
      logger.warn(`[WhatsApp] ID inválido para o grupo: ${groupName}`);
      continue;
    }

    try {
      if (imageUrl) {
        if (typeof client.sendImageFromUrl === 'function') {
          await client.sendImageFromUrl(chatId, imageUrl, 'oferta.jpg', text);
        } else if (typeof client.sendFileFromUrl === 'function') {
          await client.sendFileFromUrl(chatId, imageUrl, 'oferta.jpg', text);
        } else {
          logger.warn('[WhatsApp] Método para envio de imagem não disponível. Enviando texto.');
          await client.sendText(chatId, text);
        }
      } else {
        await client.sendText(chatId, text);
      }
      logger.info(`[WhatsApp] Mensagem enviada para ${groupName}`);
    } catch (error) {
      logger.error(`[WhatsApp] Erro ao enviar mensagem para ${groupName}:`, error.message || error);
    }
  }
}

module.exports = {
  initWhatsapp,
  sendToGroups,
};
