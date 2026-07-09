// Generic marketing/tracking params that are safe to strip from almost any link.
// Deliberately conservative: platform-specific tracking parameters are NOT
// stripped here because we don't know (and must not assume) which ones the
// Mercado Livre affiliate program relies on for attribution. Confirm with the
// platform's official documentation/panel before expanding this list.
const GENERIC_TRACKING_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
  'gclid',
  'igshid',
];

const REQUEST_TIMEOUT_MS = 8000;
const USER_AGENT = 'Mozilla/5.0 (compatible; OfferReviewBot/0.1; +manual-review-tool)';

function detectPlatform(url, platformDomains) {
  let hostname;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch (error) {
    return null;
  }

  for (const [platform, domains] of Object.entries(platformDomains)) {
    if (domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))) {
      return platform;
    }
  }
  return null;
}

function stripTrackingParams(url) {
  try {
    const parsed = new URL(url);
    GENERIC_TRACKING_PARAMS.forEach((param) => parsed.searchParams.delete(param));
    return parsed.toString();
  } catch (error) {
    return url;
  }
}

/**
 * Follows redirects for the given URL and reports whether the final
 * destination responds successfully. This is the MVP's *only* validation:
 * it proves the link is reachable, nothing more. It does NOT confirm price,
 * stock, coupon validity, shipping, seller trustworthiness, or — critically —
 * that any affiliate/commission tracking parameter survived the redirect.
 */
async function resolveFinalUrl(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT },
    });
    if (response.body && typeof response.body.cancel === 'function') {
      response.body.cancel().catch(() => {});
    }
    return {
      ok: response.ok,
      status: response.status,
      finalUrl: response.url || url,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      finalUrl: url,
      error: error.name === 'AbortError' ? 'timeout' : error.message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { detectPlatform, stripTrackingParams, resolveFinalUrl };
