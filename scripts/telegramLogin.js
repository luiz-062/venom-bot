// Passo único de configuração — rode com `npm run telegram-login`.
// Loga na SUA conta pessoal do Telegram (não é um bot) via GramJS, e
// imprime uma "sessão" reutilizável pra colar no .env. Sem isso o
// sourceReader (leitura automática dos canais-fonte) não tem como funcionar
// — ver docs/nova-versao-mvp-mercadolivre.md.
require('dotenv').config();
const readline = require('readline');
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  const apiId = Number(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH;

  if (!apiId || !apiHash) {
    console.error('Defina TELEGRAM_API_ID e TELEGRAM_API_HASH no .env antes de rodar este script.');
    console.error('Crie um app em https://my.telegram.org para conseguir esses valores.');
    process.exitCode = 1;
    return;
  }

  const client = new TelegramClient(new StringSession(''), apiId, apiHash, { connectionRetries: 5 });

  console.log('Conectando ao Telegram...');
  await client.start({
    phoneNumber: () => ask('Seu número de telefone (com código do país, ex: +5511999999999): '),
    password: () => ask('Senha de dois fatores (se tiver; aperte Enter se não tiver): '),
    phoneCode: () => ask('Código recebido no Telegram: '),
    onError: (err) => console.error('Erro no login:', err.message || err),
  });

  const sessionString = client.session.save();
  console.log('\nLogin feito com sucesso!');
  console.log('Copie a linha abaixo para o seu .env:\n');
  console.log(`TELEGRAM_SESSION_STRING=${sessionString}\n`);
  console.log('Guarde essa string com segurança — ela dá acesso total à sua conta do Telegram, igual uma senha.');

  await client.disconnect();
}

main()
  .catch((error) => {
    console.error('Falha no login:', error);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
