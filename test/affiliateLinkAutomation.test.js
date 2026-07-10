const test = require('node:test');
const assert = require('node:assert/strict');

const {
  runGeneratorFlow,
  isLoginPage,
  generateAffiliateLinkViaBrowser,
} = require('../src/automation/affiliateLinkAutomation');

function makeFakePage({ hasPasswordField = false, hasInput = true, resultHandle = null } = {}) {
  return {
    goto: async () => {},
    $: async (selector) => {
      if (selector.includes('password')) return hasPasswordField ? {} : null;
      if (selector === '[data-testid="affiliate-link-input"], input[name="url"]') return hasInput ? {} : null;
      return null;
    },
    waitForSelector: async (selector) => {
      if (selector.includes('input')) return hasInput ? {} : null;
      return resultHandle;
    },
    fill: async () => {},
    click: async () => {},
  };
}

test('isLoginPage detects a password field as a session-expired signal', async () => {
  assert.equal(await isLoginPage(makeFakePage({ hasPasswordField: true })), true);
  assert.equal(await isLoginPage(makeFakePage({ hasPasswordField: false })), false);
});

test('runGeneratorFlow returns sessao_expirada when the portal redirects to a login page', async () => {
  const page = makeFakePage({ hasPasswordField: true });
  const result = await runGeneratorFlow(page, 'https://www.mercadolivre.com.br/produto/MLB1');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'sessao_expirada');
});

test('runGeneratorFlow returns seletor_nao_encontrado when the input field is missing', async () => {
  const page = makeFakePage({ hasPasswordField: false, hasInput: false });
  const result = await runGeneratorFlow(page, 'https://www.mercadolivre.com.br/produto/MLB1');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'seletor_nao_encontrado');
});

test('runGeneratorFlow returns the generated link on success', async () => {
  const resultHandle = {
    getAttribute: async () => 'https://meli.la/abc123',
    textContent: async () => '',
  };
  const page = makeFakePage({ hasPasswordField: false, hasInput: true, resultHandle });
  const result = await runGeneratorFlow(page, 'https://www.mercadolivre.com.br/produto/MLB1');
  assert.equal(result.ok, true);
  assert.equal(result.affiliateLink, 'https://meli.la/abc123');
});

test('runGeneratorFlow returns timeout when no result and no login page appears', async () => {
  const page = makeFakePage({ hasPasswordField: false, hasInput: true, resultHandle: null });
  const result = await runGeneratorFlow(page, 'https://www.mercadolivre.com.br/produto/MLB1');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'timeout');
});

test('generateAffiliateLinkViaBrowser never throws — classifies unexpected errors instead', async () => {
  const brokenLaunch = async () => {
    throw new Error('boom');
  };
  const result = await generateAffiliateLinkViaBrowser({
    cleanLink: 'https://www.mercadolivre.com.br/produto/MLB1',
    storageStatePath: 'data/ml-storage-state.json',
    launch: brokenLaunch,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'erro_desconhecido');
  assert.match(result.error, /boom/);
});

test('generateAffiliateLinkViaBrowser closes the browser even on failure', async () => {
  let closed = false;
  const fakeBrowser = {
    newContext: async () => ({
      newPage: async () => makeFakePage({ hasPasswordField: true }),
    }),
    close: async () => {
      closed = true;
    },
  };
  const result = await generateAffiliateLinkViaBrowser({
    cleanLink: 'https://www.mercadolivre.com.br/produto/MLB1',
    storageStatePath: 'data/ml-storage-state.json',
    launch: async () => fakeBrowser,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'sessao_expirada');
  assert.equal(closed, true);
});
