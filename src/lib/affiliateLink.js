/**
 * Generates (or defers) the affiliate link for a clean product URL, following
 * the safety order defined in docs/nova-versao-mvp-mercadolivre.md section 5:
 *
 *   1. Official/validated platform method (API, panel, official generator) —
 *      no public API exists (research 10/07/2026). The closest thing to
 *      "official" is real browser automation against the actual affiliate
 *      portal — see `link_generation_method = "automatico_navegador"` below
 *      and src/automation/affiliateLinkAutomation.js. That automation does
 *      NOT run inside this function (it's slow and rate-limited on purpose);
 *      this function only marks the offer as waiting for it.
 *   2. Manual (`"manual"`) — the user generates the link themselves in the
 *      portal and pastes it into the offer afterwards. Still the safest
 *      fallback whenever automation isn't configured or fails.
 *   3. Parameter substitution ("troca_parametro") — kept only for backward
 *      compatibility / explicit opt-in. Mercado Livre's own help pages state
 *      that a link which didn't go through their official generator earns no
 *      commission, so this branch should be treated as very likely
 *      non-functional, not merely "unconfirmed" — and some affiliates report
 *      account suspensions tied to non-standard link origins. NOT
 *      recommended; do not build on or extend this method further.
 *   4. If none applies, the item is left pending for manual generation.
 *
 * No method here ever claims `affiliate_validation_status = "confirmado"`.
 * That status can only be set by a human after confirming real commission
 * tracking in the platform's official affiliate panel/report — automating
 * link *generation* is not the same as automating commission *validation*.
 */
function generateAffiliateLink({ cleanLink, platformConfig }) {
  if (!cleanLink) {
    return {
      affiliateLink: '',
      affiliateMethod: 'pendente_manual',
      affiliateValidationStatus: 'pendente',
    };
  }

  const method = platformConfig?.link_generation_method || 'nao_configurado';

  if (method === 'automatico_navegador') {
    // Doesn't touch Playwright here — src/automation/linkGenerationWorker.js
    // picks up offers in this state (via store.listOffersPendingAutomaticLink)
    // and fills in affiliate_link asynchronously, deliberately paced so a
    // burst of incoming messages doesn't queue behind slow browser automation.
    return {
      affiliateLink: '',
      affiliateMethod: 'pendente_automatico',
      affiliateValidationStatus: 'pendente',
    };
  }

  if (method === 'troca_parametro' && platformConfig?.tracking_param_name && platformConfig?.tracking_param_value) {
    try {
      const parsed = new URL(cleanLink);
      parsed.searchParams.set(platformConfig.tracking_param_name, platformConfig.tracking_param_value);
      return {
        affiliateLink: parsed.toString(),
        affiliateMethod: 'troca_parametro_hipotese',
        affiliateValidationStatus: 'nao_confirmado',
      };
    } catch (error) {
      return {
        affiliateLink: '',
        affiliateMethod: 'pendente_manual',
        affiliateValidationStatus: 'pendente',
      };
    }
  }

  return {
    affiliateLink: '',
    affiliateMethod: 'pendente_manual',
    affiliateValidationStatus: 'pendente',
  };
}

module.exports = { generateAffiliateLink };
