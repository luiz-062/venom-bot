const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.OFFERS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'jsonstore-test-'));

const store = require('../src/store/jsonStore');

test('getAppConfig returns sane defaults on first access', () => {
  const config = store.getAppConfig();
  assert.deepEqual(config.telegram.source_chat_ids, []);
  assert.equal(config.telegram.auto_publish_enabled, true);
  assert.equal(config.mercado_livre_automation.auto_generate_enabled, true);
  assert.equal(config.mercado_livre_automation.min_delay_seconds, 45);
});

test('saveAppConfig merges per-section instead of replacing the whole object', async () => {
  await store.saveAppConfig({ telegram: { publish_channel_id: '-100999' } });
  const config = store.getAppConfig();

  assert.equal(config.telegram.publish_channel_id, '-100999');
  // untouched sibling field inside the same section must survive
  assert.equal(config.telegram.auto_publish_enabled, true);
  // untouched sibling section must survive
  assert.equal(config.mercado_livre_automation.auto_generate_enabled, true);
});

test('listOffersPendingAutomaticLink only returns mercado_livre offers waiting on the browser worker', async () => {
  await store.saveOffer({
    platform: 'mercado_livre',
    affiliate_method: 'pendente_automatico',
    affiliate_link: '',
    clean_link: 'https://www.mercadolivre.com.br/produto/A',
  });
  await store.saveOffer({
    platform: 'mercado_livre',
    affiliate_method: 'pendente_manual',
    affiliate_link: '',
    clean_link: 'https://www.mercadolivre.com.br/produto/B',
  });
  await store.saveOffer({
    platform: 'mercado_livre',
    affiliate_method: 'pendente_automatico',
    affiliate_link: 'https://meli.la/already-generated',
    clean_link: 'https://www.mercadolivre.com.br/produto/C',
  });

  const pending = store.listOffersPendingAutomaticLink();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].clean_link, 'https://www.mercadolivre.com.br/produto/A');
});

test('listOffersReadyToPublish requires an open link, a non-empty affiliate link, no duplicate, and not already published', async () => {
  await store.saveOffer({
    platform: 'mercado_livre',
    link_open_check: 'ok',
    affiliate_link: 'https://meli.la/ready',
    duplicate_of: null,
    publish_status: 'nao_publicado',
    clean_link: 'https://www.mercadolivre.com.br/produto/READY',
  });
  await store.saveOffer({
    platform: 'mercado_livre',
    link_open_check: 'falhou',
    affiliate_link: 'https://meli.la/broken-link',
    duplicate_of: null,
    publish_status: 'nao_publicado',
    clean_link: 'https://www.mercadolivre.com.br/produto/BROKEN',
  });
  await store.saveOffer({
    platform: 'mercado_livre',
    link_open_check: 'ok',
    affiliate_link: '',
    duplicate_of: null,
    publish_status: 'nao_publicado',
    clean_link: 'https://www.mercadolivre.com.br/produto/NOLINK',
  });
  await store.saveOffer({
    platform: 'mercado_livre',
    link_open_check: 'ok',
    affiliate_link: 'https://meli.la/dup',
    duplicate_of: 'some-other-id',
    publish_status: 'nao_publicado',
    clean_link: 'https://www.mercadolivre.com.br/produto/DUP',
  });
  await store.saveOffer({
    platform: 'mercado_livre',
    link_open_check: 'ok',
    affiliate_link: 'https://meli.la/already-published',
    duplicate_of: null,
    publish_status: 'publicado',
    clean_link: 'https://www.mercadolivre.com.br/produto/PUBLISHED',
  });

  const ready = store.listOffersReadyToPublish();
  assert.equal(ready.length, 1);
  assert.equal(ready[0].clean_link, 'https://www.mercadolivre.com.br/produto/READY');
});
