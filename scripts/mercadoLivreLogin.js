// Passo único de configuração — rode com `npm run ml-login`, numa máquina
// com tela (não funciona num servidor sem interface gráfica). Abre um
// navegador de verdade pra você logar normalmente na sua conta de afiliado
// do Mercado Livre (incluindo qualquer confirmação por QR code/2FA), e
// salva a sessão pra src/automation/affiliateLinkAutomation.js reaproveitar.
require('dotenv').config();
const path = require('path');
const readline = require('readline');
const { chromium } = require('playwright');

function waitForEnter(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, () => {
      rl.close();
      resolve();
    });
  });
}

async function main() {
  const storageStatePath =
    process.env.ML_STORAGE_STATE_PATH || path.join(__dirname, '..', 'data', 'ml-storage-state.json');

  console.log('Abrindo um navegador de verdade — faça login normalmente na sua conta do Mercado Livre,');
  console.log('incluindo qualquer confirmação por QR code ou segundo fator que for pedida.');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('https://www.mercadolivre.com.br/l/afiliados-home');

  await waitForEnter(
    '\nDepois de terminar o login e ver o painel de afiliados carregado, volte aqui e aperte Enter... '
  );

  await context.storageState({ path: storageStatePath });
  console.log(`Sessão salva em ${storageStatePath}`);
  console.log('Se ainda não estiver, confirme que ML_STORAGE_STATE_PATH aponta pra esse caminho no seu .env.');

  await browser.close();
}

main()
  .catch((error) => {
    console.error('Falha ao salvar a sessão:', error);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
