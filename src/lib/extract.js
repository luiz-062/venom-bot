const URL_REGEX = /(https?:\/\/[^\s<>()"]+)/gi;
const PRICE_REGEX = /R\$\s?\d{1,3}(?:\.\d{3})*(?:,\d{2})?/gi;
const COUPON_REGEX = /\b(?:cupom|cupon|código|codigo)\b[:\s]*([A-Z0-9][A-Z0-9\-]{2,19})/i;
const SHIPPING_KEYWORDS = /frete\s*gr[aá]tis[^\n.]*|frete\s*acima\s*de[^\n.]*/gi;

function stripTrailingPunctuation(url) {
  return url.replace(/[.,;:!?)\]"'”’]+$/g, '');
}

function extractUrls(text) {
  const matches = text.match(URL_REGEX) || [];
  return [...new Set(matches.map(stripTrailingPunctuation))];
}

function extractPrices(text) {
  const matches = text.match(PRICE_REGEX) || [];
  if (matches.length === 0) {
    return { priceOriginal: null, priceCurrent: null };
  }
  if (matches.length === 1) {
    return { priceOriginal: matches[0], priceCurrent: matches[0] };
  }
  return { priceOriginal: matches[0], priceCurrent: matches[matches.length - 1] };
}

function extractCoupon(text) {
  const match = text.match(COUPON_REGEX);
  return match ? match[1].toUpperCase() : null;
}

function findShippingMatches(text) {
  return text.match(SHIPPING_KEYWORDS) || [];
}

function extractShippingNotes(shippingMatches) {
  return shippingMatches.length ? shippingMatches.map((m) => m.trim()).join('; ') : null;
}

function guessProductName(text, urls) {
  let working = text;
  urls.forEach((url) => {
    working = working.split(url).join(' ');
  });
  working = working.replace(PRICE_REGEX, ' ').replace(COUPON_REGEX, ' ');

  const lines = working
    .split('\n')
    .map((line) => line.replace(/^[\s\-*•➡️👉🔥🚨✅🛒📦💥]+/u, '').trim())
    .filter((line) => line.length >= 4);

  return lines.length > 0 ? lines[0].slice(0, 140) : null;
}

function buildOtherNotes(text, { urls, priceOriginal, priceCurrent, coupon, shippingNotes, productName }) {
  let working = text;
  urls.forEach((url) => {
    working = working.split(url).join(' ');
  });
  if (priceOriginal) working = working.split(priceOriginal).join(' ');
  if (priceCurrent) working = working.split(priceCurrent).join(' ');
  if (coupon) working = working.replace(COUPON_REGEX, ' ');
  if (shippingNotes) working = working.replace(SHIPPING_KEYWORDS, ' ');
  if (productName) working = working.split(productName).join(' ');

  const cleaned = working
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length >= 3)
    .join(' | ');

  return cleaned.length > 0 ? cleaned.slice(0, 500) : null;
}

/**
 * Extracts structured, objective data from a raw offer message.
 * Never invents a value: any field that cannot be found is returned as null,
 * left for manual completion during review.
 */
function extractOfferData(rawText) {
  const text = String(rawText || '').trim();
  const urls = extractUrls(text);

  const shippingMatches = findShippingMatches(text);
  const shippingNotes = extractShippingNotes(shippingMatches);

  // Prices quoted inside a shipping note (e.g. "frete grátis acima de R$ 79")
  // must not be picked up as the offer's price, so strip those segments first.
  let textForPrices = text;
  shippingMatches.forEach((match) => {
    textForPrices = textForPrices.split(match).join(' ');
  });
  const { priceOriginal, priceCurrent } = extractPrices(textForPrices);

  const coupon = extractCoupon(text);
  const productName = guessProductName(text, urls);
  const otherNotes = buildOtherNotes(text, {
    urls,
    priceOriginal,
    priceCurrent,
    coupon,
    shippingNotes,
    productName,
  });

  return {
    urls,
    productName,
    priceOriginal,
    priceCurrent,
    coupon,
    shippingNotes,
    otherNotes,
  };
}

module.exports = { extractOfferData };
