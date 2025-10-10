const venom = require('venom-bot');

const GROUP_CACHE_TTL = 60 * 1000;
let cachedGroups = { map: new Map(), fetchedAt: 0 };

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
    if (state === 'UNPAIRED' || state === 'UNPAIRED_IDLE' || state === 'DISCONNECTED') {
      logger.warn('[WhatsApp] Sessão desconectada. Tentando reconectar...');
      cachedGroups = { map: new Map(), fetchedAt: 0 };
      client.start();
    }
    if (state === 'CONNECTED') {
      cachedGroups = { map: new Map(), fetchedAt: 0 };
    }
  });

  client.onStreamChange((state) => {
    logger.info(`[WhatsApp] Stream: ${state}`);
    if (state === 'DISCONNECTED' || state === 'STOPPED') {
      cachedGroups = { map: new Map(), fetchedAt: 0 };
      client.start();
    }
  });

  return client;
}

function normaliseGroupName(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

async function getGroupMap(client, logger, { forceRefresh = false } = {}) {
  const now = Date.now();
  if (!forceRefresh && cachedGroups.map.size > 0 && now - cachedGroups.fetchedAt < GROUP_CACHE_TTL) {
    return cachedGroups.map;
  }

  try {
    const chats = await client.getAllChats();
    const map = new Map();
    chats
      .filter((chat) => chat.isGroup)
      .forEach((chat) => {
        if (chat && chat.name) {
          map.set(normaliseGroupName(chat.name), chat);
        }
      });

    cachedGroups = { map, fetchedAt: now };
    logger.info(`[WhatsApp] Cache de grupos atualizado com ${map.size} entradas.`);
    return map;
  } catch (error) {
    logger.error('[WhatsApp] Falha ao atualizar lista de grupos:', error);
    if (cachedGroups.map.size > 0 && !forceRefresh) {
      logger.warn('[WhatsApp] Utilizando cache anterior de grupos.');
      return cachedGroups.map;
    }
    throw error;
  }
}

async function sendToGroups({ client, text, imageUrl, groups, logger = console }) {
  if (!client) throw new Error('Cliente WhatsApp não inicializado.');
  if (!Array.isArray(groups) || groups.length === 0) {
    logger.warn('[WhatsApp] Nenhum grupo configurado.');
    return;
  }

  let groupMap;
  try {
    groupMap = await getGroupMap(client, logger);
  } catch (error) {
    logger.error('[WhatsApp] Não foi possível preparar o cache de grupos:', error);
    throw error;
  }

  for (const groupName of groups) {
    const normalized = normaliseGroupName(groupName);
    if (!normalized) {
      continue;
    }

    let chat = groupMap.get(normalized);
    if (!chat) {
      logger.warn(`[WhatsApp] Grupo não encontrado no cache: ${groupName}. Tentando atualizar a lista.`);
      try {
        groupMap = await getGroupMap(client, logger, { forceRefresh: true });
        chat = groupMap.get(normaliseGroupName(groupName));
      } catch (error) {
        logger.error('[WhatsApp] Não foi possível atualizar a lista de grupos:', error);
        continue;
      }
    }

    if (!chat) {
      logger.warn(`[WhatsApp] Grupo não encontrado: ${groupName}`);
      continue;
    }

    await sendMessageToChat({ client, chat, text, imageUrl, logger, groupName });
  }
}

async function sendMessageToChat({ client, chat, text, imageUrl, logger, groupName }) {
  const chatId = chat.id?._serialized || chat.id;
  if (!chatId) {
    logger.warn(`[WhatsApp] ID inválido para o grupo: ${groupName}`);
    return;
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

module.exports = {
  initWhatsapp,
  sendToGroups,
};
