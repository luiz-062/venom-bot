const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.OFFERS_DATA_DIR || path.join(__dirname, '..', '..', 'data');
const OFFERS_FILE = path.join(DATA_DIR, 'offers.json');
const CONFIG_FILE = path.join(DATA_DIR, 'platform-config.json');

const DEFAULT_CONFIG = {
  mercado_livre: {
    platform: 'mercado_livre',
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
    // meli.la é o encurtador usado nas mensagens reais de oferta do Mercado
    // Livre observadas em teste; ainda assim, confirme oficialmente que o
    // domínio pertence à plataforma antes de confiar nele em produção.
    domains: ['mercadolivre.com.br', 'mercadolibre.com', 'meli.la'],
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

function ensureDataFiles() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(OFFERS_FILE)) {
    writeJson(OFFERS_FILE, []);
  }
  if (!fs.existsSync(CONFIG_FILE)) {
    writeJson(CONFIG_FILE, DEFAULT_CONFIG);
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
  return record;
}

function updateOffer(id, patch) {
  ensureDataFiles();
  const offers = readJson(OFFERS_FILE);
  const index = offers.findIndex((offer) => offer.id === id);
  if (index === -1) {
    return null;
  }
  offers[index] = { ...offers[index], ...patch, updated_at: new Date().toISOString() };
  writeJson(OFFERS_FILE, offers);
  return offers[index];
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
  return config[platform];
}

module.exports = {
  listOffers,
  getOffer,
  saveOffer,
  updateOffer,
  findDuplicate,
  getPlatformConfig,
  getAllPlatformConfig,
  savePlatformConfig,
};
