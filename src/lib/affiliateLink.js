/**
 * Generates (or defers) the affiliate link for a clean product URL, following
 * the safety order defined in docs/nova-versao-mvp-mercadolivre.md section 5:
 *
 *   1. Official/validated platform method (API, panel, official generator) —
 *      NOT implemented here. Research (10/07/2026, see section 5) found no
 *      public API for Mercado Livre affiliate link generation; the only
 *      confirmed mechanism is manual, via the affiliate portal's "Gerador de
 *      Links" or "Barra de afiliados". Configure `link_generation_method =
 *      "manual"` (the default) and paste that generated link per offer.
 *   2. Parameter substitution ("troca_parametro") — kept only for backward
 *      compatibility / explicit opt-in. Mercado Livre's own help pages state
 *      that a link which didn't go through their official generator earns no
 *      commission, so this branch should be treated as very likely
 *      non-functional, not merely "unconfirmed" — and some affiliates report
 *      account suspensions tied to non-standard link origins. NOT
 *      recommended; do not build on or extend this method further.
 *   3. If neither applies, the item is left pending for manual generation.
 *
 * No method here ever claims `affiliate_validation_status = "confirmado"`.
 * That status can only be set by a human after confirming real commission
 * tracking in the platform's official affiliate panel/report.
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
