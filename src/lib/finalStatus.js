/**
 * Single source of truth for the offer's final_status, shared between
 * pipeline.js (computed right after an offer is first processed) and
 * src/automation/linkGenerationWorker.js (recomputed after the browser
 * automation fills in affiliate_link asynchronously). Keeping this in one
 * place avoids the two call sites drifting apart over time.
 *
 * Note: `affiliateValidationStatus === 'confirmado'` is never set by any
 * automated code path in this project — only a human can set it, after
 * confirming a real commission in the platform's own affiliate panel. So in
 * practice this function currently never returns 'pronto_para_publicar';
 * every offer that opens successfully lands in 'revisar_antes_de_publicar'.
 */
function computeFinalStatus({ linkOpenCheck, affiliateValidationStatus, duplicate }) {
  if (linkOpenCheck !== 'ok') {
    return 'rejeitar';
  }
  if (affiliateValidationStatus === 'confirmado' && !duplicate) {
    return 'pronto_para_publicar';
  }
  return 'revisar_antes_de_publicar';
}

module.exports = { computeFinalStatus };
