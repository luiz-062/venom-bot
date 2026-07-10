const store = require('../store/jsonStore');
const { publishOffer: defaultPublishOffer } = require('./publisher');

const IDLE_DELAY_MS = 30 * 1000;
const NEXT_BATCH_DELAY_MS = 30 * 1000;

/**
 * Publishes every offer currently ready (see store.listOffersReadyToPublish
 * — link opens, has an affiliate link, not a known duplicate, not already
 * published). This is NOT the same as "commission confirmed" — that status
 * stays human-only, see docs/nova-versao-mvp-mercadolivre.md. Exported
 * separately from start() so it's unit-testable without any real timer.
 */
async function publishReadyOffers({ publishOffer }) {
  const ready = store.listOffersReadyToPublish();
  for (const offer of ready) {
    try {
      await publishOffer(offer);
      await store.updateOffer(offer.id, {
        publish_status: 'publicado',
        published_at: new Date().toISOString(),
        published_channel: 'telegram',
      });
    } catch (error) {
      console.error('[publisherWorker] falha ao publicar oferta', offer.id, error.message);
      // publish_status: 'falhou' still isn't 'publicado', so
      // listOffersReadyToPublish() picks it up again on the next tick.
      await store.updateOffer(offer.id, { publish_status: 'falhou' });
    }
  }
  return ready.length;
}

/**
 * Starts the background publisher poller. Not auto-run on require — call
 * start() explicitly (see src/index.js).
 */
function start({ publishOffer = defaultPublishOffer } = {}) {
  let stopped = false;
  let timeoutHandle = null;

  function scheduleNext(delayMs) {
    if (stopped) return;
    timeoutHandle = setTimeout(tick, delayMs); // eslint-disable-line no-use-before-define
  }

  async function tick() {
    if (stopped) return;
    const appConfig = store.getAppConfig();

    if (!appConfig.telegram.auto_publish_enabled) {
      scheduleNext(IDLE_DELAY_MS);
      return;
    }

    const published = await publishReadyOffers({ publishOffer });
    scheduleNext(published > 0 ? NEXT_BATCH_DELAY_MS : IDLE_DELAY_MS);
  }

  scheduleNext(0);

  return {
    stop() {
      stopped = true;
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    },
  };
}

module.exports = { start, publishReadyOffers };
