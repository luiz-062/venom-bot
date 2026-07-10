const store = require('../store/jsonStore');
const { computeFinalStatus } = require('../lib/finalStatus');
const { generateAffiliateLinkViaBrowser: defaultGenerate } = require('./affiliateLinkAutomation');

const IDLE_DELAY_MS = 30 * 1000;
const MAX_CONSECUTIVE_FAILURES = 3;
const SESSION_ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6h, avoids spamming an alert every tick while the session stays broken

function randomDelayMs(minSeconds, maxSeconds) {
  const min = Math.min(minSeconds, maxSeconds);
  const max = Math.max(minSeconds, maxSeconds);
  const seconds = min + Math.random() * (max - min);
  return Math.round(seconds * 1000);
}

// Lazily required (not at module load) so this file has no hard dependency
// on telegram/publisher.js existing/connecting just to be required — the
// browser-automation logic and the publishing logic are independent concerns.
async function defaultSendAlert(text) {
  const { sendAlert } = require('../telegram/publisher');
  return sendAlert(text);
}

function appendRisk(existingRisks, newRisk) {
  return [existingRisks, newRisk].filter(Boolean).join(' ');
}

async function maybeAlertSessionExpired({ sendAlert }) {
  const appConfig = store.getAppConfig();
  const lastAlertAt = appConfig.telegram.last_session_expired_alert_at;
  const now = Date.now();
  if (lastAlertAt && now - new Date(lastAlertAt).getTime() < SESSION_ALERT_COOLDOWN_MS) {
    return;
  }

  await store.saveAppConfig({ telegram: { last_session_expired_alert_at: new Date().toISOString() } });
  try {
    await sendAlert(
      'A sessão salva do Mercado Livre parece ter expirado — a geração automática de link caiu para manual até você rodar "node scripts/mercadoLivreLogin.js" de novo.'
    );
  } catch (error) {
    console.error('[linkGenerationWorker] falha ao enviar alerta de sessão expirada:', error.message);
  }
}

/**
 * Processes exactly one pending offer: calls the (injected) browser
 * automation, then updates the offer accordingly. Never lets a single
 * failure crash the caller — every branch resolves normally. Exported
 * separately from start() so this is fully unit-testable without any timer
 * or real Playwright/Telegram involved.
 */
async function processOneOffer({ offer, generate, sendAlert, storageStatePath }) {
  const result = await generate({ cleanLink: offer.clean_link, storageStatePath });

  if (result.ok) {
    const affiliateValidationStatus = 'nao_confirmado';
    const finalStatus = computeFinalStatus({
      linkOpenCheck: offer.link_open_check,
      affiliateValidationStatus,
      duplicate: offer.duplicate_of ? { id: offer.duplicate_of } : null,
    });
    return store.updateOffer(offer.id, {
      affiliate_link: result.affiliateLink,
      affiliate_method: 'automatico_navegador',
      affiliate_validation_status: affiliateValidationStatus,
      final_status: finalStatus,
    });
  }

  if (result.reason === 'sessao_expirada') {
    await maybeAlertSessionExpired({ sendAlert });
    return store.updateOffer(offer.id, {
      affiliate_method: 'pendente_manual',
      affiliate_validation_status: 'pendente',
      risks_or_doubts: appendRisk(
        offer.risks_or_doubts,
        'Sessão salva do Mercado Livre expirou — gere o link manualmente por enquanto.'
      ),
    });
  }

  const attempts = (offer.automation_attempts || 0) + 1;
  if (attempts >= MAX_CONSECUTIVE_FAILURES) {
    return store.updateOffer(offer.id, {
      affiliate_method: 'pendente_manual',
      affiliate_validation_status: 'pendente',
      automation_attempts: attempts,
      risks_or_doubts: appendRisk(
        offer.risks_or_doubts,
        `Geração automática de link falhou ${attempts} vezes seguidas (${result.reason}) — gere o link manualmente.`
      ),
    });
  }

  return store.updateOffer(offer.id, { automation_attempts: attempts });
}

/**
 * Starts the background poller: one pending Mercado Livre offer at a time,
 * with a randomized delay between generations (config in app-config.json,
 * default 45-120s) so this doesn't look like scripted/bulk activity to
 * Mercado Livre. Not auto-run on require — call start() explicitly (see
 * src/index.js). Returns { stop() } so it can be torn down cleanly.
 */
function start({
  generate = defaultGenerate,
  sendAlert = defaultSendAlert,
  storageStatePath = process.env.ML_STORAGE_STATE_PATH || 'data/ml-storage-state.json',
} = {}) {
  let stopped = false;
  let timeoutHandle = null;

  function scheduleNext(delayMs) {
    if (stopped) return;
    timeoutHandle = setTimeout(tick, delayMs); // eslint-disable-line no-use-before-define
  }

  async function tick() {
    if (stopped) return;
    const appConfig = store.getAppConfig();

    if (!appConfig.mercado_livre_automation.auto_generate_enabled) {
      scheduleNext(IDLE_DELAY_MS);
      return;
    }

    const pending = store.listOffersPendingAutomaticLink();
    if (pending.length === 0) {
      scheduleNext(IDLE_DELAY_MS);
      return;
    }

    // listOffers() sorts newest-first, so the last pending entry is the oldest.
    const offer = pending[pending.length - 1];
    try {
      await processOneOffer({ offer, generate, sendAlert, storageStatePath });
    } catch (error) {
      console.error('[linkGenerationWorker] erro inesperado processando oferta', offer.id, error);
    }

    const { min_delay_seconds: min, max_delay_seconds: max } = appConfig.mercado_livre_automation;
    scheduleNext(randomDelayMs(min, max));
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

module.exports = { start, processOneOffer, randomDelayMs };
