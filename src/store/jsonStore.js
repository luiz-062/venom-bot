const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.OFFERS_DATA_DIR || path.join(__dirname, '..', '..', 'data');
const OFFERS_FILE = path.join(DATA_DIR, 'offers.json');
const CONFIG_FILE = path.join(DATA_DIR, 'platform-config.json');
const APP_CONFIG_FILE = path.join(DATA_DIR, 'app-config.json');

const DEFAULT_CONFIG = {
  mercado_livre: {
    platform: 'mercado_livre',
    affiliate_id: '',
    affiliate_tag: '',
    api_token: '',
    // "manual" reflete o achado real (ver docs/nova-versao-mvp-mercadolivre.md
    // seção 5): o usuário confirmou que meli.la é o formato gerado pela sua
    // própria central de afiliados do Mercado Livre. Ainda não é uma fórmula
    // que o sistema possa reproduzir sozinho — o usuário gera lá e cola aqui.
    link_generation_method: 'manual',
    tracking_param_name: '',
    tracking_param_value: '',
    official_url_pattern: 'https://meli.la/<codigo>',
    example_link: '',
    tracking_notes:
      'Gere o link na sua central de afiliados do Mercado Livre (formato confirmado: meli.la/<código>) e cole no campo "Ajustar link afiliado" da oferta. Links de outros afiliados vistos em mensagens-fonte (matt_word, matt_tool, ref) são automaticamente removidos do link limpo para não repassar a atribuição de comissão de terceiros.',
    config_status: 'pendente',
    // meli.la é o formato confirmado pelo usuário como gerado pela central
    // oficial de afiliados do Mercado Livre. mercadolivre.com.br/mercadolibre.com
    // cobrem os links de produto "crus" (não encurtados) que aparecem nas
    // mensagens-fonte.
    domains: ['mercadolivre.com.br', 'mercadolibre.com', 'meli.la'],
    // Campos só de leitura/log, preenchidos pela ação "colar link de exemplo
    // para detectar formato" em /config. NUNCA são lidos por
    // generateAffiliateLink() nem usados para montar um link novo — servem
    // só de auditoria (ver docs/nova-versao-mvp-mercadolivre.md seção 8).
    detected_link_format: '',
    detected_matt_word: '',
    detected_matt_tool: '',
    detected_tag: '',
    sample_link_saved_at: '',
  },
  shopee: {
    platform: 'shopee',
    affiliate_id: '',
    affiliate_tag: '',
    api_token: '',
    link_generation_method: 'nao_configurado',
    tracking_param_name: '',
    tracking_param_value: '',
    official_url_pattern: '',
    example_link: '',
    tracking_notes: '',
    config_status: 'pendente',
    domains: ['shopee.com.br'],
  },
};

// Configuração operacional (não é "por plataforma de oferta" como
// platform-config.json, por isso fica num arquivo próprio): canais do
// Telegram a monitorar/publicar, e os liga/desliga da automação. Os toggles
// default true porque o usuário pediu automação integral por padrão — mas
// existem justamente para poderem ser desligados sem mexer em código.
const DEFAULT_APP_CONFIG = {
  telegram: {
    source_chat_ids: [],
    publish_channel_id: '',
    owner_chat_id: '',
    auto_publish_enabled: true,
    last_session_expired_alert_at: '',
  },
  mercado_livre_automation: {
    auto_generate_enabled: true,
    min_delay_seconds: 45,
    max_delay_seconds: 120,
  },
};

function ensureDataFiles() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(OFFERS_FILE)) {
    writeJson(OFFERS_FILE, []);
  }
  if (!fs.existsSync(CONFIG_FILE)) {
    writeJson(CONFIG_FILE, DEFAULT_CONFIG);
  }
  if (!fs.existsSync(APP_CONFIG_FILE)) {
    writeJson(APP_CONFIG_FILE, DEFAULT_APP_CONFIG);
  }
}

function readJson(file) {
  const raw = fs.readFileSync(file, 'utf8');
  return JSON.parse(raw);
}

function writeJson(file, data) {
  const tmpFile = `${file}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpFile, file);
}

function listOffers() {
  ensureDataFiles();
  return readJson(OFFERS_FILE).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function getOffer(id) {
  return listOffers().find((offer) => offer.id === id) || null;
}

// Nota sobre concorrência: a leitura+mutação+escrita abaixo é inteiramente
// síncrona (fs.*Sync), então dentro de um único processo Node ela já roda
// "até o fim" sem outra chamada conseguir se intercalar no meio (run-to-
// completion) — não existe condição de corrida real aqui enquanto tudo
// (servidor web + workers de automação) rodar no mesmo processo (ver
// src/index.js). O retorno é embrulhado em Promise.resolve() só para os
// chamadores assíncronos poderem usar `await` de forma consistente, sem
// mudar quando o trabalho de fato acontece.
function saveOffer(offer) {
  ensureDataFiles();
  const offers = readJson(OFFERS_FILE);
  const record = {
    id: offer.id || crypto.randomUUID(),
    created_at: offer.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...offer,
  };
  offers.push(record);
  writeJson(OFFERS_FILE, offers);
  return Promise.resolve(record);
}

function updateOffer(id, patch) {
  ensureDataFiles();
  const offers = readJson(OFFERS_FILE);
  const index = offers.findIndex((offer) => offer.id === id);
  if (index === -1) {
    return Promise.resolve(null);
  }
  offers[index] = { ...offers[index], ...patch, updated_at: new Date().toISOString() };
  writeJson(OFFERS_FILE, offers);
  return Promise.resolve(offers[index]);
}

function findDuplicate({ cleanLink, productName, withinDays = 30 }) {
  const cutoff = Date.now() - withinDays * 24 * 60 * 60 * 1000;
  const offers = listOffers().filter((offer) => new Date(offer.created_at).getTime() >= cutoff);

  if (cleanLink) {
    const byLink = offers.find((offer) => offer.clean_link === cleanLink);
    if (byLink) return byLink;
  }
  if (productName) {
    const normalized = productName.trim().toLowerCase();
    const byName = offers.find(
      (offer) => (offer.product_name || '').trim().toLowerCase() === normalized && normalized.length > 0
    );
    if (byName) return byName;
  }
  return null;
}

// Ofertas do Mercado Livre esperando o worker de automação de navegador
// gerar o link afiliado de verdade (ver src/automation/linkGenerationWorker.js).
function listOffersPendingAutomaticLink() {
  return listOffers().filter(
    (offer) => offer.platform === 'mercado_livre' && offer.affiliate_method === 'pendente_automatico' && !offer.affiliate_link
  );
}

// Ofertas com o mínimo de correção técnica pra publicar sozinho: o link abre
// e existe um link afiliado. NÃO é o mesmo que "comissão confirmada" — essa
// checagem continua exigindo confirmação humana no painel oficial (ver
// docs/nova-versao-mvp-mercadolivre.md, seção sobre automação).
function listOffersReadyToPublish() {
  return listOffers().filter(
    (offer) =>
      offer.platform === 'mercado_livre' &&
      offer.link_open_check === 'ok' &&
      Boolean(offer.affiliate_link) &&
      !offer.duplicate_of &&
      offer.publish_status !== 'publicado'
  );
}

function getPlatformConfig(platform) {
  ensureDataFiles();
  const config = readJson(CONFIG_FILE);
  return config[platform] || null;
}

function getAllPlatformConfig() {
  ensureDataFiles();
  return readJson(CONFIG_FILE);
}

function savePlatformConfig(platform, patch) {
  ensureDataFiles();
  const config = readJson(CONFIG_FILE);
  config[platform] = { ...(config[platform] || {}), ...patch, platform };
  writeJson(CONFIG_FILE, config);
  return Promise.resolve(config[platform]);
}

function getAppConfig() {
  ensureDataFiles();
  return readJson(APP_CONFIG_FILE);
}

// Merge raso por seção (telegram / mercado_livre_automation), não no objeto
// inteiro — assim salvar só o toggle do Telegram não apaga os campos da
// automação do Mercado Livre, e vice-versa.
function saveAppConfig(patch) {
  ensureDataFiles();
  const config = readJson(APP_CONFIG_FILE);
  const merged = { ...config };
  Object.entries(patch || {}).forEach(([section, sectionPatch]) => {
    merged[section] = { ...(config[section] || {}), ...sectionPatch };
  });
  writeJson(APP_CONFIG_FILE, merged);
  return Promise.resolve(merged);
}

module.exports = {
  listOffers,
  getOffer,
  saveOffer,
  updateOffer,
  findDuplicate,
  listOffersPendingAutomaticLink,
  listOffersReadyToPublish,
  getPlatformConfig,
  getAllPlatformConfig,
  savePlatformConfig,
  getAppConfig,
  saveAppConfig,
};
