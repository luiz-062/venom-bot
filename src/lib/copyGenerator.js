const TEMPLATES = [
  ({ productName, priceLine, couponLine, link }) =>
    `🚨 achei isso aqui e vim correndo avisar\n${productName}\n${priceLine}\n${couponLine}👉 ${link}`,
  ({ productName, priceLine, couponLine, link }) =>
    `psiu, olha o preço disso 👀\n${productName}\n${priceLine}\n${couponLine}bora? ${link}`,
  ({ productName, priceLine, couponLine, link }) =>
    `${productName} — e olha o preço 😳\n${priceLine}\n${couponLine}${link}`,
  ({ productName, priceLine, couponLine, link }) =>
    `confesso que quase comprei só de ver o preço 🤭\n${productName}\n${priceLine}\n${couponLine}corre: ${link}`,
  ({ productName, priceLine, couponLine, link }) =>
    `achado do dia 🔥\n${productName}\n${priceLine}\n${couponLine}${link}`,
  ({ productName, priceLine, couponLine, link }) =>
    `não prometo que ainda vai ter estoque amanhã 😅\n${productName}\n${priceLine}\n${couponLine}${link}`,
];

function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildPriceLine({ priceCurrent, priceOriginal }) {
  if (!priceCurrent) {
    return '💰 preço a confirmar no link';
  }
  if (priceOriginal && priceOriginal !== priceCurrent) {
    return `💰 de ${priceOriginal} por ${priceCurrent}`;
  }
  return `💰 ${priceCurrent}`;
}

/**
 * Generates 3 short, informal, original copy variants from extracted offer
 * data. Never reuses sentences from the original source message — only the
 * objective fields (product name, price, coupon) feed the templates.
 */
function generateCopies({ productName, priceCurrent, priceOriginal, coupon, link }) {
  const safeProductName = productName || 'olha essa oferta';
  const priceLine = buildPriceLine({ priceCurrent, priceOriginal });
  const couponLine = coupon ? `🎟️ cupom: ${coupon}\n` : '';
  const safeLink = link || '(link ainda pendente de geração)';

  const chosenTemplates = shuffle(TEMPLATES).slice(0, 3);
  return chosenTemplates.map((template) =>
    template({ productName: safeProductName, priceLine, couponLine, link: safeLink })
  );
}

module.exports = { generateCopies };
