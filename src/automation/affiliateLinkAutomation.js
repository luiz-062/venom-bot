const { chromium } = require('playwright');

const GERADOR_DE_LINKS_URL = 'https://www.mercadolivre.com.br/l/afiliados-gere-seus-links';
const DEFAULT_TIMEOUT_MS = 30000;

// TODO(setup, real selectors): these three selectors are PLACEHOLDERS — this
// module could not be verified against the real page from this environment
// (no access to a logged-in Mercado Livre session, and the sandbox this was
// written in has no network access to mercadolivre.com.br at all). Once
// data/ml-storage-state.json exists (see scripts/mercadoLivreLogin.js), run:
//
//   npx playwright codegen --load-storage=data/ml-storage-state.json \
//     https://www.mercadolivre.com.br/l/afiliados-gere-seus-links
//
// and replace INPUT_SELECTOR / SUBMIT_SELECTOR / RESULT_SELECTOR below with
// the real ones recorded from your own clicks. Nothing else in this file
// should need to change.
const INPUT_SELECTOR = '[data-testid="affiliate-link-input"], input[name="url"]';
const SUBMIT_SELECTOR = 'button[type="submit"]';
const RESULT_SELECTOR = '[data-testid="generated-link"], a[href*="meli.la"]';

async function isLoginPage(page) {
  const passwordField = await page.$('input[type="password"]');
  return Boolean(passwordField);
}

/**
 * Drives the real "Gerador de Links" flow for one product URL, using an
 * already-open Playwright `page` with a logged-in session. Never throws for
 * expected failure modes — always returns { ok, ... }. Exported separately
 * from generateAffiliateLinkViaBrowser so it can be unit-tested against a
 * fake `page` object without launching a real browser.
 */
async function runGeneratorFlow(page, cleanLink) {
  await page.goto(GERADOR_DE_LINKS_URL, { timeout: DEFAULT_TIMEOUT_MS });

  if (await isLoginPage(page)) {
    return { ok: false, reason: 'sessao_expirada' };
  }

  await page.waitForSelector(INPUT_SELECTOR, { timeout: DEFAULT_TIMEOUT_MS }).catch(() => null);
  const inputHandle = await page.$(INPUT_SELECTOR);
  if (!inputHandle) {
    return { ok: false, reason: 'seletor_nao_encontrado' };
  }

  await page.fill(INPUT_SELECTOR, cleanLink);
  await page.click(SUBMIT_SELECTOR);

  const resultHandle = await page.waitForSelector(RESULT_SELECTOR, { timeout: DEFAULT_TIMEOUT_MS }).catch(() => null);
  if (!resultHandle) {
    if (await isLoginPage(page)) {
      return { ok: false, reason: 'sessao_expirada' };
    }
    return { ok: false, reason: 'timeout' };
  }

  const generatedLink = (await resultHandle.getAttribute('href')) || (await resultHandle.textContent());
  if (!generatedLink || !generatedLink.includes('meli.la')) {
    return { ok: false, reason: 'seletor_nao_encontrado' };
  }

  return { ok: true, affiliateLink: generatedLink.trim() };
}

/**
 * Launches a browser, opens the real Mercado Livre affiliate portal with a
 * previously-saved logged-in session (storageStatePath), and runs the real
 * "Gerador de Links" flow for `cleanLink`. This is the ONLY module that
 * touches Mercado Livre's actual affiliate portal — it does not construct or
 * guess at any link, it submits the real product URL and reads back
 * whatever the portal itself generates (confirmed format: meli.la/<código>).
 *
 * `launch` is injectable (defaults to the real playwright chromium.launch)
 * purely for testability — tests never launch a real browser.
 */
async function generateAffiliateLinkViaBrowser({ cleanLink, storageStatePath, launch = chromium.launch.bind(chromium) }) {
  let browser;
  try {
    browser = await launch({ headless: true });
    const context = await browser.newContext({ storageState: storageStatePath });
    const page = await context.newPage();
    return await runGeneratorFlow(page, cleanLink);
  } catch (error) {
    return { ok: false, reason: 'erro_desconhecido', error: error.message };
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

module.exports = { generateAffiliateLinkViaBrowser, runGeneratorFlow, isLoginPage };
