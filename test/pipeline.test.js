const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.OFFERS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'offers-test-'));

const { extractOfferData } = require('../src/lib/extract');
const { detectPlatform, stripTrackingParams } = require('../src/lib/linkUtils');
const store = require('../src/store/jsonStore');
const { processOffer } = require('../src/lib/pipeline');

const originalFetch = global.fetch;

function mockFetchAlwaysOk(finalUrl) {
  global.fetch = async (url) => ({
    ok: true,
    status: 200,
    url: finalUrl || url,
    body: { cancel: async () => {} },
  });
}

function mockFetchFails() {
  global.fetch = async () => {
    throw new Error('network unreachable');
  };
}

test.afterEach(() => {
  global.fetch = originalFetch;
});

test('extractOfferData finds link, price range, coupon and shipping notes in a messy message', () => {
  const raw = `🚨🚨 GENTEEEE olha isso
Fone bluetooth XYZ top demais
de R$ 199,90 por R$ 129,90
cupom: FONE10
frete grátis acima de R$ 79
https://www.mercadolivre.com.br/fone-bluetooth-xyz/p/MLB123456?utm_source=grupo`;

  const data = extractOfferData(raw);

  assert.equal(data.urls.length, 1);
  assert.match(data.urls[0], /mercadolivre\.com\.br/);
  assert.equal(data.priceOriginal, 'R$ 199,90');
  assert.equal(data.priceCurrent, 'R$ 129,90');
  assert.equal(data.coupon, 'FONE10');
  assert.match(data.shippingNotes, /frete/i);
  assert.ok(data.productName && data.productName.length > 0);
});

test('extractOfferData ignores installment mentions when picking the offer price', () => {
  const raw = `Panela elétrica
De R$ 399,90 por R$ 249,90
ou 10x de R$ 24,99 sem juros
https://www.mercadolivre.com.br/produto/MLB555`;

  const data = extractOfferData(raw);

  assert.equal(data.priceOriginal, 'R$ 399,90');
  assert.equal(data.priceCurrent, 'R$ 249,90');
});

test('extractOfferData never invents fields that are not present', () => {
  const data = extractOfferData('só um texto qualquer sem link nem preço');
  assert.equal(data.urls.length, 0);
  assert.equal(data.priceCurrent, null);
  assert.equal(data.coupon, null);
  assert.equal(data.shippingNotes, null);
});

test('detectPlatform matches configured Mercado Livre domains and rejects unknown ones', () => {
  const domains = { mercado_livre: ['mercadolivre.com.br'], shopee: ['shopee.com.br'] };
  assert.equal(detectPlatform('https://www.mercadolivre.com.br/produto/x', domains), 'mercado_livre');
  assert.equal(detectPlatform('https://www.shopee.com.br/produto/x', domains), 'shopee');
  assert.equal(detectPlatform('https://www.amazon.com.br/produto/x', domains), null);
});

test('stripTrackingParams removes only generic utm/marketing params when no platform is given', () => {
  const cleaned = stripTrackingParams('https://www.mercadolivre.com.br/p/MLB1?utm_source=grupo&foo=bar');
  assert.doesNotMatch(cleaned, /utm_source/);
  assert.match(cleaned, /foo=bar/);
});

test('stripTrackingParams removes a Mercado Livre affiliate ref/matt_* from another affiliate link', () => {
  // Real link as it appeared shared by another affiliate in a source group.
  const thirdPartyLink =
    'https://www.mercadolivre.com.br/social/ofertasgamer?matt_word=ofertasgamer&matt_tool=97705566&forceInApp=true&ref=BPa%2BHaAA0iiGRngVW7sERnCqpiSfN5%2BG1HS9s12zB9MKquZBVMyIMNfK9%2BmuVOBk8%2BtceIhL7N7pny19TcyBHpiyndSHrBZmkNY94MerO6hlj72H5beQRkGsfus1J4tbFV5iBQBw6fwMJBMQ526Qke%2FGpCc11V3R61h10MdQhOgzrvAZqpyKMnOdiGu0oIR9mO1E1aU%3D&skipInApp=true&matt_ignore=true';

  const cleaned = stripTrackingParams(thirdPartyLink, 'mercado_livre');

  assert.doesNotMatch(cleaned, /matt_word/);
  assert.doesNotMatch(cleaned, /matt_tool/);
  assert.doesNotMatch(cleaned, /[?&]ref=/);
  assert.doesNotMatch(cleaned, /forceInApp/);
  assert.doesNotMatch(cleaned, /skipInApp/);
  assert.doesNotMatch(cleaned, /matt_ignore/);
});

test('processOffer end-to-end: ML link with no affiliate config stays pending and is flagged for review', async () => {
  mockFetchAlwaysOk('https://www.mercadolivre.com.br/produto/MLB999');
  const raw = `Panela elétrica incrível
R$ 249,00
https://www.mercadolivre.com.br/produto/MLB999?utm_campaign=grupo1`;

  const offer = await processOffer(raw);

  assert.equal(offer.platform, 'mercado_livre');
  assert.equal(offer.link_open_check, 'ok');
  assert.equal(offer.affiliate_method, 'pendente_manual');
  assert.equal(offer.affiliate_validation_status, 'pendente');
  assert.equal(offer.final_status, 'revisar_antes_de_publicar');
  assert.equal([offer.copy_version_1, offer.copy_version_2, offer.copy_version_3].filter(Boolean).length, 3);
  assert.notEqual(offer.copy_version_1, raw);
});

test('processOffer: troca_parametro config generates a link but keeps it unconfirmed', async () => {
  mockFetchAlwaysOk('https://www.mercadolivre.com.br/produto/MLB111');
  store.savePlatformConfig('mercado_livre', {
    link_generation_method: 'troca_parametro',
    tracking_param_name: 'ref',
    tracking_param_value: 'meuid123',
    domains: ['mercadolivre.com.br'],
  });

  const raw = 'Mochila boa\nR$ 89,90\nhttps://www.mercadolivre.com.br/produto/MLB111';
  const offer = await processOffer(raw);

  assert.equal(offer.affiliate_method, 'troca_parametro_hipotese');
  assert.equal(offer.affiliate_validation_status, 'nao_confirmado');
  assert.match(offer.affiliate_link, /ref=meuid123/);
  assert.equal(offer.final_status, 'revisar_antes_de_publicar');
});

test('processOffer: URL fragment survives cleaning, but attribution params inside it are still stripped', async () => {
  // fetch() never transmits the URL fragment, so response.url from a real
  // request never includes one — this mocks that real behavior to make sure
  // we don't silently drop non-attribution fragment content while
  // "cleaning" the link, while still scrubbing attribution params (e.g.
  // matt_tool_id) that may appear there instead of in the query string.
  mockFetchAlwaysOk('https://www.mercadolivre.com.br/produto/MLB444');
  store.savePlatformConfig('mercado_livre', { link_generation_method: 'nao_configurado', domains: ['mercadolivre.com.br'] });

  const raw =
    'Relógio bom\nR$ 94,20\nhttps://www.mercadolivre.com.br/produto/MLB444#wid=MLB444&matt_tool_id=123&source=affiliate-profile';
  const offer = await processOffer(raw);

  assert.match(offer.clean_link, /#wid=MLB444&source=affiliate-profile/);
  assert.doesNotMatch(offer.clean_link, /matt_tool_id/);
  assert.match(offer.risks_or_doubts, /fragmento/);
});

test('processOffer: link that fails to open is rejected', async () => {
  mockFetchFails();
  store.savePlatformConfig('mercado_livre', { link_generation_method: 'nao_configurado', domains: ['mercadolivre.com.br'] });

  const raw = 'Produto\nhttps://www.mercadolivre.com.br/produto/MLB222';
  const offer = await processOffer(raw);

  assert.equal(offer.link_open_check, 'falhou');
  assert.equal(offer.final_status, 'rejeitar');
});

test('processOffer: message with no link is rejected without hitting the network', async () => {
  global.fetch = async () => {
    throw new Error('should not be called');
  };
  const offer = await processOffer('promoção incrível mas esqueci de colar o link');
  assert.equal(offer.final_status, 'rejeitar');
  assert.match(offer.risks_or_doubts, /Nenhum link/);
});

test('processOffer: non Mercado Livre link is out of MVP scope and rejected', async () => {
  const offer = await processOffer('Produto bom\nhttps://www.shopee.com.br/produto-123');
  assert.equal(offer.platform, 'shopee');
  assert.equal(offer.final_status, 'rejeitar');
  assert.match(offer.risks_or_doubts, /fora do escopo/);
});

test('processOffer: duplicate clean_link is flagged but not auto-rejected', async () => {
  mockFetchAlwaysOk('https://www.mercadolivre.com.br/produto/MLB333');
  const raw = 'Item repetido\nhttps://www.mercadolivre.com.br/produto/MLB333';

  const first = await processOffer(raw);
  const second = await processOffer(raw);

  assert.equal(second.duplicate_of, first.id);
  assert.match(second.risks_or_doubts, /duplicidade/i);
});

test('processOffer: strips a third-party affiliate ref from the source message before producing clean_link', async () => {
  const thirdPartyLink =
    'https://www.mercadolivre.com.br/social/ofertasgamer?matt_word=ofertasgamer&matt_tool=97705566&forceInApp=true&ref=BPa%2BHaAA0iiGRngVW7sERnCqpiSfN5%2BG1HS9s12zB9MKquZBVMyIMNfK9%2BmuVOBk8%2BtceIhL7N7pny19TcyBHpiyndSHrBZmkNY94MerO6hlj72H5beQRkGsfus1J4tbFV5iBQBw6fwMJBMQ526Qke%2FGpCc11V3R61h10MdQhOgzrvAZqpyKMnOdiGu0oIR9mO1E1aU%3D&skipInApp=true&matt_ignore=true';
  mockFetchAlwaysOk(thirdPartyLink);
  store.savePlatformConfig('mercado_livre', { link_generation_method: 'manual', domains: ['mercadolivre.com.br'] });

  const raw = `Ofertas de teclado mecânico\nR$ 199,90\n${thirdPartyLink}`;
  const offer = await processOffer(raw);

  assert.doesNotMatch(offer.clean_link, /matt_word|matt_tool|[?&]ref=|forceInApp|skipInApp|matt_ignore/);
});

test('processOffer: with multiple URLs, prefers the one matching a configured platform over the first one', async () => {
  mockFetchAlwaysOk('https://www.mercadolivre.com.br/produto/MLB777');
  store.savePlatformConfig('mercado_livre', { link_generation_method: 'manual', domains: ['mercadolivre.com.br'] });

  const raw =
    'Relógio bom\nR$ 79,90\nhttps://bit.ly/rastreio-generico\nhttps://www.mercadolivre.com.br/produto/MLB777';
  const offer = await processOffer(raw);

  assert.equal(offer.platform, 'mercado_livre');
  assert.match(offer.original_link, /mercadolivre\.com\.br/);
});
