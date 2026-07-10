// Utilitário — rode com `npm run list-chats` depois do telegram-login.
// Lista seus canais/grupos/conversas com o ID de cada um, pra você escolher
// quais colar em "Canais/grupos-fonte a monitorar" em /config/telegram.
require('dotenv').config();
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');

async function main() {
  const apiId = Number(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH;
  const sessionString = process.env.TELEGRAM_SESSION_STRING;

  if (!apiId || !apiHash || !sessionString) {
    console.error('Rode "npm run telegram-login" primeiro e salve TELEGRAM_SESSION_STRING no .env.');
    process.exitCode = 1;
    return;
  }

  const client = new TelegramClient(new StringSession(sessionString), apiId, apiHash, { connectionRetries: 5 });
  await client.connect();

  const dialogs = await client.getDialogs({ limit: 200 });
  console.log('\nSeus canais/grupos/conversas (nome — ID):\n');
  dialogs.forEach((dialog) => {
    console.log(`${dialog.title || dialog.name || '(sem nome)'} — ${dialog.id}`);
  });
  console.log('\nCopie os IDs dos canais-fonte que quer monitorar para /config/telegram.');

  await client.disconnect();
}

main()
  .catch((error) => {
    console.error('Falha ao listar chats:', error);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
