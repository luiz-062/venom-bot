const { extractOfferData } = require('./extract');
const { detectPlatform, stripTrackingParams, resolveFinalUrl } = require('./linkUtils');
const { generateAffiliateLink } = require('./affiliateLink');
const { generateCopies } = require('./copyGenerator');
const store = require('../store/jsonStore');

const SUPPORTED_PLATFORMS = ['mercado_livre'];

function buildPlatformDomains() {
  const config = store.getAllPlatformConfig();
  return Object.fromEntries(
    Object.entries(config).map(([platform, cfg]) => [platform, cfg.domains || []])
  );
}

/**
 * Runs the full manual/semi-automatic pipeline for one pasted offer message:
 * extract -> detect platform -> clean/resolve link -> generate affiliate
 * link (with explicit confidence) -> check duplicates -> generate 3 copies
 * -> compute a conservative final status. Persists the result and returns it.
 */
async function processOffer(rawText) {
  const risks = [];
  const extracted = extractOfferData(rawText);

  if (extracted.urls.length === 0) {
    const record = {
      platform: null,
      raw_input: rawText,
      product_name: extracted.productName,
      original_link: null,
      clean_link: null,
      affiliate_link: '',
      affiliate_method: 'pendente_manual',
      affiliate_validation_status: 'pendente',
      link_open_check: 'nao_testado',
      price_informed: extracted.priceCurrent,
      price_original_informed: extracted.priceOriginal,
      coupon_informed: extracted.coupon,
      shipping_notes: extracted.shippingNotes,
      other_notes: extracted.otherNotes,
      risks_or_doubts: 'Nenhum link encontrado na mensagem colada.',
      duplicate_of: null,
      copy_version_1: '',
      copy_version_2: '',
      copy_version_3: '',
      recommended_copy_whatsapp: '',
      recommended_copy_telegram: '',
      final_status: 'rejeitar',
    };
    return store.saveOffer(record);
  }

  const platformDomains = buildPlatformDomains();
  const originalLink = extracted.urls[0];
  const detectedPlatform = detectPlatform(originalLink, platformDomains);

  if (!detectedPlatform || !SUPPORTED_PLATFORMS.includes(detectedPlatform)) {
    risks.push(
      detectedPlatform
        ? `Plataforma "${detectedPlatform}" identificada, mas fora do escopo do MVP (só Mercado Livre por enquanto).`
        : 'Não foi possível identificar a plataforma do link (domínio não reconhecido).'
    );
    const record = {
      platform: detectedPlatform,
      raw_input: rawText,
      product_name: extracted.productName,
      original_link: originalLink,
      clean_link: null,
      affiliate_link: '',
      affiliate_method: 'pendente_manual',
      affiliate_validation_status: 'pendente',
      link_open_check: 'nao_testado',
      price_informed: extracted.priceCurrent,
      price_original_informed: extracted.priceOriginal,
      coupon_informed: extracted.coupon,
      shipping_notes: extracted.shippingNotes,
      other_notes: extracted.otherNotes,
      risks_or_doubts: risks.join(' '),
      duplicate_of: null,
      copy_version_1: '',
      copy_version_2: '',
      copy_version_3: '',
      recommended_copy_whatsapp: '',
      recommended_copy_telegram: '',
      final_status: 'rejeitar',
    };
    return store.saveOffer(record);
  }

  const strippedLink = stripTrackingParams(originalLink);
  const resolution = await resolveFinalUrl(strippedLink);
  const cleanLink = stripTrackingParams(resolution.finalUrl || strippedLink);
  const linkOpenCheck = resolution.ok ? 'ok' : 'falhou';

  if (!resolution.ok) {
    risks.push(
      `O link final não respondeu com sucesso (status ${resolution.status ?? 'desconhecido'}${
        resolution.error ? `, erro: ${resolution.error}` : ''
      }).`
    );
  }

  const platformConfig = store.getPlatformConfig(detectedPlatform);
  const { affiliateLink, affiliateMethod, affiliateValidationStatus } = generateAffiliateLink({
    cleanLink,
    platformConfig,
  });

  if (affiliateValidationStatus !== 'confirmado') {
    risks.push(
      'Link afiliado não tem confirmação oficial de comissão — trate como hipótese até validar no painel oficial da plataforma.'
    );
  }

  const duplicate = store.findDuplicate({ cleanLink, productName: extracted.productName });
  if (duplicate) {
    risks.push(`Possível duplicidade: já existe uma oferta processada em ${duplicate.created_at} (id ${duplicate.id}).`);
  }

  const linkForCopy = affiliateLink || cleanLink;
  const [copy1, copy2, copy3] = generateCopies({
    productName: extracted.productName,
    priceCurrent: extracted.priceCurrent,
    priceOriginal: extracted.priceOriginal,
    coupon: extracted.coupon,
    link: linkForCopy,
  });

  let finalStatus = 'revisar_antes_de_publicar';
  if (linkOpenCheck !== 'ok') {
    finalStatus = 'rejeitar';
  } else if (affiliateValidationStatus === 'confirmado' && !duplicate) {
    finalStatus = 'pronto_para_publicar';
  }

  const record = {
    platform: detectedPlatform,
    raw_input: rawText,
    product_name: extracted.productName,
    original_link: originalLink,
    clean_link: cleanLink,
    affiliate_link: affiliateLink,
    affiliate_method: affiliateMethod,
    affiliate_validation_status: affiliateValidationStatus,
    link_open_check: linkOpenCheck,
    price_informed: extracted.priceCurrent,
    price_original_informed: extracted.priceOriginal,
    coupon_informed: extracted.coupon,
    shipping_notes: extracted.shippingNotes,
    other_notes: extracted.otherNotes,
    risks_or_doubts: risks.join(' ') || null,
    duplicate_of: duplicate ? duplicate.id : null,
    copy_version_1: copy1,
    copy_version_2: copy2,
    copy_version_3: copy3,
    recommended_copy_whatsapp: copy1,
    recommended_copy_telegram: copy1,
    final_status: finalStatus,
  };

  return store.saveOffer(record);
}

module.exports = { processOffer, SUPPORTED_PLATFORMS };
