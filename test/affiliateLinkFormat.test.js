const test = require('node:test');
const assert = require('node:assert/strict');

const { detectAffiliateLinkFormat } = require('../src/lib/affiliateLinkFormat');

test('detectAffiliateLinkFormat recognizes a meli.la short link', () => {
  const result = detectAffiliateLinkFormat('https://meli.la/2uKnPsd');
  assert.equal(result.format, 'meli_la_short');
  assert.equal(result.detectedMattWord, null);
  assert.equal(result.detectedMattTool, null);
});

test('detectAffiliateLinkFormat extracts matt_word/matt_tool from the query string', () => {
  const thirdPartyLink =
    'https://www.mercadolivre.com.br/social/ofertasgamer?matt_word=ofertasgamer&matt_tool=97705566&forceInApp=true&ref=BPa%2BHaAA0iiGRngVW7sERnCqpiSfN5%2BG1HS9s12zB9MKquZBVMyIMNfK9%2BmuVOBk8%2BtceIhL7N7pny19TcyBHpiyndSHrBZmkNY94MerO6hlj72H5beQRkGsfus1J4tbFV5iBQBw6fwMJBMQ526Qke%2FGpCc11V3R61h10MdQhOgzrvAZqpyKMnOdiGu0oIR9mO1E1aU%3D&skipInApp=true&matt_ignore=true';

  const result = detectAffiliateLinkFormat(thirdPartyLink);
  assert.equal(result.format, 'long_form_matt');
  assert.equal(result.detectedMattWord, 'ofertasgamer');
  assert.equal(result.detectedMattTool, '97705566');
});

test('detectAffiliateLinkFormat extracts matt_word/matt_tool from the URL fragment', () => {
  const result = detectAffiliateLinkFormat(
    'https://www.mercadolivre.com.br/produto/MLB444#wid=MLB444&matt_word=meuword&matt_tool=555&source=affiliate-profile'
  );
  assert.equal(result.format, 'long_form_matt');
  assert.equal(result.detectedMattWord, 'meuword');
  assert.equal(result.detectedMattTool, '555');
});

test('detectAffiliateLinkFormat recognizes a speculative "tag" param when no matt_* is present', () => {
  const result = detectAffiliateLinkFormat('https://www.mercadolivre.com.br/produto/MLB999?tag=meunome-20');
  assert.equal(result.format, 'long_form_tag');
  assert.equal(result.detectedTag, 'meunome-20');
});

test('detectAffiliateLinkFormat returns desconhecido for a plain product link', () => {
  const result = detectAffiliateLinkFormat('https://www.mercadolivre.com.br/produto/MLB111');
  assert.equal(result.format, 'desconhecido');
});

test('detectAffiliateLinkFormat returns invalido for garbage or empty input', () => {
  assert.equal(detectAffiliateLinkFormat('não é um link').format, 'invalido');
  assert.equal(detectAffiliateLinkFormat('').format, 'invalido');
});
