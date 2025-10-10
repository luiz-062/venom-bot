const axios = require('axios');
const crypto = require('crypto');

const PARTNER_ID = process.env.SHOPEE_PARTNER_ID;
const PARTNER_KEY = process.env.SHOPEE_PARTNER_KEY;
const SHOP_ID = process.env.SHOPEE_SHOP_ID;
const ACCESS_TOKEN = process.env.SHOPEE_ACCESS_TOKEN || '';
const REGION = (process.env.SHOPEE_REGION || 'br').toLowerCase();
const AFFILIATE_ID = process.env.SHOPEE_AFFILIATE_ID;
const AFF_SOURCE = process.env.AFF_SOURCE || 'whatsapp';
const AFF_SUB = process.env.AFF_SUB || 'promo_de_amiga';
const UTM_CAMPAIGN = process.env.UTM_CAMPAIGN || 'grupo_whatsapp';

const REGION_HOSTS = {
  br: 'https://partner.shopee.com.br',
  sg: 'https://partner.shopeemobile.com',
  id: 'https://partner.shopeemobile.com',
  my: 'https://partner.shopeemobile.com',
  th: 'https://partner.shopeemobile.com',
  vn: 'https://partner.shopeemobile.com',
  ph: 'https://partner.shopeemobile.com',
};

const REGION_DOMAINS = {
  br: 'https://shopee.com.br',
  sg: 'https://shopee.sg',
  id: 'https://shopee.co.id',
  my: 'https://shopee.com.my',
  th: 'https://shopee.co.th',
  vn: 'https://shopee.vn',
  ph: 'https://shopee.ph',
};

function getHost() {
  return REGION_HOSTS[REGION] || 'https://partner.shopeemobile.com';
}

function getMarketplaceDomain() {
  return REGION_DOMAINS[REGION] || 'https://shopee.com';
}

function createSignature(path, timestamp) {
  const baseString = `${PARTNER_ID}${path}${timestamp}${ACCESS_TOKEN}${SHOP_ID}`;
  return crypto.createHmac('sha256', PARTNER_KEY).update(baseString).digest('hex');
}

async function performRequest({ path, method = 'GET', params = {}, data = {} }) {
  if (!PARTNER_ID || !PARTNER_KEY || !SHOP_ID) {
    throw new Error('Credenciais da Shopee ausentes. Verifique as variáveis de ambiente.');
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const sign = createSignature(path, timestamp);
  const host = getHost();

  const queryParams = {
    partner_id: PARTNER_ID,
    shop_id: SHOP_ID,
    timestamp,
    sign,
    ...params,
  };

  if (ACCESS_TOKEN) {
    queryParams.access_token = ACCESS_TOKEN;
  }

  const url = new URL(path, host);

  const config = {
    method,
    url: url.toString(),
    params: queryParams,
    data,
    timeout: 15000,
  };

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await axios(config);
      return response.data;
    } catch (error) {
      const status = error.response?.status;
      const message = error.response?.data || error.message;
      console.error(
        `[Shopee API] Falha na tentativa ${attempt} (${method} ${path}) status=${status || 'sem status'} mensagem=`,
        message
      );

      if (status === 429 || status === 503) {
        const delay = attempt * 2000;
        console.warn(`[Shopee API] Aguardando ${delay}ms antes de tentar novamente por causa de limite de taxa.`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      throw error;
    }
  }

  throw new Error('Falha ao comunicar com a Shopee após várias tentativas.');
}

const MAX_PAGE_SIZE = 100;

function sanitiseLimit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 20;
  }
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(parsed)));
}

async function searchItems({ keyword, limit = 20, offset = 0 }) {
  const safeLimit = sanitiseLimit(limit);
  const safeOffset = Math.max(0, Number(offset) || 0);

  const path = '/api/v2/product/search_item';
  const params = {
    keyword,
    limit: safeLimit,
    offset: safeOffset,
  };

  const data = await performRequest({ path, method: 'GET', params });
  const items = Array.isArray(data?.items) ? data.items : [];
  return {
    items,
    hasMore: Boolean(data?.has_more),
    nextOffset:
      typeof data?.next_offset === 'number'
        ? data.next_offset
        : safeOffset + items.length,
    totalCount: typeof data?.total === 'number' ? data.total : data?.total_count,
  };
}

async function generateAffiliateLink({ targetUrl }) {
  if (!targetUrl) {
    throw new Error('targetUrl é obrigatório para gerar link de afiliado');
  }

  if (!AFFILIATE_ID) {
    console.warn('[Shopee API] SHOPEE_AFFILIATE_ID não configurado. Aplicando fallback de tracking.');
    return appendTrackingParams(targetUrl);
  }

  const path = '/api/v2/affiliate/generate_links';
  const payload = {
    affiliate_id: AFFILIATE_ID,
    source: AFF_SOURCE,
    sub_source: AFF_SUB,
    requests: [
      {
        original_link: targetUrl,
        sub_id: AFF_SUB,
        source: AFF_SOURCE,
      },
    ],
  };

  try {
    const data = await performRequest({ path, method: 'POST', data: payload });
    const link = extractAffiliateLink(data);
    if (link) {
      return link;
    }
    console.warn('[Shopee API] Resposta não continha link de afiliado. Aplicando fallback.');
  } catch (error) {
    console.error('[Shopee API] Erro ao gerar link de afiliado. Aplicando fallback.', error.response?.data || error.message);
  }

  return appendTrackingParams(targetUrl);
}

function extractAffiliateLink(responseData) {
  if (!responseData) return null;

  const candidates = [];
  if (Array.isArray(responseData.generate_links)) {
    responseData.generate_links.forEach((entry) => {
      candidates.push(entry.short_link, entry.full_link, entry.aff_link);
    });
  }
  if (Array.isArray(responseData.requests)) {
    responseData.requests.forEach((entry) => {
      candidates.push(entry.short_link, entry.full_link, entry.generated_link);
    });
  }
  if (Array.isArray(responseData.data)) {
    responseData.data.forEach((entry) => {
      candidates.push(entry.short_link, entry.full_link, entry.aff_link);
    });
  }
  if (responseData.aff_link) {
    candidates.push(responseData.aff_link);
  }

  return candidates.find((value) => typeof value === 'string' && value.trim().length > 0) || null;
}

function appendTrackingParams(url) {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set('utm_source', AFF_SOURCE);
    parsed.searchParams.set('utm_campaign', UTM_CAMPAIGN);
    parsed.searchParams.set('aff_sub', AFF_SUB);
    return parsed.toString();
  } catch (error) {
    console.warn('[Shopee API] Não foi possível aplicar parâmetros de tracking, retornando URL original.');
    return url;
  }
}

function buildProductUrl({ shopId, itemId }) {
  const domain = getMarketplaceDomain();
  return `${domain}/product/${shopId}/${itemId}`;
}

async function searchAllItems({ keyword, totalLimit = 20 }) {
  const results = [];
  let offset = 0;
  let keepFetching = true;

  while (keepFetching && results.length < totalLimit) {
    const pageLimit = Math.min(MAX_PAGE_SIZE, totalLimit - results.length);
    const { items, hasMore, nextOffset } = await searchItems({ keyword, limit: pageLimit, offset });
    if (!items.length) {
      break;
    }

    results.push(...items);

    const computedNextOffset = typeof nextOffset === 'number' ? nextOffset : offset + items.length;
    keepFetching = hasMore && computedNextOffset > offset;
    offset = computedNextOffset;
  }

  return results.slice(0, totalLimit);
}

module.exports = {
  searchItems,
  searchAllItems,
  generateAffiliateLink,
  buildProductUrl,
};
