const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.OFFERS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'linkgen-worker-test-'));

const store = require('../src/store/jsonStore');
const { processOneOffer, randomDelayMs } = require('../src/automation/linkGenerationWorker');

function alwaysSucceeds(link) {
  return async () => ({ ok: true, affiliateLink: link });
}
function alwaysFails(reason) {
  return async () => ({ ok: false, reason });
}

test('randomDelayMs stays within the given bounds (and tolerates swapped min/max)', () => {
  for (let i = 0; i < 50; i += 1) {
    const ms = randomDelayMs(45, 120);
    assert.ok(ms >= 45000 && ms <= 120000, `expected 45000-120000, got ${ms}`);
  }
  const swapped = randomDelayMs(120, 45);
  assert.ok(swapped >= 45000 && swapped <= 120000);
});

test('processOneOffer: success fills in the real link and recomputes final_status', async () => {
  const offer = await store.saveOffer({
    platform: 'mercado_livre',
    affiliate_method: 'pendente_automatico',
    affiliate_link: '',
    link_open_check: 'ok',
    duplicate_of: null,
    clean_link: 'https://www.mercadolivre.com.br/produto/A',
  });

  await processOneOffer({
    offer,
    generate: alwaysSucceeds('https://meli.la/generated123'),
    sendAlert: async () => {},
    storageStatePath: 'data/ml-storage-state.json',
  });

  const updated = store.getOffer(offer.id);
  assert.equal(updated.affiliate_link, 'https://meli.la/generated123');
  assert.equal(updated.affiliate_method, 'automatico_navegador');
  assert.equal(updated.affiliate_validation_status, 'nao_confirmado');
  assert.equal(updated.final_status, 'revisar_antes_de_publicar');
});

test('processOneOffer: sessao_expirada falls back to manual and triggers one alert', async () => {
  const offer = await store.saveOffer({
    platform: 'mercado_livre',
    affiliate_method: 'pendente_automatico',
    affiliate_link: '',
    link_open_check: 'ok',
    duplicate_of: null,
    clean_link: 'https://www.mercadolivre.com.br/produto/B',
  });

  let alertCount = 0;
  const sendAlert = async () => {
    alertCount += 1;
  };

  await processOneOffer({ offer, generate: alwaysFails('sessao_expirada'), sendAlert, storageStatePath: 'x' });
  const updated = store.getOffer(offer.id);
  assert.equal(updated.affiliate_method, 'pendente_manual');
  assert.match(updated.risks_or_doubts, /sessão salva do mercado livre expirou/i);
  assert.equal(alertCount, 1);

  // A second consecutive session-expired failure within the cooldown window
  // must NOT alert again (avoid spamming while broken).
  const offer2 = await store.saveOffer({
    platform: 'mercado_livre',
    affiliate_method: 'pendente_automatico',
    affiliate_link: '',
    link_open_check: 'ok',
    duplicate_of: null,
    clean_link: 'https://www.mercadolivre.com.br/produto/B2',
  });
  await processOneOffer({ offer: offer2, generate: alwaysFails('sessao_expirada'), sendAlert, storageStatePath: 'x' });
  assert.equal(alertCount, 1);
});

test('processOneOffer: transient failures increment attempts without giving up early', async () => {
  const offer = await store.saveOffer({
    platform: 'mercado_livre',
    affiliate_method: 'pendente_automatico',
    affiliate_link: '',
    link_open_check: 'ok',
    duplicate_of: null,
    automation_attempts: 0,
    clean_link: 'https://www.mercadolivre.com.br/produto/C',
  });

  await processOneOffer({ offer, generate: alwaysFails('timeout'), sendAlert: async () => {}, storageStatePath: 'x' });
  let updated = store.getOffer(offer.id);
  assert.equal(updated.automation_attempts, 1);
  assert.equal(updated.affiliate_method, 'pendente_automatico'); // still eligible for retry

  await processOneOffer({ offer: updated, generate: alwaysFails('timeout'), sendAlert: async () => {}, storageStatePath: 'x' });
  updated = store.getOffer(offer.id);
  assert.equal(updated.automation_attempts, 2);
  assert.equal(updated.affiliate_method, 'pendente_automatico');
});

test('processOneOffer: gives up and falls back to manual after 3 consecutive failures', async () => {
  let offer = await store.saveOffer({
    platform: 'mercado_livre',
    affiliate_method: 'pendente_automatico',
    affiliate_link: '',
    link_open_check: 'ok',
    duplicate_of: null,
    automation_attempts: 0,
    clean_link: 'https://www.mercadolivre.com.br/produto/D',
  });

  for (let i = 0; i < 3; i += 1) {
    await processOneOffer({ offer, generate: alwaysFails('timeout'), sendAlert: async () => {}, storageStatePath: 'x' });
    offer = store.getOffer(offer.id);
  }

  assert.equal(offer.automation_attempts, 3);
  assert.equal(offer.affiliate_method, 'pendente_manual');
  assert.match(offer.risks_or_doubts, /falhou 3 vezes/i);
});
