require('dotenv').config();

const readline = require('readline');
const { setTimeout: sleep } = require('timers/promises');

const { initWhatsapp, sendToGroups } = require('./whatsappBot');
const { searchItems, generateAffiliateLink, buildProductUrl } = require('./shopeeApi');
const { getDb, alreadySent, markSent } = require('./database');

const REQUIRED_ENV = [
  'SHOPEE_PARTNER_ID',
  'SHOPEE_PARTNER_KEY',
  'SHOPEE_SHOP_ID',
  'SHOPEE_AFFILIATE_ID',
  'WHATSAPP_GROUPS',
];

const MIN_DISCOUNT_PERCENT = Number(process.env.MIN_DISCOUNT_PERCENT || 0);
const MAX_RESULTS = Number(process.env.MAX_RESULTS || 20);
const INTERVAL_SECONDS = Number(process.env.SEND_INTERVAL_SECONDS || 600);
const SEND_IMAGES = String(process.env.SEND_IMAGES || 'false').toLowerCase() === 'true';
const KEYWORDS = parseKeywords(process.env.SEARCH_KEYWORDS || '');
const WHATSAPP_GROUPS = parseGroups(process.env.WHATSAPP_GROUPS || '[]');
const REGION = (process.env.SHOPEE_REGION || 'br').toLowerCase();

let paused = false;
let shouldExit = false;
let whatsappClient;
let database;

function ensureEnv() {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key] || process.env[key].length === 0);
  if (missing.length > 0) {
    throw new Error(`Variáveis de ambiente ausentes: ${missing.join(', ')}`);
  }
  if (KEYWORDS.length === 0) {
    throw new Error('Configure ao menos uma palavra-chave em SEARCH_KEYWORDS.');
  }
  if (!Array.isArray(WHATSAPP_GROUPS) || WHATSAPP_GROUPS.length === 0) {
    throw new Error('Configure ao menos um grupo no WHATSAPP_GROUPS.');
  }
}

function parseKeywords(value) {
  return value
    .split(',')
    .map((keyword) => keyword.trim())
    .filter((keyword) => keyword.length > 0);
}

function parseGroups(value) {
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map((name) => String(name));
    }
  } catch (error) {
    // fallthrough
  }
  return value
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}

function formatPrice(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function normaliseShopeePrice(raw) {
  const number = Number(raw || 0);
  if (Number.isNaN(number)) return 0;
  if (number === 0) return 0;
  if (number < 10000) {
    return number;
  }
  return number / 100000;
}

function buildImageUrl(imageId) {
  if (!imageId) return null;
  const host = REGION === 'br' ? 'https://cf.shopee.com.br/file/' : 'https://cf.shopee.com/file/';
  return `${host}${imageId}`;
}

function createMessage({ name, originalPrice, currentPrice, affiliateLink }) {
  const oldPriceFormatted = formatPrice(originalPrice);
  const newPriceFormatted = formatPrice(currentPrice);
  return `🛒 ${name}\n💸 De R$${oldPriceFormatted} → R$${newPriceFormatted}\n🔗 ${affiliateLink}\n#Shopee #Ofertas #PromoDeAmiga`;
}

function setupConsoleControls() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.on('line', (input) => {
    const command = input.trim().toLowerCase();
    if (command === 'p') {
      paused = !paused;
      console.log(paused ? '[Bot] Envio de mensagens PAUSADO.' : '[Bot] Envio de mensagens RESUMIDO.');
    } else if (command === 'q') {
      console.log('[Bot] Encerrando bot...');
      shouldExit = true;
      rl.close();
    } else if (command.length > 0) {
      console.log('[Bot] Comandos disponíveis: p (pausar/retomar), q (sair)');
    }
  });

  process.on('SIGINT', () => {
    console.log('\n[Bot] Recebido SIGINT. Encerrando...');
    shouldExit = true;
    rl.close();
  });
}

async function shutdown() {
  if (whatsappClient) {
    try {
      await whatsappClient.close();
      console.log('[Bot] Sessão WhatsApp encerrada.');
    } catch (error) {
      console.error('[Bot] Erro ao encerrar sessão WhatsApp:', error);
    }
  }

  if (database) {
    await new Promise((resolve) => {
      database.close((err) => {
        if (err) {
          console.error('[Bot] Erro ao fechar banco de dados:', err);
        } else {
          console.log('[Bot] Banco de dados fechado.');
        }
        resolve();
      });
    });
  }
}

async function processKeyword(keyword) {
  console.log(`[Bot] Buscando ofertas para "${keyword}"...`);
  let items;
  try {
    items = await searchItems({ keyword, limit: MAX_RESULTS, offset: 0 });
  } catch (error) {
    console.error(`[Bot] Erro ao buscar itens para "${keyword}":`, error.response?.data || error.message);
    return false;
  }

  console.log(`[Bot] ${items.length} itens retornados para "${keyword}".`);

  for (const item of items) {
    if (shouldExit) {
      break;
    }
    while (paused && !shouldExit) {
      await sleep(1000);
    }
    if (shouldExit) {
      break;
    }

    const details = item.item_basic || item;
    const itemId = details.itemid || details.item_id || item.item_id;
    const shopId = details.shopid || details.shop_id || item.shop_id;
    const name = details.name || item.name;

    if (!itemId || !shopId || !name) {
      continue;
    }

    const uniqueId = `${shopId}-${itemId}`;
    let duplicate;
    try {
      duplicate = await alreadySent(database, uniqueId);
    } catch (error) {
      console.error(`[Bot] Erro ao verificar histórico para item ${uniqueId}:`, error);
      duplicate = false;
    }
    if (duplicate) {
      continue;
    }

    const price = normaliseShopeePrice(details.price || details.item_price || 0);
    const originalPrice = normaliseShopeePrice(details.price_before_discount || details.original_price || price);
    const discountPercent = originalPrice > 0 ? ((originalPrice - price) / originalPrice) * 100 : 0;

    if (discountPercent < MIN_DISCOUNT_PERCENT) {
      continue;
    }

    const productUrl = details.item_link || buildProductUrl({ shopId, itemId });
    let affiliateLink;
    try {
      affiliateLink = await generateAffiliateLink({ targetUrl: productUrl });
    } catch (error) {
      console.error('[Bot] Erro ao gerar link de afiliado:', error.response?.data || error.message);
      affiliateLink = productUrl;
    }

    const message = createMessage({
      name,
      originalPrice,
      currentPrice: price,
      affiliateLink,
    });

    const imageId = details.image || (Array.isArray(details.images) ? details.images[0] : null);
    const imageUrl = SEND_IMAGES ? buildImageUrl(imageId) : null;

    try {
      await sendToGroups({ client: whatsappClient, text: message, imageUrl, groups: WHATSAPP_GROUPS, logger: console });
      await markSent(database, { item_id: uniqueId, name, affiliate_link: affiliateLink });
      console.log(`[Bot] Oferta enviada e registrada (${uniqueId}).`);
    } catch (error) {
      console.error('[Bot] Erro ao enviar oferta:', error.message || error);
    }

    if (shouldExit) {
      break;
    }

    console.log(`[Bot] Aguardando ${INTERVAL_SECONDS} segundos antes da próxima oferta...`);
    await sleep(INTERVAL_SECONDS * 1000);
  }

  return true;
}

async function run() {
  ensureEnv();
  setupConsoleControls();

  database = await getDb();
  console.log('[Bot] Banco de dados carregado.');

  whatsappClient = await initWhatsapp({ logger: console });
  console.log('[Bot] WhatsApp iniciado. Utilize o QR Code exibido para autenticação.');
  console.log('[Bot] Comandos: p = pausar/retomar, q = sair');

  while (!shouldExit) {
    for (const keyword of KEYWORDS) {
      if (shouldExit) {
        break;
      }
      await processKeyword(keyword);
    }

    if (shouldExit) {
      break;
    }

    if (!paused) {
      console.log(`[Bot] Ciclo concluído. Aguardando ${Math.max(INTERVAL_SECONDS, 60)} segundos para nova busca.`);
    } else {
      console.log('[Bot] Bot em pausa. Aguardando retomada...');
    }

    let elapsed = 0;
    const waitTime = Math.max(INTERVAL_SECONDS, 60) * 1000;
    while (elapsed < waitTime && !shouldExit) {
      if (!paused) {
        const step = Math.min(5000, waitTime - elapsed);
        await sleep(step);
        elapsed += step;
      } else {
        await sleep(1000);
      }
    }
  }

  await shutdown();
  process.exit(0);
}

run().catch(async (error) => {
  console.error('[Bot] Falha fatal:', error);
  await shutdown();
  process.exit(1);
});
