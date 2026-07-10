const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.OFFERS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'publisherworker-test-'));

const store = require('../src/store/jsonStore');
const { publishReadyOffers } = require('../src/telegram/publisherWorker');

test('publishReadyOffers is a no-op when nothing is ready', async () => {
  const publishOffer = async () => {
    throw new Error('should not be called');
  };
  const count = await publishReadyOffers({ publishOffer });
  assert.equal(count, 0);
});

test('publishReadyOffers publishes every eligible offer and marks it publicado', async () => {
  await store.saveOffer({
    platform: 'mercado_livre',
    link_open_check: 'ok',
    affiliate_link: 'https://meli.la/ready1',
    duplicate_of: null,
    publish_status: 'nao_publicado',
    recommended_copy_telegram: 'oferta 1',
    clean_link: 'https://www.mercadolivre.com.br/produto/READY1',
  });
  await store.saveOffer({
    platform: 'mercado_livre',
    link_open_check: 'ok',
    affiliate_link: 'https://meli.la/ready2',
    duplicate_of: null,
    publish_status: 'nao_publicado',
    recommended_copy_telegram: 'oferta 2',
    clean_link: 'https://www.mercadolivre.com.br/produto/READY2',
  });

  const published = [];
  const publishOffer = async (offer) => {
    published.push(offer.id);
  };

  const count = await publishReadyOffers({ publishOffer });

  assert.equal(count, 2);
  assert.equal(published.length, 2);
  store.listOffers().forEach((offer) => {
    if (offer.clean_link.includes('READY')) {
      assert.equal(offer.publish_status, 'publicado');
      assert.ok(offer.published_at);
      assert.equal(offer.published_channel, 'telegram');
    }
  });
});

test('publishReadyOffers marks a failed send as falhou so it gets retried next tick', async () => {
  await store.saveOffer({
    platform: 'mercado_livre',
    link_open_check: 'ok',
    affiliate_link: 'https://meli.la/will-fail',
    duplicate_of: null,
    publish_status: 'nao_publicado',
    recommended_copy_telegram: 'oferta que vai falhar',
    clean_link: 'https://www.mercadolivre.com.br/produto/WILLFAIL',
  });

  const publishOffer = async () => {
    throw new Error('Telegram indisponível');
  };

  await publishReadyOffers({ publishOffer });

  const offer = store.listOffers().find((o) => o.clean_link.includes('WILLFAIL'));
  assert.equal(offer.publish_status, 'falhou');
  assert.ok(!offer.published_at);

  // Still picked up by the eligibility query on the next tick (falhou !== publicado).
  const stillReady = store.listOffersReadyToPublish();
  assert.ok(stillReady.some((o) => o.id === offer.id));
});
