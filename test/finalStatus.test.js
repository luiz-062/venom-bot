const test = require('node:test');
const assert = require('node:assert/strict');

const { computeFinalStatus } = require('../src/lib/finalStatus');

test('computeFinalStatus: link that fails to open is always rejeitar', () => {
  assert.equal(
    computeFinalStatus({ linkOpenCheck: 'falhou', affiliateValidationStatus: 'confirmado', duplicate: null }),
    'rejeitar'
  );
});

test('computeFinalStatus: link opens but affiliate not confirmed stays revisar', () => {
  assert.equal(
    computeFinalStatus({ linkOpenCheck: 'ok', affiliateValidationStatus: 'nao_confirmado', duplicate: null }),
    'revisar_antes_de_publicar'
  );
  assert.equal(
    computeFinalStatus({ linkOpenCheck: 'ok', affiliateValidationStatus: 'pendente', duplicate: null }),
    'revisar_antes_de_publicar'
  );
});

test('computeFinalStatus: only confirmado + no duplicate + link ok reaches pronto_para_publicar', () => {
  assert.equal(
    computeFinalStatus({ linkOpenCheck: 'ok', affiliateValidationStatus: 'confirmado', duplicate: null }),
    'pronto_para_publicar'
  );
});

test('computeFinalStatus: duplicate keeps it in revisar even if confirmado', () => {
  assert.equal(
    computeFinalStatus({ linkOpenCheck: 'ok', affiliateValidationStatus: 'confirmado', duplicate: { id: 'abc' } }),
    'revisar_antes_de_publicar'
  );
});
