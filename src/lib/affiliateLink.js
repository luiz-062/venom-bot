/**
 * Generates (or defers) the affiliate link for a clean product URL, following
 * the safety order defined in docs/nova-versao-mvp-mercadolivre.md section 5:
 *
 *   1. Official/validated platform method (API, panel, official generator) —
 *      NOT implemented here because no confirmed official mechanism has been
 *      wired in yet. Configure `link_generation_method = "manual"` until one
 *      is confirmed and implemented.
 *   2. Parameter substitution — only ever treated as an unverified hypothesis.
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
